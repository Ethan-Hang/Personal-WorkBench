import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FileLifecycleError } from '../files/content-store.js';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_OUTPUT_LIMIT = 1024 * 1024;

export interface PdfEmbeddedMetadata {
  title: string | null;
  author: string | null;
  subject: string | null;
  keywords: string | null;
  creationDate: string | null;
}

export interface PdfExtractionResult {
  pageCount: number;
  metadata: PdfEmbeddedMetadata;
  firstPageText: string;
}

export interface PdfExtractorOptions {
  timeoutMs?: number;
  outputLimitBytes?: number;
  workerPath?: string;
  signal?: AbortSignal;
}

export class PdfExtractionError extends Error {
  constructor(
    message: string,
    readonly code: 'PDF_INVALID' | 'PDF_TIMEOUT' | 'IMPORT_CANCELLED',
    readonly detail: string | null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PdfExtractionError';
  }
}

function parseWorkerError(stderr: string): string {
  const trimmed = stderr.trim();
  if (!trimmed) return 'PDF worker exited without details';
  try {
    const parsed = JSON.parse(trimmed) as { message?: unknown };
    return typeof parsed.message === 'string' ? parsed.message : trimmed;
  } catch {
    return trimmed;
  }
}

function kill(child: ChildProcess): void {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

export function extractPdfMetadata(
  filePath: string,
  options: PdfExtractorOptions = {},
): Promise<PdfExtractionResult> {
  const workerPath =
    options.workerPath ?? fileURLToPath(new URL('./pdf-worker.mjs', import.meta.url));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const outputLimit = options.outputLimitBytes ?? DEFAULT_OUTPUT_LIMIT;

  if (options.signal?.aborted) {
    return Promise.reject(
      new PdfExtractionError('PDF 识别已取消', 'IMPORT_CANCELLED', 'ABORT_ERR'),
    );
  }

  return new Promise<PdfExtractionResult>((resolve, reject) => {
    const child = spawn(process.execPath, [workerPath, filePath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let settled = false;

    const finish = (operation: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      operation();
    };
    const fail = (error: PdfExtractionError) => finish(() => reject(error));
    const onAbort = () => {
      kill(child);
      fail(new PdfExtractionError('PDF 识别已取消', 'IMPORT_CANCELLED', 'ABORT_ERR'));
    };
    const timer = setTimeout(() => {
      kill(child);
      fail(new PdfExtractionError('PDF 识别超时', 'PDF_TIMEOUT', `timeout=${timeoutMs}ms`));
    }, timeoutMs);

    options.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', (chunk: Buffer) => {
      if (settled) return;
      stdout = Buffer.concat([stdout, chunk]);
      if (stdout.length > outputLimit) {
        kill(child);
        fail(new PdfExtractionError('PDF 识别输出超限', 'PDF_INVALID', 'stdout limit'));
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (settled) return;
      stderr = Buffer.concat([stderr, chunk.subarray(0, Math.max(0, outputLimit - stderr.length))]);
    });
    child.on('error', (error) => {
      fail(
        new PdfExtractionError('无法启动 PDF 识别进程', 'PDF_INVALID', error.message, {
          cause: error,
        }),
      );
    });
    child.on('close', (code) => {
      if (settled) return;
      if (code !== 0) {
        fail(
          new PdfExtractionError(
            'PDF 无法解析',
            'PDF_INVALID',
            parseWorkerError(stderr.toString('utf8')),
          ),
        );
        return;
      }
      try {
        const parsed = JSON.parse(stdout.toString('utf8')) as PdfExtractionResult;
        if (
          !Number.isInteger(parsed.pageCount) ||
          parsed.pageCount < 1 ||
          typeof parsed.firstPageText !== 'string' ||
          typeof parsed.metadata !== 'object' ||
          parsed.metadata === null
        ) {
          throw new Error('worker returned an invalid shape');
        }
        finish(() => resolve(parsed));
      } catch (error) {
        fail(
          new PdfExtractionError('PDF 识别结果无效', 'PDF_INVALID', String(error), {
            cause: error,
          }),
        );
      }
    });
  }).catch((error: unknown) => {
    if (error instanceof PdfExtractionError) throw error;
    if (error instanceof FileLifecycleError && error.code === 'IMPORT_CANCELLED') {
      throw new PdfExtractionError(error.message, 'IMPORT_CANCELLED', error.causeCode);
    }
    throw error;
  });
}
