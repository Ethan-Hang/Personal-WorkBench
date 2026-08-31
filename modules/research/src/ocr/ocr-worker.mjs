import { Buffer } from 'node:buffer';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import process from 'node:process';
import { setImmediate as yieldImmediate } from 'node:timers/promises';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createWorker, OEM } from 'tesseract.js';

async function emit(value) {
  if (!process.stdout.write(`${JSON.stringify(value)}\n`)) await once(process.stdout, 'drain');
}

async function recognize(filePath, startPage, config) {
  await mkdir(config.cachePath, { recursive: true });
  const loadingTask = getDocument({
    url: filePath,
    isEvalSupported: false,
    useSystemFonts: true,
    stopEvent: true,
  });
  let worker;
  try {
    const document = await loadingTask.promise;
    await emit({ type: 'metadata', totalPages: document.numPages });
    worker = await createWorker(config.languages, OEM.LSTM_ONLY, {
      cachePath: config.cachePath,
      langPath: config.langPath,
    });
    for (let pageNumber = startPage; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      let canvas;
      try {
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(2, 2400 / Math.max(baseViewport.width, baseViewport.height));
        const viewport = page.getViewport({ scale });
        canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        const recognition = await worker.recognize(canvas.toBuffer('image/png'));
        const [left, bottom, right, top] = page.view;
        await emit({
          type: 'page',
          pageNumber,
          pageSize: { width: right - left, height: top - bottom },
          text: recognition.data.text,
          positions: [],
        });
      } finally {
        if (canvas) {
          canvas.width = 1;
          canvas.height = 1;
        }
        page.cleanup();
      }
      await yieldImmediate();
    }
    await emit({ type: 'done' });
  } finally {
    if (worker) await worker.terminate();
    await loadingTask.destroy();
  }
}

if (process.argv[2] === '--probe') {
  await emit({ type: 'probe', status: 'ready' });
} else {
  const filePath = process.argv[2];
  const startPage = Number(process.argv[3] ?? 1);
  let config;
  try {
    config = JSON.parse(Buffer.from(process.argv[4] ?? '', 'base64url').toString('utf8'));
  } catch {
    config = null;
  }
  if (
    !filePath ||
    !Number.isInteger(startPage) ||
    startPage < 1 ||
    !config ||
    typeof config.cachePath !== 'string' ||
    typeof config.langPath !== 'string' ||
    !Array.isArray(config.languages) ||
    config.languages.length === 0
  ) {
    process.stderr.write(JSON.stringify({ code: 'OCR_INPUT_INVALID' }));
    process.exitCode = 2;
  } else {
    try {
      await recognize(filePath, startPage, config);
    } catch (error) {
      process.stderr.write(
        JSON.stringify({
          code: 'OCR_FAILED',
          name: error?.name ?? 'Error',
          message: error?.message ?? String(error),
        }),
      );
      process.exitCode = 1;
    }
  }
}
