import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { OcrLanguage, PageTextPosition } from '../contract.js';
import { resolveOcrLanguagePacks } from './language-packs.js';

export interface OcrPage {
  pageNumber: number;
  pageSize: { width: number; height: number };
  text: string;
  positions: PageTextPosition[];
}

export interface OcrRecognitionOptions {
  filePath: string;
  cachePath: string;
  startPage: number;
  languages: OcrLanguage[];
  signal: AbortSignal;
  onMetadata: (totalPages: number) => Promise<void> | void;
  onPage: (page: OcrPage, totalPages: number) => Promise<void> | void;
}

export interface OcrEngine {
  recognize(options: OcrRecognitionOptions): Promise<void>;
}

export class OcrEngineError extends Error {
  constructor(
    message: string,
    readonly code:
      'OCR_ABORTED' | 'OCR_DEPENDENCY_FAILED' | 'OCR_PDF_FAILED' | 'OCR_PROTOCOL_FAILED',
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'OcrEngineError';
  }
}

interface MetadataMessage {
  type: 'metadata';
  totalPages: number;
}

interface PageMessage extends OcrPage {
  type: 'page';
}

interface DoneMessage {
  type: 'done';
}

interface ProgressMessage {
  type: 'progress';
  pageNumber: number;
  progress: number;
}

type WorkerMessage = MetadataMessage | PageMessage | DoneMessage | ProgressMessage;

function kill(child: ChildProcess): void {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

function aborted(): OcrEngineError {
  return new OcrEngineError('OCR 已停止', 'OCR_ABORTED');
}

function parseMessage(line: string): WorkerMessage {
  const parsed = JSON.parse(line) as Partial<WorkerMessage>;
  if (parsed.type === 'metadata' && Number.isInteger(parsed.totalPages) && parsed.totalPages! > 0) {
    return parsed as MetadataMessage;
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
    return parsed as PageMessage;
  }
  if (
    parsed.type === 'progress' &&
    Number.isInteger(parsed.pageNumber) &&
    typeof parsed.progress === 'number'
  ) {
    return parsed as ProgressMessage;
  }
  if (parsed.type === 'done') return { type: 'done' };
  throw new Error('worker message shape is invalid');
}

export class TesseractOcrEngine implements OcrEngine {
  constructor(
    private readonly workerPath = fileURLToPath(new URL('./ocr-worker.mjs', import.meta.url)),
    private readonly maxLineBytes = 32 * 1024 * 1024,
  ) {}

  async recognize(options: OcrRecognitionOptions): Promise<void> {
    if (options.signal.aborted) throw aborted();
    const packs = resolveOcrLanguagePacks(options.languages);
    const languageSourcePath = join(options.cachePath, 'fixed-language-packs');
    await mkdir(languageSourcePath, { recursive: true });
    for (const pack of packs) {
      const bytes = await readFile(pack.filePath);
      if (createHash('sha256').update(bytes).digest('hex') !== pack.sha256) {
        throw new OcrEngineError(`${pack.language} OCR 语言包校验失败`, 'OCR_DEPENDENCY_FAILED');
      }
      await copyFile(pack.filePath, join(languageSourcePath, `${pack.language}.traineddata.gz`));
    }
    const encodedConfig = Buffer.from(
      JSON.stringify({
        cachePath: options.cachePath,
        langPath: languageSourcePath,
        languages: packs.map((pack) => pack.language),
      }),
    ).toString('base64url');
    const child = spawn(
      process.execPath,
      [this.workerPath, options.filePath, String(options.startPage), encodedConfig],
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
        if (options.signal.aborted) throw aborted();
        buffer += Buffer.from(chunk).toString('utf8');
        if (Buffer.byteLength(buffer) > this.maxLineBytes) {
          throw new OcrEngineError('OCR 单页结果超过协议上限', 'OCR_PROTOCOL_FAILED');
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
              throw new OcrEngineError('OCR worker 返回了无效数据', 'OCR_PROTOCOL_FAILED', {
                cause: error,
              });
            }
            if (message.type === 'metadata') {
              totalPages = message.totalPages;
              await options.onMetadata(totalPages);
            } else if (message.type === 'page') {
              if (totalPages === 0 || message.pageNumber > totalPages) {
                throw new OcrEngineError('OCR 页码超出文档范围', 'OCR_PROTOCOL_FAILED');
              }
              await options.onPage(message, totalPages);
            } else if (message.type === 'done') {
              done = true;
            }
          }
          newline = buffer.indexOf('\n');
        }
      }
      const result = await closed;
      if (options.signal.aborted) throw aborted();
      if (result.code !== 0 || !done) {
        throw new OcrEngineError(
          stderr.trim() || 'OCR 子进程执行失败',
          result.code === 0 ? 'OCR_PROTOCOL_FAILED' : 'OCR_PDF_FAILED',
        );
      }
    } catch (error) {
      kill(child);
      await closed.catch(() => undefined);
      if (
        options.signal.aborted ||
        (error instanceof OcrEngineError && error.code === 'OCR_ABORTED')
      ) {
        throw aborted();
      }
      if (error instanceof OcrEngineError) throw error;
      throw new OcrEngineError('无法运行 OCR 子进程', 'OCR_PDF_FAILED', { cause: error });
    } finally {
      options.signal.removeEventListener('abort', onAbort);
    }
  }
}
