import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { makePdfFixture } from '../testing/pdf-fixture.js';
import { OcrEngineError, TesseractOcrEngine } from './engine.js';

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('TesseractOcrEngine', () => {
  it('生产 worker 能从模块位置直接解析 PDF、Canvas 和 Tesseract 运行依赖', async () => {
    const workerPath = fileURLToPath(new URL('./ocr-worker.mjs', import.meta.url));
    const result = await execFileAsync(process.execPath, [workerPath, '--probe'], {
      windowsHide: true,
    });
    expect(JSON.parse(result.stdout)).toEqual({ type: 'probe', status: 'ready' });
  });

  it('使用固定本地英文语言包识别生成 PDF，不访问运行时语言包 CDN', async () => {
    const root = await mkdtemp(join(tmpdir(), 'research-ocr-engine-'));
    roots.push(root);
    const pdfPath = join(root, 'scan.pdf');
    await writeFile(
      pdfPath,
      makePdfFixture({ lines: ['RESEARCH WORKBENCH OCR', 'LOCAL PDF EVIDENCE 2026'] }),
    );
    const pages: Array<{ pageNumber: number; text: string }> = [];
    let totalPages = 0;
    await new TesseractOcrEngine().recognize({
      filePath: pdfPath,
      cachePath: join(root, 'cache'),
      startPage: 1,
      languages: ['eng'],
      signal: new AbortController().signal,
      onMetadata: (total) => {
        totalPages = total;
      },
      onPage: (page) => {
        pages.push({ pageNumber: page.pageNumber, text: page.text });
      },
    });
    expect(totalPages).toBe(1);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.text.toUpperCase()).toContain('RESEARCH');
  }, 20_000);

  it('AbortSignal 终止整个子进程并在 250 ms 预算内收敛', async () => {
    const root = await mkdtemp(join(tmpdir(), 'research-ocr-abort-'));
    roots.push(root);
    const workerPath = join(root, 'slow-worker.mjs');
    await writeFile(
      workerPath,
      `process.stdout.write(JSON.stringify({type:'metadata',totalPages:2})+'\\n');setInterval(()=>{},1000);`,
    );
    const controller = new AbortController();
    const engine = new TesseractOcrEngine(workerPath);
    const started = performance.now();
    const recognition = engine.recognize({
      filePath: join(root, 'unused.pdf'),
      cachePath: join(root, 'cache'),
      startPage: 1,
      languages: ['eng'],
      signal: controller.signal,
      onMetadata: () => undefined,
      onPage: () => undefined,
    });
    setTimeout(() => controller.abort(), 30);
    await expect(recognition).rejects.toBeInstanceOf(OcrEngineError);
    expect(performance.now() - started).toBeLessThan(250);
  });
});
