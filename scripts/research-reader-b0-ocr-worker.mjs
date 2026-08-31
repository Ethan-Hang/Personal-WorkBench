#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';

import { createWorker, OEM } from 'tesseract.js';

const require = createRequire(import.meta.url);
const languagePacks = [
  {
    language: 'eng',
    packageName: '@tesseract.js-data/eng',
    sha256: '45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91',
  },
  {
    language: 'chi_sim',
    packageName: '@tesseract.js-data/chi_sim',
    sha256: 'b8a23f10c7de500891eb458a8adc9cc58ab7f242f08b7d149f5e9aea4ad5db7c',
  },
];

const [imagePath, cachePath] = process.argv.slice(2);
if (!imagePath || !cachePath) {
  process.stderr.write('missing isolated OCR input\n');
  process.exit(2);
}

const image = await readFile(imagePath);
const langPath = path.join(cachePath, 'fixed-language-packs');
await mkdir(langPath, { recursive: true });
for (const pack of languagePacks) {
  const source = require.resolve(
    `${pack.packageName}/4.0.0_best_int/${pack.language}.traineddata.gz`,
  );
  const bytes = await readFile(source);
  if (createHash('sha256').update(bytes).digest('hex') !== pack.sha256) {
    throw new Error(`${pack.language} OCR language pack hash mismatch`);
  }
  await copyFile(source, path.join(langPath, `${pack.language}.traineddata.gz`));
}
const progress = [];
const workerStarted = performance.now();
const worker = await createWorker(['eng', 'chi_sim'], OEM.LSTM_ONLY, {
  cachePath,
  langPath,
  logger: (message) => {
    if (typeof message.progress === 'number') progress.push(message.progress);
  },
});
const workerReadyMs = Number((performance.now() - workerStarted).toFixed(2));
process.stdout.write(`${JSON.stringify({ status: 'ready', workerReadyMs })}\n`);
const recognizeStarted = performance.now();
const recognition = await worker.recognize(image);
const recognizeMs = Number((performance.now() - recognizeStarted).toFixed(2));
const workerPeakRssMiB = Number((process.memoryUsage().rss / 1024 / 1024).toFixed(2));
await worker.terminate();
process.stdout.write(
  `${JSON.stringify({
    progressEvents: progress.length,
    recognizeMs,
    status: 'completed',
    text: recognition.data.text,
    workerPeakRssMiB,
    workerReadyMs,
  })}\n`,
);
