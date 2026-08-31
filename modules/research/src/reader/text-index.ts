import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { PageTextPosition } from '../contract.js';

const require = createRequire(import.meta.url);
const pdfjsPackage = require('pdfjs-dist/package.json') as { version: string };

export const TEXT_INDEX_PARSER_VERSION = `pdfjs-${pdfjsPackage.version}:text-v1`;

export interface ExtractedPageText {
  pageNumber: number;
  pageSize: { width: number; height: number };
  text: string;
  positions: PageTextPosition[];
}

export interface PageTextExtractionOptions {
  filePath: string;
  startPage: number;
  priorityPage: number | null;
  signal: AbortSignal;
  onMetadata: (totalPages: number) => Promise<void> | void;
  onPage: (page: ExtractedPageText, totalPages: number) => Promise<void> | void;
}

export interface PageTextExtractor {
  extract(options: PageTextExtractionOptions): Promise<void>;
}

export class TextIndexExtractionError extends Error {
  constructor(
    message: string,
    readonly code: 'TEXT_INDEX_ABORTED' | 'TEXT_INDEX_PDF_FAILED' | 'TEXT_INDEX_PROTOCOL_FAILED',
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'TextIndexExtractionError';
  }
}

interface WorkerMetadata {
  type: 'metadata';
  totalPages: number;
  pdfjsVersion: string;
}

interface WorkerPage extends ExtractedPageText {
  type: 'page';
}

interface WorkerDone {
  type: 'done';
}

type WorkerMessage = WorkerMetadata | WorkerPage | WorkerDone;

function kill(child: ChildProcess): void {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

function abortError(): TextIndexExtractionError {
  return new TextIndexExtractionError('正文索引已停止', 'TEXT_INDEX_ABORTED');
}

function parseMessage(line: string): WorkerMessage {
  const parsed = JSON.parse(line) as Partial<WorkerMessage>;
  if (parsed.type === 'metadata' && Number.isInteger(parsed.totalPages) && parsed.totalPages! > 0) {
    return parsed as WorkerMetadata;
  }
  if (
    parsed.type === 'page' &&
    Number.isInteger(parsed.pageNumber) &&
    parsed.pageNumber! > 0 &&
    typeof parsed.text === 'string' &&
    typeof parsed.pageSize === 'object' &&
    parsed.pageSize !== null &&
    Array.isArray(parsed.positions)
  ) {
    return parsed as WorkerPage;
  }
  if (parsed.type === 'done') return { type: 'done' };
  throw new Error('worker message shape is invalid');
}

export class PdfJsPageTextExtractor implements PageTextExtractor {
  constructor(
    private readonly workerPath = fileURLToPath(
      new URL('./text-index-worker.mjs', import.meta.url),
    ),
    private readonly maxLineBytes = 16 * 1024 * 1024,
  ) {}

  async extract(options: PageTextExtractionOptions): Promise<void> {
    if (options.signal.aborted) throw abortError();
    const child = spawn(
      process.execPath,
      [
        this.workerPath,
        options.filePath,
        String(options.startPage),
        String(options.priorityPage ?? options.startPage),
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    );
    let stderr = '';
    let totalPages = 0;
    let done = false;
    const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => resolve({ code, signal }));
      },
    );
    const onAbort = () => kill(child);
    options.signal.addEventListener('abort', onAbort, { once: true });
    child.stderr!.on('data', (chunk: Buffer) => {
      if (stderr.length < 16_000) stderr += chunk.toString('utf8').slice(0, 16_000 - stderr.length);
    });

    try {
      let buffer = '';
      for await (const chunk of child.stdout!) {
        if (options.signal.aborted) throw abortError();
        buffer += Buffer.from(chunk).toString('utf8');
        if (Buffer.byteLength(buffer) > this.maxLineBytes) {
          throw new TextIndexExtractionError(
            'PDF 单页正文超过索引协议上限',
            'TEXT_INDEX_PROTOCOL_FAILED',
          );
        }
        let newline = buffer.indexOf('\n');
        while (newline >= 0) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          if (line) {
            let message: WorkerMessage;
            try {
              message = parseMessage(line);
            } catch (error) {
              throw new TextIndexExtractionError(
                '正文索引 worker 返回了无效数据',
                'TEXT_INDEX_PROTOCOL_FAILED',
                { cause: error },
              );
            }
            if (message.type === 'metadata') {
              totalPages = message.totalPages;
              await options.onMetadata(totalPages);
            } else if (message.type === 'page') {
              if (totalPages === 0 || message.pageNumber > totalPages) {
                throw new TextIndexExtractionError(
                  '正文索引页码超出文档范围',
                  'TEXT_INDEX_PROTOCOL_FAILED',
                );
              }
              await options.onPage(message, totalPages);
            } else {
              done = true;
            }
          }
          newline = buffer.indexOf('\n');
        }
      }
      const result = await closed;
      if (options.signal.aborted) throw abortError();
      if (result.code !== 0 || !done) {
        throw new TextIndexExtractionError(
          stderr.trim() || 'PDF 正文解析失败',
          result.code === 0 ? 'TEXT_INDEX_PROTOCOL_FAILED' : 'TEXT_INDEX_PDF_FAILED',
        );
      }
    } catch (error) {
      kill(child);
      await closed.catch(() => undefined);
      if (
        options.signal.aborted ||
        (error instanceof TextIndexExtractionError && error.code === 'TEXT_INDEX_ABORTED')
      ) {
        throw abortError();
      }
      if (error instanceof TextIndexExtractionError) throw error;
      throw new TextIndexExtractionError('无法运行正文索引 worker', 'TEXT_INDEX_PDF_FAILED', {
        cause: error,
      });
    } finally {
      options.signal.removeEventListener('abort', onAbort);
    }
  }
}
