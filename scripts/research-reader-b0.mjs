#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { mkdtemp, mkdir, open, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import Database from 'better-sqlite3';
import { getDocument, PasswordResponses } from 'pdfjs-dist/legacy/build/pdf.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const browserHarnessPath = path.join(scriptDir, 'research-reader-b0-browser.html');
const encryptedFixtureSource = path.join(
  scriptDir,
  'fixtures',
  'research-reader-encrypted.pdf.b64',
);
const pdfJsBuildRoot = path.join(repoRoot, 'node_modules', 'pdfjs-dist', 'build');

function parseArgs(argv) {
  const options = {
    browser: false,
    help: false,
    keepFixtures: false,
    maxPages: 240,
    ocr: false,
    output: null,
    pdfPaths: [],
    port: 0,
    serve: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--browser') options.browser = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--keep-fixtures') options.keepFixtures = true;
    else if (arg === '--ocr') options.ocr = true;
    else if (arg === '--serve') options.serve = true;
    else if (arg === '--max-pages') options.maxPages = Number(argv[++index]);
    else if (arg === '--output') options.output = argv[++index];
    else if (arg === '--pdf') options.pdfPaths.push(argv[++index]);
    else if (arg === '--port') options.port = Number(argv[++index]);
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.maxPages) || options.maxPages < 1) {
    throw new Error('--max-pages must be a positive integer');
  }
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) {
    throw new Error('--port must be an integer between 0 and 65535');
  }
  if (options.browser && options.serve) {
    throw new Error('--browser and --serve cannot be used together');
  }
  return options;
}

function printHelp() {
  process.stdout.write(`Research reader B0 validation

Usage:
  npm run research:b0
  npm run research:b0 -- --browser
  npm run research:b0 -- --ocr
  npm run research:b0 -- --pdf "/path/to/private.pdf"
  npm run research:b0 -- --serve [--port 4178]

Options:
  --browser          Run the PDF.js browser harness with Edge/Chrome.
  --ocr              Run the Tesseract.js English + Simplified Chinese spike.
  --pdf PATH         Add a local private PDF; repeat for more files.
  --max-pages N      Maximum pages extracted from each PDF (default: 240).
  --output PATH      Write the path-sanitized JSON result to this file.
  --serve            Keep the browser harness server running.
  --port N           Browser harness port; 0 selects a free port.
  --keep-fixtures    Keep generated fixtures and print their temporary directory.
`);
}

function pdfEscape(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

function makeTextPdf({
  blank = false,
  pageCount,
  paddingBytes = 0,
  textPrefix = 'Research Workbench B0',
}) {
  const fontObjectNumber = 3 + pageCount * 2;
  const pageObjectNumbers = Array.from({ length: pageCount }, (_, index) => 3 + index * 2);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((value) => `${value} 0 R`).join(' ')}] /Count ${pageCount} >>`,
  ];

  for (let index = 0; index < pageCount; index += 1) {
    const pageNumber = index + 1;
    const contentObjectNumber = pageObjectNumbers[index] + 1;
    const padding = paddingBytes > 0 ? `\n%${'x'.repeat(paddingBytes - 2)}` : '';
    const content = blank
      ? `q\nQ${padding}`
      : [
          'BT',
          '/F1 14 Tf',
          '72 720 Td',
          `(${pdfEscape(`${textPrefix} page ${pageNumber}`)}) Tj`,
          '0 -24 Td',
          `(searchable benchmark token page-${pageNumber}) Tj`,
          'ET',
        ].join('\n') + padding;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]
         /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`,
      `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream`,
    );
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let output = '%PDF-1.7\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(output, 'binary'));
    output += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(output, 'binary');
  output += `xref\n0 ${objects.length + 1}\n`;
  output += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) {
    output += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  output += `startxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(output, 'binary');
}

function makeBlankPdf(pageCount) {
  return makeTextPdf({ blank: true, pageCount });
}

async function prepareSamples(tempRoot, privatePaths) {
  const fixtureRoot = path.join(tempRoot, 'fixtures');
  await mkdir(fixtureRoot, { recursive: true });
  const smallPath = path.join(fixtureRoot, 'small-text.pdf');
  const longPath = path.join(fixtureRoot, 'long-range.pdf');
  const blankPath = path.join(fixtureRoot, 'blank-scan-proxy.pdf');
  const corruptPath = path.join(fixtureRoot, 'corrupt-truncated.pdf');
  const encryptedPath = path.join(fixtureRoot, 'encrypted-session-password.pdf');
  const smallBuffer = makeTextPdf({ pageCount: 6 });
  const longBuffer = makeTextPdf({ pageCount: 180, paddingBytes: 32 * 1024 });
  const blankBuffer = makeBlankPdf(4);
  await Promise.all([
    writeFile(smallPath, smallBuffer),
    writeFile(longPath, longBuffer),
    writeFile(blankPath, blankBuffer),
    writeFile(corruptPath, longBuffer.subarray(0, Math.floor(longBuffer.length * 0.55))),
    readFile(encryptedFixtureSource, 'utf8').then((base64) =>
      writeFile(encryptedPath, Buffer.from(base64.trim(), 'base64')),
    ),
  ]);

  const samples = [
    { id: 'generated-small', kind: 'generated-text', label: 'generated-small', path: smallPath },
    { id: 'generated-long', kind: 'generated-long', label: 'generated-long', path: longPath },
    {
      id: 'generated-blank',
      kind: 'generated-scan-proxy',
      label: 'generated-blank',
      path: blankPath,
    },
  ];
  const expectedFailures = [
    {
      id: 'generated-corrupt',
      kind: 'generated-corrupt',
      label: 'generated-corrupt',
      path: corruptPath,
    },
  ];

  for (let index = 0; index < privatePaths.length; index += 1) {
    const privatePath = path.resolve(privatePaths[index]);
    const fileStat = await stat(privatePath);
    if (!fileStat.isFile()) throw new Error(`--pdf input ${index + 1} is not a file`);
    samples.push({
      id: `private-${index + 1}`,
      kind: 'private-local',
      label: `private-${index + 1}`,
      path: privatePath,
    });
  }
  return { encryptedPath, expectedFailures, fixtureRoot, samples };
}

async function isLinearizedPdf(sample) {
  const handle = await open(sample.path, 'r');
  try {
    const header = Buffer.alloc(4096);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    return header.subarray(0, bytesRead).includes(Buffer.from('/Linearized'));
  } finally {
    await handle.close();
  }
}

async function selectRangePdfSample(samples) {
  for (const sample of samples) {
    if (sample.kind === 'private-local' && (await isLinearizedPdf(sample))) return sample;
  }
  return samples.find((sample) => sample.id === 'generated-long') ?? samples[0];
}

function elapsedMs(start) {
  return Number((performance.now() - start).toFixed(2));
}

function rssMiB() {
  return Number((process.memoryUsage().rss / 1024 / 1024).toFixed(2));
}

function memoryMiB() {
  const memory = process.memoryUsage();
  return {
    arrayBuffers: Number((memory.arrayBuffers / 1024 / 1024).toFixed(2)),
    external: Number((memory.external / 1024 / 1024).toFixed(2)),
    heapUsed: Number((memory.heapUsed / 1024 / 1024).toFixed(2)),
    rss: Number((memory.rss / 1024 / 1024).toFixed(2)),
  };
}

async function settleMemory() {
  globalThis.gc?.();
  await new Promise((resolve) => setTimeout(resolve, 100));
  globalThis.gc?.();
}

async function inspectPdf(sample, maxPages) {
  await settleMemory();
  const rssBeforeMiB = rssMiB();
  const memoryBeforeMiB = memoryMiB();
  const bytes = await readFile(sample.path);
  const loadStarted = performance.now();
  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    stopEvent: true,
    useSystemFonts: true,
  });
  let document;
  let canvas;
  let inspected;
  try {
    document = await loadingTask.promise;
    const documentReadyMs = elapsedMs(loadStarted);
    const pageStarted = performance.now();
    const page = await document.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const renderStarted = performance.now();
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const firstPageRenderMs = elapsedMs(renderStarted);
    const firstPageReadyMs = elapsedMs(pageStarted);
    const extractLimit = Math.min(document.numPages, maxPages);
    const texts = [];
    const textStarted = performance.now();
    for (let pageNumber = 1; pageNumber <= extractLimit; pageNumber += 1) {
      const currentPage = pageNumber === 1 ? page : await document.getPage(pageNumber);
      const text = await currentPage.getTextContent();
      texts.push(
        text.items
          .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
          .filter(Boolean)
          .join(' '),
      );
      currentPage.cleanup();
    }
    inspected = {
      metrics: {
        bytes: bytes.length,
        documentReadyMs,
        extractedPages: extractLimit,
        firstPageReadyMs,
        firstPageRenderMs,
        memoryBeforeMiB,
        memoryPeakObservedMiB: memoryMiB(),
        pageCount: document.numPages,
        rssBeforeMiB,
        rssPeakObservedMiB: rssMiB(),
        textExtractionMs: elapsedMs(textStarted),
        textPages: texts.filter((value) => value.trim() !== '').length,
      },
      texts,
    };
  } finally {
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
    await loadingTask.destroy();
    await settleMemory();
  }
  inspected.metrics.rssAfterDestroyMiB = rssMiB();
  inspected.metrics.memoryAfterDestroyMiB = memoryMiB();
  inspected.metrics.rssRetainedMiB = Number(
    (inspected.metrics.rssAfterDestroyMiB - rssBeforeMiB).toFixed(2),
  );
  return inspected;
}

async function inspectExpectedFailure(sample) {
  const bytes = await readFile(sample.path);
  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    stopEvent: true,
  });
  try {
    await loadingTask.promise;
    return { rejected: false };
  } catch (error) {
    return {
      errorName: error instanceof Error ? error.name : 'Error',
      rejected: true,
    };
  } finally {
    await loadingTask.destroy();
  }
}

async function requestEncryptedPdf(bytes, password) {
  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    password,
    stopEvent: true,
  });
  try {
    const outcome = await new Promise((resolve, reject) => {
      loadingTask.onPassword = (_updatePassword, reason) => resolve({ reason });
      loadingTask.promise.then(
        (document) => resolve({ document }),
        (error) => reject(error),
      );
    });
    if ('reason' in outcome) return { passwordReason: outcome.reason };
    return { pageCount: outcome.document.numPages };
  } finally {
    await loadingTask.destroy();
  }
}

async function inspectEncryptedPdf(filePath) {
  const bytes = await readFile(filePath);
  const missing = await requestEncryptedPdf(bytes);
  const incorrect = await requestEncryptedPdf(bytes, 'incorrect-b0-password');
  const accepted = await requestEncryptedPdf(bytes, 'research-b0');
  assert.equal(missing.passwordReason, PasswordResponses.NEED_PASSWORD);
  assert.equal(incorrect.passwordReason, PasswordResponses.INCORRECT_PASSWORD);
  assert.equal(accepted.pageCount, 6);
  return {
    acceptedPageCount: accepted.pageCount,
    incorrectPasswordReason: incorrect.passwordReason,
    missingPasswordReason: missing.passwordReason,
    passed: true,
  };
}

function benchmarkFts(tempRoot, documents) {
  const databasePath = path.join(tempRoot, 'reader-index.sqlite');
  let database = new Database(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE reader_index_state (
      document_id TEXT PRIMARY KEY,
      indexed_pages INTEGER NOT NULL,
      total_pages INTEGER NOT NULL
    );
    CREATE VIRTUAL TABLE reader_page_fts USING fts5(
      document_id UNINDEXED,
      page_number UNINDEXED,
      body,
      tokenize = 'unicode61'
    );
  `);
  const insertPage = database.prepare(
    'INSERT INTO reader_page_fts (document_id, page_number, body) VALUES (?, ?, ?)',
  );
  const upsertState = database.prepare(`
    INSERT INTO reader_index_state (document_id, indexed_pages, total_pages)
    VALUES (?, ?, ?)
    ON CONFLICT(document_id) DO UPDATE SET indexed_pages = excluded.indexed_pages
  `);
  const started = performance.now();
  const indexedPages = documents.reduce((sum, document) => sum + document.texts.length, 0);
  const pauseAt = Math.max(1, Math.floor(indexedPages / 2));
  let inserted = 0;

  const insertUntilPause = database.transaction(() => {
    for (const document of documents) {
      for (let index = 0; index < document.texts.length; index += 1) {
        if (inserted >= pauseAt) return;
        insertPage.run(document.id, index + 1, document.texts[index]);
        inserted += 1;
        upsertState.run(document.id, index + 1, document.texts.length);
      }
    }
  });
  insertUntilPause();
  database.close();

  database = new Database(databasePath);
  const persistedAtPause = database
    .prepare('SELECT count(*) AS count FROM reader_page_fts')
    .get().count;
  assert.equal(persistedAtPause, pauseAt);
  const resumeInsert = database.prepare(
    'INSERT INTO reader_page_fts (document_id, page_number, body) VALUES (?, ?, ?)',
  );
  const resumeState = database.prepare(`
    INSERT INTO reader_index_state (document_id, indexed_pages, total_pages)
    VALUES (?, ?, ?)
    ON CONFLICT(document_id) DO UPDATE SET indexed_pages = excluded.indexed_pages
  `);
  const resume = database.transaction(() => {
    let cursor = 0;
    for (const document of documents) {
      for (let index = 0; index < document.texts.length; index += 1) {
        cursor += 1;
        if (cursor <= pauseAt) continue;
        resumeInsert.run(document.id, index + 1, document.texts[index]);
        resumeState.run(document.id, index + 1, document.texts.length);
      }
    }
  });
  resume();
  const indexMs = elapsedMs(started);
  const searchStarted = performance.now();
  const matches = database
    .prepare(
      `SELECT document_id, page_number
       FROM reader_page_fts
       WHERE reader_page_fts MATCH ?
       ORDER BY rank
       LIMIT 20`,
    )
    .all('benchmark');
  const searchMs = elapsedMs(searchStarted);
  const finalPages = database.prepare('SELECT count(*) AS count FROM reader_page_fts').get().count;
  const integrity = database.pragma('integrity_check', { simple: true });
  database.close();
  assert.equal(finalPages, indexedPages);
  assert.equal(integrity, 'ok');
  return {
    databaseBytes: existsSync(databasePath) ? statSync(databasePath).size : 0,
    indexMs,
    indexedPages,
    matches: matches.length,
    pauseAt,
    persistedAtPause,
    searchMs,
  };
}

function parseByteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header ?? '');
  if (!match || (match[1] === '' && match[2] === '')) return null;
  if (match[1] === '') {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return { end: size - 1, start: Math.max(0, size - suffixLength) };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] === '' ? size - 1 : Number(match[2]);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= size ||
    requestedEnd < start
  ) {
    return null;
  }
  return { end: Math.min(requestedEnd, size - 1), start };
}

async function createHarnessServer(samples, port) {
  const sampleMap = new Map(samples.map((sample) => [sample.id, sample]));
  const metrics = { activeStreams: 0, bytesServed: 0, requests: [] };
  let lastBrowserResult = null;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/b0/manifest.json') {
      const manifest = await Promise.all(
        samples.map(async (sample) => ({
          bytes: (await stat(sample.path)).size,
          id: sample.id,
          kind: sample.kind,
          label: sample.label,
          linearized: await isLinearizedPdf(sample),
          url: `/b0/pdf/${sample.id}`,
        })),
      );
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(manifest));
      return;
    }
    if (url.pathname === '/b0/metrics') {
      if (request.method === 'DELETE') {
        assert.equal(metrics.activeStreams, 0);
        metrics.bytesServed = 0;
        metrics.requests.length = 0;
        response.writeHead(204);
        response.end();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(metrics));
      return;
    }
    if (url.pathname === '/b0/result' && request.method === 'POST') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      try {
        lastBrowserResult = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        response.writeHead(204);
      } catch {
        response.writeHead(400);
      }
      response.end();
      return;
    }
    if (url.pathname === '/' || url.pathname === '/b0/runner.html') {
      const html = await readFile(browserHarnessPath);
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(html);
      return;
    }
    if (url.pathname === '/vendor/pdf.mjs' || url.pathname === '/vendor/pdf.worker.mjs') {
      const filename = path.basename(url.pathname);
      const vendorPath = path.join(pdfJsBuildRoot, filename);
      const vendorStat = await stat(vendorPath);
      response.writeHead(200, {
        'Content-Length': vendorStat.size,
        'Content-Type': 'text/javascript; charset=utf-8',
      });
      createReadStream(vendorPath).pipe(response);
      return;
    }
    if (url.pathname.startsWith('/b0/pdf/')) {
      const id = decodeURIComponent(url.pathname.slice('/b0/pdf/'.length));
      const sample = sampleMap.get(id);
      if (!sample) {
        response.writeHead(404);
        response.end();
        return;
      }
      const fileStat = await stat(sample.path);
      const rangeHeader = request.headers.range;
      const parsedRange = rangeHeader ? parseByteRange(rangeHeader, fileStat.size) : null;
      if (rangeHeader && !parsedRange) {
        metrics.requests.push({ id, range: rangeHeader, status: 416 });
        response.writeHead(416, {
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes */${fileStat.size}`,
        });
        response.end();
        return;
      }
      const start = parsedRange?.start ?? 0;
      const end = parsedRange?.end ?? fileStat.size - 1;
      const contentLength = end - start + 1;
      const statusCode = parsedRange ? 206 : 200;
      const requestMetric = {
        aborted: false,
        bytes: 0,
        completed: false,
        id,
        range: rangeHeader ?? null,
        status: statusCode,
      };
      metrics.requests.push(requestMetric);
      const headers = {
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
        'Content-Length': contentLength,
        'Content-Type': 'application/pdf',
      };
      if (parsedRange) headers['Content-Range'] = `bytes ${start}-${end}/${fileStat.size}`;
      response.writeHead(statusCode, headers);
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      const stream = createReadStream(sample.path, { end, start });
      metrics.activeStreams += 1;
      let streamClosed = false;
      const closeStreamMetric = () => {
        if (streamClosed) return;
        streamClosed = true;
        metrics.activeStreams -= 1;
      };
      request.on('aborted', () => {
        requestMetric.aborted = true;
        stream.destroy();
      });
      response.on('close', () => {
        if (!requestMetric.completed) requestMetric.aborted = true;
        stream.destroy();
      });
      stream.on('data', (chunk) => {
        requestMetric.bytes += chunk.length;
        metrics.bytesServed += chunk.length;
      });
      stream.on('end', () => {
        requestMetric.completed = true;
      });
      stream.on('close', closeStreamMetric);
      stream.on('error', () => response.destroy());
      stream.pipe(response);
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address !== 'string');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
    getLastBrowserResult: () => lastBrowserResult,
    metrics,
  };
}

async function validateRanges(baseUrl, sample) {
  const size = (await stat(sample.path)).size;
  const checks = [];
  const run = async (range, expectedStatus, expectedBytes) => {
    const response = await globalThis.fetch(`${baseUrl}/b0/pdf/${sample.id}`, {
      headers: range ? { Range: range } : {},
    });
    const body = await response.arrayBuffer();
    assert.equal(response.status, expectedStatus);
    assert.equal(body.byteLength, expectedBytes);
    checks.push({ bytes: body.byteLength, range: range ?? null, status: response.status });
  };
  await run('bytes=0-31', 206, 32);
  await run('bytes=32-63', 206, 32);
  await run('bytes=-16', 206, 16);
  await run(`bytes=${size - 8}-`, 206, 8);
  await run(`bytes=${size}-`, 416, 0);
  await run('bytes=0-1,4-5', 416, 0);
  const unauthorized = await globalThis.fetch(`${baseUrl}/b0/pdf/not-authorized`);
  assert.equal(unauthorized.status, 404);
  checks.push({ bytes: 0, range: 'unauthorized-id', status: unauthorized.status });

  const abortController = new globalThis.AbortController();
  const abortResponse = await globalThis.fetch(`${baseUrl}/b0/pdf/${sample.id}`, {
    headers: { Range: `bytes=0-${size - 1}` },
    signal: abortController.signal,
  });
  const reader = abortResponse.body.getReader();
  const firstChunk = await reader.read();
  assert.equal(firstChunk.done, false);
  abortController.abort();
  await reader.cancel().catch(() => undefined);
  const abortDeadline = performance.now() + 2000;
  let serverMetrics;
  do {
    await new Promise((resolve) => setTimeout(resolve, 20));
    serverMetrics = await globalThis
      .fetch(`${baseUrl}/b0/metrics`)
      .then((response) => response.json());
  } while (serverMetrics.activeStreams !== 0 && performance.now() < abortDeadline);
  assert.equal(serverMetrics.activeStreams, 0);
  const abortedRequest = serverMetrics.requests.findLast(
    (request) => request.id === sample.id && request.aborted,
  );
  assert(abortedRequest);
  assert(abortedRequest.bytes < size);
  checks.push({
    bytes: abortedRequest.bytes,
    range: 'aborted-full-range',
    status: abortResponse.status,
  });
  return { checks, passed: true, streamsAfterAbort: serverMetrics.activeStreams };
}

async function inspectPdfOverRange(baseUrl, sample) {
  await globalThis.fetch(`${baseUrl}/b0/metrics`, { method: 'DELETE' });
  const linearized = await isLinearizedPdf(sample);
  const loadingStarted = performance.now();
  const loadingTask = getDocument({
    disableAutoFetch: true,
    disableStream: true,
    isEvalSupported: false,
    rangeChunkSize: 64 * 1024,
    stopEvent: true,
    url: `${baseUrl}/b0/pdf/${sample.id}`,
    useSystemFonts: true,
  });
  let canvas;
  let result;
  try {
    const document = await loadingTask.promise;
    const documentReadyMs = elapsedMs(loadingStarted);
    const page = await document.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const renderStarted = performance.now();
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    result = {
      documentReadyMs,
      firstPageRenderMs: elapsedMs(renderStarted),
      pageCount: document.numPages,
    };
    page.cleanup();
  } finally {
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
    await loadingTask.destroy();
  }
  const deadline = performance.now() + 2000;
  let serverMetrics;
  do {
    await new Promise((resolve) => setTimeout(resolve, 20));
    serverMetrics = await globalThis
      .fetch(`${baseUrl}/b0/metrics`)
      .then((response) => response.json());
  } while (serverMetrics.activeStreams !== 0 && performance.now() < deadline);
  assert.equal(serverMetrics.activeStreams, 0);
  assert(serverMetrics.requests.some((request) => request.status === 206));
  const sampleSize = (await stat(sample.path)).size;
  const partialFile = serverMetrics.bytesServed < sampleSize;
  if (linearized) {
    assert(
      partialFile,
      JSON.stringify({
        bytesServed: serverMetrics.bytesServed,
        linearized,
        requests: serverMetrics.requests,
        sampleSize,
      }),
    );
  }
  return {
    ...result,
    activeStreamsAfterDestroy: serverMetrics.activeStreams,
    bytesServedBeforeFirstPageDestroy: serverMetrics.bytesServed,
    linearized,
    partialFile,
    rangeRequests: serverMetrics.requests.filter((request) => request.status === 206).length,
    sampleBytes: sampleSize,
    sampleId: sample.id,
  };
}

function findBrowserExecutable() {
  if (process.env.RESEARCH_B0_BROWSER) return process.env.RESEARCH_B0_BROWSER;
  const candidates =
    process.platform === 'darwin'
      ? [
          '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        ]
      : process.platform === 'win32'
        ? [
            path.join(
              process.env['PROGRAMFILES(X86)'] ?? '',
              'Microsoft',
              'Edge',
              'Application',
              'msedge.exe',
            ),
            path.join(
              process.env.PROGRAMFILES ?? '',
              'Microsoft',
              'Edge',
              'Application',
              'msedge.exe',
            ),
            path.join(
              process.env.PROGRAMFILES ?? '',
              'Google',
              'Chrome',
              'Application',
              'chrome.exe',
            ),
          ]
        : ['/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium'];
  return candidates.find((candidate) => candidate && existsSync(candidate)) ?? null;
}

async function runBrowserHarness(baseUrl, tempRoot, getResult) {
  const executable = findBrowserExecutable();
  if (!executable) {
    throw new Error('no Edge/Chrome executable found; set RESEARCH_B0_BROWSER');
  }
  const browserVersion = execFileSync(executable, ['--version'], { encoding: 'utf8' }).trim();
  const profile = path.join(tempRoot, 'browser-profile');
  await mkdir(profile, { recursive: true });
  const child = spawn(
    executable,
    [
      '--headless=new',
      '--disable-background-networking',
      '--disable-component-update',
      '--enable-precise-memory-info',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${profile}`,
      `${baseUrl}/b0/runner.html`,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
    if (stderr.length > 16_000) stderr = stderr.slice(-16_000);
  });
  const childFinished = new Promise((resolve) => {
    child.once('error', (error) => resolve({ error }));
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  const deadline = performance.now() + 60_000;
  let childOutcome = null;
  let result = null;
  let timedOut = false;
  while (!result && !childOutcome && performance.now() < deadline) {
    result = getResult();
    if (result) break;
    childOutcome = await Promise.race([
      childFinished,
      new Promise((resolve) => setTimeout(() => resolve(null), 50)),
    ]);
  }
  result ??= getResult();
  timedOut = !result && !childOutcome;
  if (child.exitCode === null && child.signalCode === null) {
    child.kill(result ? 'SIGTERM' : 'SIGKILL');
    childOutcome = await Promise.race([
      childFinished,
      new Promise((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);
    if (!childOutcome) {
      child.kill('SIGKILL');
      childOutcome = await childFinished;
    }
  }
  if (!result) {
    if (timedOut) throw new Error('browser harness timed out after 60 seconds');
    if (childOutcome.error) throw childOutcome.error;
    throw new Error(
      `browser harness failed (exit ${childOutcome.code}, signal ${childOutcome.signal ?? 'none'}): ${stderr.slice(-1000)}`,
    );
  }
  if (result.status !== 'passed') {
    throw new Error(`browser harness reported failure: ${result.message ?? 'unknown error'}`);
  }
  return { browserVersion, ...result };
}

function normalizeOcrText(value) {
  return value.toLocaleLowerCase().replaceAll(/[^\p{Letter}\p{Number}]+/gu, '');
}

function normalizeLatinText(value) {
  return value.toLocaleLowerCase().replaceAll(/[^a-z0-9]+/g, '');
}

function normalizeHanText(value) {
  return value.replaceAll(/[^\p{Script=Han}]+/gu, '');
}

function levenshtein(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

function textAccuracy(expected, actual) {
  const normalizedExpected = normalizeOcrText(expected);
  const normalizedActual = normalizeOcrText(actual);
  if (normalizedExpected.length === 0) return 0;
  const distance = levenshtein(normalizedExpected, normalizedActual);
  return Number(Math.max(0, 1 - distance / normalizedExpected.length).toFixed(4));
}

let registeredOcrFont;

function getOcrFontFamily() {
  if (registeredOcrFont) return registeredOcrFont;
  const candidates = [
    '/System/Library/Fonts/STHeiti Medium.ttc',
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
    path.join(process.env.WINDIR ?? '', 'Fonts', 'msyh.ttc'),
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  ];
  const selected = candidates.find((candidate) => candidate && existsSync(candidate));
  if (selected && GlobalFonts.registerFromPath(selected, 'ResearchB0CJK')) {
    registeredOcrFont = 'ResearchB0CJK';
  } else {
    registeredOcrFont = 'sans-serif';
  }
  return registeredOcrFont;
}

function makeOcrImage({ large = false } = {}) {
  const width = large ? 2600 : 1600;
  const height = large ? 3400 : 900;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#111111';
  const fontFamily = getOcrFontFamily();
  context.font = `${large ? 44 : 62}px "${fontFamily}"`;
  const lines = large
    ? Array.from({ length: 48 }, (_, index) => `Research page ${index + 1} 本地论文阅读与批注`)
    : ['Research Workbench local OCR', '论文阅读与批注', 'English and 简体中文 2026'];
  lines.forEach((line, index) => context.fillText(line, 80, 120 + index * (large ? 64 : 170)));
  return {
    buffer: canvas.toBuffer('image/png'),
    englishExpected: large
      ? Array.from({ length: 48 }, (_, index) => `Research page ${index + 1}`).join(' ')
      : 'Research Workbench local OCR English and 2026',
    expected: lines.join(' '),
    fontFamily,
    hanExpected: large ? '本地论文阅读与批注'.repeat(48) : '论文阅读与批注简体中文',
  };
}

function launchIsolatedOcr(imagePath, cachePath) {
  const child = spawn(
    process.execPath,
    [path.join(scriptDir, 'research-reader-b0-ocr-worker.mjs'), imagePath, cachePath],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  const exitPromise = new Promise((resolve) =>
    child.once('exit', (code, signal) => resolve({ code, signal, timedOut: false })),
  );
  return {
    child,
    exitPromise,
    getStderr: () => stderr,
    getStdout: () => stdout,
  };
}

async function waitForOcrReady(job) {
  const readyStarted = performance.now();
  while (!job.getStdout().includes('"ready"')) {
    if (job.child.exitCode !== null) {
      throw new Error(`isolated OCR exited before ready: ${job.getStderr().slice(-500)}`);
    }
    if (performance.now() - readyStarted > 10_000) {
      job.child.kill('SIGKILL');
      throw new Error('isolated OCR did not become ready within 10 seconds');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function parseOcrRecords(stdout) {
  return stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function recognizeWithIsolatedOcr(imagePath, cachePath) {
  const job = launchIsolatedOcr(imagePath, cachePath);
  const exit = await job.exitPromise;
  if (exit.code !== 0) {
    throw new Error(`isolated OCR failed: ${job.getStderr().slice(-500)}`);
  }
  const completed = parseOcrRecords(job.getStdout()).find(
    (record) => record.status === 'completed',
  );
  if (!completed) throw new Error('isolated OCR returned no completion record');
  return completed;
}

async function cancelIsolatedOcr(imagePath, cachePath) {
  const job = launchIsolatedOcr(imagePath, cachePath);
  await waitForOcrReady(job);
  const cancelStarted = performance.now();
  job.child.kill('SIGTERM');
  const exit = await Promise.race([
    job.exitPromise,
    new Promise((resolve) =>
      setTimeout(() => resolve({ code: null, signal: null, timedOut: true }), 5000),
    ),
  ]);
  if (!exit.timedOut) return { cancelMs: elapsedMs(cancelStarted), ...exit };
  job.child.kill('SIGKILL');
  const forcedExit = await job.exitPromise;
  return { cancelMs: elapsedMs(cancelStarted), ...forcedExit, timedOut: true };
}

async function renderFirstPageForOcr(sample, tempRoot) {
  const bytes = await readFile(sample.path);
  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    stopEvent: true,
    useSystemFonts: true,
  });
  let canvas;
  try {
    const document = await loadingTask.promise;
    const page = await document.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 2400 / Math.max(baseViewport.width, baseViewport.height));
    const viewport = page.getViewport({ scale });
    canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const renderStarted = performance.now();
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const imagePath = path.join(tempRoot, 'ocr-private-scan.png');
    const image = canvas.toBuffer('image/png');
    await writeFile(imagePath, image);
    return {
      imageBytes: image.length,
      imagePath,
      renderMs: elapsedMs(renderStarted),
      scale: Number(scale.toFixed(2)),
    };
  } finally {
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
    await loadingTask.destroy();
  }
}

async function benchmarkOcr(tempRoot, privateScanSample) {
  const cachePath = path.join(tempRoot, 'tesseract-cache');
  await mkdir(cachePath, { recursive: true });
  const sample = makeOcrImage();
  const cancellationSample = makeOcrImage({ large: true });
  const samplePath = path.join(tempRoot, 'ocr-sample.png');
  const cancellationPath = path.join(tempRoot, 'ocr-cancellation.png');
  await Promise.all([
    writeFile(samplePath, sample.buffer),
    writeFile(cancellationPath, cancellationSample.buffer),
  ]);
  await settleMemory();
  const parentMemoryBeforeMiB = memoryMiB();
  const recognition = await recognizeWithIsolatedOcr(samplePath, cachePath);
  const cancellation = await cancelIsolatedOcr(cancellationPath, cachePath);
  const recovered = await recognizeWithIsolatedOcr(samplePath, cachePath);
  let privateScan = { status: 'not-run; pass a scanned PDF with --pdf' };
  if (privateScanSample) {
    const rendered = await renderFirstPageForOcr(privateScanSample, tempRoot);
    const privateRecognition = await recognizeWithIsolatedOcr(rendered.imagePath, cachePath);
    privateScan = {
      imageBytes: rendered.imageBytes,
      pageRenderMs: rendered.renderMs,
      recognizedCharacters: normalizeOcrText(privateRecognition.text).length,
      recognizeMs: privateRecognition.recognizeMs,
      scale: rendered.scale,
      status: 'completed',
      workerPeakRssMiB: privateRecognition.workerPeakRssMiB,
      workerReadyMs: privateRecognition.workerReadyMs,
    };
  }
  await settleMemory();
  const parentMemoryAfterMiB = memoryMiB();
  const accuracy = textAccuracy(sample.expected, recognition.text);
  return {
    accuracy,
    cancellation,
    englishAccuracy: textAccuracy(
      normalizeLatinText(sample.englishExpected),
      normalizeLatinText(recognition.text),
    ),
    hanAccuracy: textAccuracy(
      normalizeHanText(sample.hanExpected),
      normalizeHanText(recognition.text),
    ),
    parentMemoryAfterMiB,
    parentMemoryBeforeMiB,
    privateScan,
    progressEvents: recognition.progressEvents,
    recognizedText: recognition.text.replaceAll(/\s+/g, ' ').trim(),
    recognizeMs: recognition.recognizeMs,
    recoveredAccuracy: textAccuracy(sample.expected, recovered.text),
    recoveryMs: Number((recovered.workerReadyMs + recovered.recognizeMs).toFixed(2)),
    workerPeakRssMiB: recognition.workerPeakRssMiB,
    testFont: sample.fontFamily,
    workerReadyMs: recognition.workerReadyMs,
  };
}

function environmentRecord() {
  let commit = 'unknown';
  try {
    commit = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
  } catch {
    // The validation still works outside a Git checkout.
  }
  return {
    arch: process.arch,
    commit,
    cpu: os.cpus()[0]?.model ?? 'unknown',
    cpuCount: os.cpus().length,
    date: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    release: os.release(),
    totalMemoryGiB: Number((os.totalmem() / 1024 ** 3).toFixed(2)),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'research-reader-b0-'));
  let harnessServer;
  const keepTemp = options.keepFixtures;
  try {
    const prepared = await prepareSamples(tempRoot, options.pdfPaths);
    harnessServer = await createHarnessServer(prepared.samples, options.port);
    if (options.serve) {
      process.stdout.write(
        `${JSON.stringify(
          {
            fixtureDirectory: options.keepFixtures
              ? prepared.fixtureRoot
              : 'temporary-generated-fixtures',
            manifest: `${harnessServer.baseUrl}/b0/manifest.json`,
            runner: `${harnessServer.baseUrl}/b0/runner.html`,
          },
          null,
          2,
        )}\n`,
      );
      await new Promise((resolve) => {
        process.once('SIGINT', resolve);
        process.once('SIGTERM', resolve);
      });
      return;
    }

    const rangePdfSample = await selectRangePdfSample(prepared.samples);
    const result = {
      encryptedPdf: await inspectEncryptedPdf(prepared.encryptedPath),
      environment: environmentRecord(),
      expectedFailures: [],
      fts5: null,
      ocr: options.ocr ? null : { status: 'not-run; pass --ocr' },
      pdfjs: [],
      range: await validateRanges(harnessServer.baseUrl, prepared.samples[1]),
      rangePdfjs: await inspectPdfOverRange(harnessServer.baseUrl, rangePdfSample),
    };
    const indexedDocuments = [];
    let privateScanSample = null;
    for (const sample of prepared.samples) {
      const inspected = await inspectPdf(sample, options.maxPages);
      result.pdfjs.push({ id: sample.id, kind: sample.kind, ...inspected.metrics });
      indexedDocuments.push({ id: sample.id, texts: inspected.texts });
      if (sample.kind === 'private-local' && inspected.metrics.textPages === 0) {
        privateScanSample ??= sample;
      }
    }
    for (const sample of prepared.expectedFailures) {
      const failure = await inspectExpectedFailure(sample);
      assert.equal(failure.rejected, true);
      result.expectedFailures.push({ id: sample.id, ...failure });
    }
    result.fts5 = benchmarkFts(tempRoot, indexedDocuments);
    if (options.ocr) result.ocr = await benchmarkOcr(tempRoot, privateScanSample);
    if (options.browser) {
      result.browser = await runBrowserHarness(
        harnessServer.baseUrl,
        tempRoot,
        harnessServer.getLastBrowserResult,
      );
    }
    if (options.keepFixtures) result.fixtureDirectory = prepared.fixtureRoot;
    const output = `${JSON.stringify(result, null, 2)}\n`;
    process.stdout.write(output);
    if (options.output) await writeFile(path.resolve(options.output), output);
  } finally {
    if (harnessServer) await harnessServer.close();
    if (!keepTemp) await rm(tempRoot, { force: true, recursive: true });
  }
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      code: 'RESEARCH_READER_B0_FAILED',
      message: error instanceof Error ? error.message : String(error),
    })}\n`,
  );
  process.exitCode = 1;
});
