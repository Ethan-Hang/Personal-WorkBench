#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import process from 'node:process';

import { createWorker, OEM } from 'tesseract.js';

const [imagePath, cachePath] = process.argv.slice(2);
if (!imagePath || !cachePath) {
  process.stderr.write('missing isolated OCR input\n');
  process.exit(2);
}

const image = await readFile(imagePath);
const progress = [];
const workerStarted = performance.now();
const worker = await createWorker(['eng', 'chi_sim'], OEM.LSTM_ONLY, {
  cachePath,
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
