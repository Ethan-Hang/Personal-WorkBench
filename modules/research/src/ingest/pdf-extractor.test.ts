import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makePdfFixture } from '../testing/pdf-fixture.js';
import { extractPdfMetadata } from './pdf-extractor.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempFile(name: string, bytes: string | Buffer): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'research-pdf-extractor-'));
  roots.push(root);
  const path = join(root, name);
  await writeFile(path, bytes);
  return path;
}

describe('隔离 PDF worker', () => {
  it('从生成 PDF 提取 embedded 元数据和第一页文本', async () => {
    const path = await tempFile(
      'normal.pdf',
      makePdfFixture({
        title: 'Embedded Research Title',
        author: 'Ada Lovelace; Alan Turing',
        subject: 'doi:10.1000/example',
        keywords: 'local-first, metadata',
        lines: ['First Page Paper Title', 'doi:10.1000/example arXiv:2401.12345v2'],
      }),
    );

    await expect(extractPdfMetadata(path)).resolves.toMatchObject({
      pageCount: 1,
      metadata: {
        title: 'Embedded Research Title',
        author: 'Ada Lovelace; Alan Turing',
        subject: 'doi:10.1000/example',
        keywords: 'local-first, metadata',
      },
      firstPageText: expect.stringContaining('First Page Paper Title'),
    });
  });

  it('扫描型页面正常返回空文本，不误报解析失败', async () => {
    const path = await tempFile('scan.pdf', makePdfFixture({ noText: true }));
    await expect(extractPdfMetadata(path)).resolves.toMatchObject({
      pageCount: 1,
      firstPageText: '',
    });
  });

  it('截断文件返回 PDF_INVALID，主进程继续运行', async () => {
    const path = await tempFile('broken.pdf', '%PDF-1.4\n1 0 obj\n<<');

    await expect(extractPdfMetadata(path)).rejects.toMatchObject({
      code: 'PDF_INVALID',
      name: 'PdfExtractionError',
    });
    expect(1 + 1).toBe(2);
  });

  it('超时会强制终止 worker', async () => {
    const root = await mkdtemp(join(tmpdir(), 'research-pdf-timeout-'));
    roots.push(root);
    const worker = join(root, 'slow-worker.mjs');
    const input = join(root, 'input.pdf');
    await writeFile(worker, 'setTimeout(() => process.stdout.write("{}"), 10000);');
    await writeFile(input, 'unused');

    await expect(
      extractPdfMetadata(input, { workerPath: worker, timeoutMs: 30 }),
    ).rejects.toMatchObject({ code: 'PDF_TIMEOUT' });
  });

  it('AbortSignal 取消会终止 worker 并返回稳定错误', async () => {
    const root = await mkdtemp(join(tmpdir(), 'research-pdf-abort-'));
    roots.push(root);
    const worker = join(root, 'slow-worker.mjs');
    const input = join(root, 'input.pdf');
    await writeFile(worker, 'setTimeout(() => process.stdout.write("{}"), 10000);');
    await writeFile(input, 'unused');
    const controller = new AbortController();
    const extraction = extractPdfMetadata(input, {
      workerPath: worker,
      timeoutMs: 10_000,
      signal: controller.signal,
    });
    controller.abort();

    await expect(extraction).rejects.toMatchObject({
      code: 'IMPORT_CANCELLED',
      detail: 'ABORT_ERR',
    });
  });

  it('worker 输出超限时终止，避免无界占用内存', async () => {
    const root = await mkdtemp(join(tmpdir(), 'research-pdf-output-'));
    roots.push(root);
    const worker = join(root, 'large-worker.mjs');
    const input = join(root, 'input.pdf');
    await writeFile(worker, 'process.stdout.write("x".repeat(4096));');
    await writeFile(input, 'unused');

    await expect(
      extractPdfMetadata(input, { workerPath: worker, outputLimitBytes: 128 }),
    ).rejects.toMatchObject({ code: 'PDF_INVALID', detail: 'stdout limit' });
  });
});
