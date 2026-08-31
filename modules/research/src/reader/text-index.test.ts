import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makePagedPdfFixture } from '../testing/pdf-fixture.js';
import { PdfJsPageTextExtractor, TEXT_INDEX_PARSER_VERSION } from './text-index.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempFile(name: string, bytes: string | Buffer): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'research-text-index-'));
  roots.push(root);
  const filePath = join(root, name);
  await writeFile(filePath, bytes);
  return filePath;
}

describe('PDF page text extractor', () => {
  it('用独立 PDF.js worker 优先当前页并逐页返回可定位正文', async () => {
    const filePath = await tempFile('three-pages.pdf', makePagedPdfFixture(3));
    const pages: Array<{ pageNumber: number; text: string; positions: number }> = [];
    let totalPages = 0;
    await new PdfJsPageTextExtractor().extract({
      filePath,
      startPage: 1,
      priorityPage: 3,
      signal: new AbortController().signal,
      onMetadata: (value) => {
        totalPages = value;
      },
      onPage: (page) => {
        pages.push({
          pageNumber: page.pageNumber,
          text: page.text,
          positions: page.positions.length,
        });
      },
    });

    expect(TEXT_INDEX_PARSER_VERSION).toMatch(/^pdfjs-6\.2\.108:text-v1$/);
    expect(totalPages).toBe(3);
    expect(pages.map((page) => page.pageNumber)).toEqual([3, 1, 2]);
    expect(pages[0]).toMatchObject({ text: 'Research Workbench page 3', positions: 1 });
  });

  it('AbortSignal 会终止整个 worker', async () => {
    const workerPath = await tempFile(
      'slow-worker.mjs',
      `process.stdout.write(JSON.stringify({type:'metadata',totalPages:10,pdfjsVersion:'test'})+'\\n');
       setTimeout(() => process.stdout.write(JSON.stringify({type:'done'})+'\\n'), 10000);`,
    );
    const inputPath = await tempFile('unused.pdf', 'unused');
    const controller = new AbortController();
    const extraction = new PdfJsPageTextExtractor(workerPath).extract({
      filePath: inputPath,
      startPage: 1,
      priorityPage: null,
      signal: controller.signal,
      onMetadata: () => controller.abort(),
      onPage: () => undefined,
    });
    await expect(extraction).rejects.toMatchObject({ code: 'TEXT_INDEX_ABORTED' });
  });

  it('1000 页生成语料在子进程中完成且主事件循环持续让步', async () => {
    const filePath = await tempFile('thousand-pages.pdf', makePagedPdfFixture(1_000));
    let pageCount = 0;
    let eventLoopTicks = 0;
    const timer = setInterval(() => {
      eventLoopTicks += 1;
    }, 5);
    try {
      await new PdfJsPageTextExtractor().extract({
        filePath,
        startPage: 1,
        priorityPage: 800,
        signal: new AbortController().signal,
        onMetadata: (totalPages) => expect(totalPages).toBe(1_000),
        onPage: () => {
          pageCount += 1;
        },
      });
    } finally {
      clearInterval(timer);
    }
    expect(pageCount).toBe(1_000);
    expect(eventLoopTicks).toBeGreaterThan(0);
  }, 30_000);
});
