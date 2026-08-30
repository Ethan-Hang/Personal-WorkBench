#!/usr/bin/env node

import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function parseArgs(argv) {
  const options = { phase: 'c1', output: null, keepData: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--phase') options.phase = argv[++index];
    else if (value === '--output') options.output = argv[++index];
    else if (value === '--keep-data') options.keepData = true;
    else if (value === '--help' || value === '-h') {
      console.log(`Research knowledge visual QA

Usage:
  node scripts/research-knowledge-visual-qa.mjs --phase c1|c2|c3|all [--output PATH] [--keep-data]

Environment:
  RESEARCH_KNOWLEDGE_BROWSER  Edge/Chrome executable override`);
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${value}`);
    }
  }
  if (!['c1', 'c2', 'c3', 'all'].includes(options.phase)) {
    throw new Error('--phase supports c1, c2, c3, or all');
  }
  return options;
}

function pdfEscape(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

function makeTextPdf(pageCount, textPrefix) {
  const fontObjectNumber = 3 + pageCount * 2;
  const pageObjectNumbers = Array.from({ length: pageCount }, (_, index) => 3 + index * 2);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((value) => `${value} 0 R`).join(' ')}] /Count ${pageCount} >>`,
  ];
  for (let index = 0; index < pageCount; index += 1) {
    const pageNumber = index + 1;
    const contentObjectNumber = pageObjectNumbers[index] + 1;
    const content = [
      'BT',
      '/F1 14 Tf',
      '72 720 Td',
      `(${pdfEscape(`${textPrefix} page ${pageNumber}`)}) Tj`,
      '0 -24 Td',
      `(${pdfEscape(`Evidence selection source line ${pageNumber}`)}) Tj`,
      'ET',
    ].join('\n');
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
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    output += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  output += `startxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(output, 'binary');
}

async function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('failed to reserve local port'));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

function startProcess(command, args, options) {
  const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      output += chunk.toString();
      if (output.length > 50_000) output = output.slice(-50_000);
    });
  }
  const finished = new Promise((resolve) => {
    child.once('error', (error) => resolve({ error }));
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  return { child, finished, output: () => output };
}

async function stopProcess(processInfo) {
  if (!processInfo || processInfo.child.exitCode !== null) return;
  processInfo.child.kill('SIGTERM');
  const stopped = await Promise.race([
    processInfo.finished.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 3_000)),
  ]);
  if (!stopped) {
    processInfo.child.kill('SIGKILL');
    await processInfo.finished;
  }
}

async function waitForUrl(url, processInfo, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (processInfo.child.exitCode !== null) {
      throw new Error(`process exited before ${url} was ready:\n${processInfo.output()}`);
    }
    try {
      const response = await globalThis.fetch(url, {
        signal: globalThis.AbortSignal.timeout(5_000),
      });
      if (response.ok) return;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`timed out waiting for ${url}: ${lastError?.message ?? 'unknown error'}`);
}

async function requestJson(url, init) {
  const response = await globalThis.fetch(url, {
    ...init,
    signal: init?.signal ?? globalThis.AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${url}: ${body.error ?? response.status}`);
  }
  return body;
}

async function createCanonicalBundle(apiBase, targetPath) {
  const options = {
    targetPath,
    includeManagedFiles: false,
    includeLinkedFiles: false,
  };
  await requestJson(`${apiBase}/api/research/v1/exports/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  let job = await requestJson(`${apiBase}/api/research/v1/exports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  for (let attempt = 0; attempt < 200 && ['draft', 'running'].includes(job.status); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    job = await requestJson(`${apiBase}/api/research/v1/exports/${job.id}`);
  }
  if (job.status !== 'completed') {
    throw new Error(`canonical QA bundle failed: ${job.status} ${job.errorCode ?? ''}`);
  }
  return path.join(targetPath, 'library.json');
}

async function seedPdf(apiBase, bytes, fileName, title) {
  const requestId = `knowledge-visual-${randomUUID()}`;
  const params = new globalThis.URLSearchParams({ fileName, requestId });
  const session = await requestJson(`${apiBase}/api/research/v1/import-sessions/upload?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/pdf' },
    body: bytes,
  });
  const inspection = await requestJson(
    `${apiBase}/api/research/v1/import-sessions/${session.id}/inspect`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allowExternal: false }),
    },
  );
  const inspected = inspection.items?.[0];
  if (!inspected?.item?.id || !inspected.asset?.id) {
    throw new Error(`inspection did not produce an Asset for ${fileName}`);
  }
  const committed = await requestJson(
    `${apiBase}/api/research/v1/import-sessions/${session.id}/confirm`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemId: inspected.item.id,
        duplicateDecision: 'new-work',
        collectionIds: [],
        fields: {
          title: { value: title, sourceKind: 'user', sourceRecordId: null },
          authors: { value: ['Visual QA'], sourceKind: 'user', sourceRecordId: null },
          type: { value: 'article', sourceKind: 'user', sourceRecordId: null },
        },
        requestId: `${requestId}-confirm`,
      }),
    },
  );
  const detail = await requestJson(`${apiBase}/api/research/v1/works/${committed.workId}`);
  const edition = detail.editions?.[0];
  const attachment = edition?.attachments?.[0];
  if (!edition?.id || !attachment?.assetId) {
    throw new Error(`committed work did not expose an Asset for ${fileName}`);
  }
  return {
    assetId: attachment.assetId,
    contentHash: attachment.asset.contentHash,
    editionId: edition.id,
    workId: committed.workId,
  };
}

function anchor(asset, pageNumber, exact) {
  return {
    pageNumber,
    pageSize: { width: 612, height: 792 },
    rect: { x: 72, y: 680, width: 280, height: 22 },
    quads: [{ x1: 72, y1: 702, x2: 352, y2: 702, x3: 72, y3: 680, x4: 352, y4: 680 }],
    textQuote: {
      exact,
      prefix: 'before ',
      suffix: ' after',
      fingerprint: 'd'.repeat(64),
    },
    assetHash: asset.contentHash,
    editionId: asset.editionId,
  };
}

async function createAnnotation(apiBase, asset, body) {
  return requestJson(`${apiBase}/api/research/v1/assets/${asset.assetId}/annotations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contextId: null,
      kind: 'highlight',
      anchor: anchor(asset, 1, body),
      body,
      color: '#facc15',
    }),
  });
}

async function createEvidence(apiBase, annotationId, title, summary, sourceKind = 'pdf') {
  return requestJson(`${apiBase}/api/research/v1/evidence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'annotation',
      contextId: null,
      annotationId,
      sourceKind,
      title,
      summary,
      notes: null,
    }),
  });
}

async function seedSourceStates(apiBase, databasePath, assets) {
  const revisedAnnotation = await createAnnotation(
    apiBase,
    assets.revised,
    'Revision state evidence with enough text to verify wrapping in the evidence inbox.',
  );
  await createEvidence(
    apiBase,
    revisedAnnotation.id,
    'Source annotation revised',
    'The saved source snapshot must remain visible after a human changes the annotation.',
  );
  await requestJson(`${apiBase}/api/research/v1/annotations/${revisedAnnotation.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: 'Human revision after evidence', expectedRevision: 1 }),
  });

  const deletedAnnotation = await createAnnotation(
    apiBase,
    assets.deleted,
    'Deleted source annotation',
  );
  await createEvidence(
    apiBase,
    deletedAnnotation.id,
    'Source annotation deleted',
    'The evidence remains reviewable while its source annotation is deleted.',
  );
  await requestJson(`${apiBase}/api/research/v1/annotations/${deletedAnnotation.id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedRevision: 1 }),
  });

  const mismatchAnnotation = await createAnnotation(
    apiBase,
    assets.mismatch,
    'Asset mismatch source annotation',
  );
  await createEvidence(
    apiBase,
    mismatchAnnotation.id,
    'File content changed',
    'The current Asset hash no longer matches the creation snapshot.',
  );

  const unavailableAnnotation = await createAnnotation(
    apiBase,
    assets.unavailable,
    'Unavailable source annotation',
  );
  await createEvidence(
    apiBase,
    unavailableAnnotation.id,
    'Source unavailable',
    'The linked or managed source cannot currently be resolved.',
  );

  const sqlite = new Database(databasePath);
  try {
    sqlite.pragma('busy_timeout = 5000');
    sqlite
      .prepare('UPDATE research_assets SET content_hash = ? WHERE id = ?')
      .run('e'.repeat(64), assets.mismatch.assetId);
    sqlite
      .prepare(`UPDATE research_asset_locations SET state = 'missing' WHERE asset_id = ?`)
      .run(assets.unavailable.assetId);
  } finally {
    sqlite.close();
  }
}

async function seedClaimsAndMatrix(apiBase, assets) {
  const supportingAnnotation = await createAnnotation(
    apiBase,
    assets.current,
    'The primary paper supports a durable effect.',
  );
  const qualifyingAnnotation = await createAnnotation(
    apiBase,
    assets.revised,
    'The comparison paper narrows the effect to one sample.',
  );
  const supportingEvidence = await createEvidence(
    apiBase,
    supportingAnnotation.id,
    'Durable effect',
    'The main estimate remains stable across specifications.',
  );
  const qualifyingEvidence = await createEvidence(
    apiBase,
    qualifyingAnnotation.id,
    'Sample boundary',
    'The effect weakens outside the original sample.',
  );
  await requestJson(`${apiBase}/api/research/v1/claims`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      statement: 'Open question awaiting evidence.',
      rationale: 'This stays visible without forcing a premature link.',
      status: 'active',
    }),
  });
  const claim = await requestJson(`${apiBase}/api/research/v1/claims`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      statement: 'The effect is durable but sample-dependent.',
      rationale: 'Compare robustness with external validity.',
      status: 'active',
    }),
  });
  for (const [evidenceId, relation] of [
    [supportingEvidence.id, 'supports'],
    [qualifyingEvidence.id, 'qualifies'],
  ]) {
    await requestJson(`${apiBase}/api/research/v1/claims/${claim.id}/evidence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evidenceId, relation }),
    });
  }
  const matrix = await requestJson(`${apiBase}/api/research/v1/matrices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Cross-paper evidence map',
      description: 'Compare support, limits, and sample conditions.',
    }),
  });
  const structured = await requestJson(
    `${apiBase}/api/research/v1/matrices/${matrix.id}/structure`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedStructureRevision: matrix.structureRevision,
        columns: [
          { workId: assets.current.workId, position: 0 },
          { workId: assets.revised.workId, position: 1 },
          { workId: assets.deleted.workId, position: 2 },
          { workId: assets.mismatch.workId, position: 3 },
        ],
        rows: [
          { kind: 'claim', claimId: claim.id, position: 0 },
          { kind: 'dimension', title: 'Sample and method', position: 1 },
          { kind: 'dimension', title: 'Reported limitation', position: 2 },
        ],
      }),
    },
  );
  const claimRow = structured.rows.find((row) => row.kind === 'claim');
  for (const [column, evidence, synthesis] of [
    [structured.columns[0], supportingEvidence, 'Supports the durable-effect portion.'],
    [structured.columns[1], qualifyingEvidence, 'Narrows the effect to the original sample.'],
  ]) {
    const cell = await requestJson(`${apiBase}/api/research/v1/matrices/${matrix.id}/cells`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rowId: claimRow.id, columnId: column.id, synthesis }),
    });
    await requestJson(`${apiBase}/api/research/v1/matrix-cells/${cell.id}/evidence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evidenceId: evidence.id }),
    });
    await requestJson(`${apiBase}/api/research/v1/matrix-cells/${cell.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: cell.revision }),
    });
  }
  await requestJson(`${apiBase}/api/research/v1/annotations/${supportingAnnotation.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: 'Source revised after matrix review', expectedRevision: 1 }),
  });
  return { claim, matrix, supportingEvidence, qualifyingEvidence };
}

async function seedWritingBoard(apiBase, resources) {
  const notes = await requestJson(`${apiBase}/api/research/v1/notes?limit=100`);
  const note = notes.notes?.[0];
  if (!note) throw new Error('writing QA requires the browser-created note');
  const document = await requestJson(`${apiBase}/api/research/v1/writing-documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Sourced literature review draft with a deliberately long working title',
    }),
  });
  const structured = await requestJson(
    `${apiBase}/api/research/v1/writing-documents/${document.id}/structure`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedStructureRevision: document.structureRevision,
        sections: [
          {
            title: 'Argument and evidence',
            position: 0,
            blocks: [
              {
                kind: 'text',
                text: 'The working argument connects the main estimate to its sample boundary.',
                position: 0,
              },
              { kind: 'note', targetId: note.id, position: 1 },
              { kind: 'evidence', targetId: resources.supportingEvidence.id, position: 2 },
              { kind: 'claim', targetId: resources.claim.id, position: 3 },
              { kind: 'matrix', targetId: resources.matrix.id, position: 4 },
            ],
          },
          {
            title: 'Limitations and next steps',
            position: 1,
            blocks: [
              {
                kind: 'text',
                text: 'The comparison still needs a broader population and a second replication.',
                position: 0,
              },
              { kind: 'evidence', targetId: resources.qualifyingEvidence.id, position: 1 },
            ],
          },
        ],
      }),
    },
  );
  return structured;
}

function findBrowserExecutable() {
  if (process.env.RESEARCH_KNOWLEDGE_BROWSER) return process.env.RESEARCH_KNOWLEDGE_BROWSER;
  if (process.env.RESEARCH_READER_BROWSER) return process.env.RESEARCH_READER_BROWSER;
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
              'Google',
              'Chrome',
              'Application',
              'chrome.exe',
            ),
          ]
        : ['/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium'];
  return candidates.find((candidate) => candidate && existsSync(candidate)) ?? null;
}

async function waitForDevtoolsPort(profilePath, processInfo) {
  const portFile = path.join(profilePath, 'DevToolsActivePort');
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (processInfo.child.exitCode !== null) {
      throw new Error(`browser exited before DevTools was ready:\n${processInfo.output()}`);
    }
    try {
      const value = await readFile(portFile, 'utf8');
      const port = Number(value.split(/\r?\n/, 1)[0]);
      if (Number.isInteger(port) && port > 0) return port;
    } catch {
      // Browser has not written its endpoint yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`browser DevTools endpoint timed out:\n${processInfo.output()}`);
}

async function connectCdp(webSocketUrl) {
  const socket = new globalThis.WebSocket(webSocketUrl);
  const pending = new Map();
  const events = [];
  let sequence = 0;
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('DevTools WebSocket failed')), {
      once: true,
    });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id === undefined) {
      if (['Runtime.exceptionThrown', 'Log.entryAdded'].includes(message.method)) {
        events.push(message);
      }
      return;
    }
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    globalThis.clearTimeout(waiter.timer);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  socket.addEventListener('close', () => {
    for (const waiter of pending.values()) {
      globalThis.clearTimeout(waiter.timer);
      waiter.reject(new Error('DevTools WebSocket closed before the command completed'));
    }
    pending.clear();
  });
  return {
    close: () => socket.close(),
    events,
    send(method, params = {}) {
      sequence += 1;
      const id = sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`DevTools command timed out: ${method}`));
        }, 15_000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

async function evaluateValue(cdp, expression) {
  const evaluated = await cdp.send('Runtime.evaluate', { expression, returnByValue: true });
  if (evaluated.exceptionDetails) {
    throw new Error(
      evaluated.exceptionDetails.exception?.description ?? 'browser evaluation failed',
    );
  }
  return evaluated.result?.value;
}

async function waitForExpression(cdp, expression, message, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await evaluateValue(cdp, expression)) === true) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}

async function drag(cdp, startX, startY, endX, endY) {
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: startX,
    y: startY,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  for (let step = 1; step <= 5; step += 1) {
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: startX + ((endX - startX) * step) / 5,
      y: startY + ((endY - startY) * step) / 5,
      button: 'left',
      buttons: 1,
    });
  }
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: endX,
    y: endY,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
}

async function openBrowserSession({ browser, profilePath, url, width, height }) {
  await mkdir(profilePath, { recursive: true });
  const browserProcess = startProcess(browser, [
    '--headless=new',
    '--disable-background-networking',
    '--disable-component-update',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profilePath}`,
    '--remote-debugging-port=0',
    'about:blank',
  ]);
  let cdp;
  try {
    const port = await waitForDevtoolsPort(profilePath, browserProcess);
    const targets = await globalThis
      .fetch(`http://127.0.0.1:${port}/json/list`, {
        signal: globalThis.AbortSignal.timeout(15_000),
      })
      .then((response) => response.json());
    const target = targets.find((candidate) => candidate.type === 'page');
    if (!target?.webSocketDebuggerUrl) throw new Error('browser page target is unavailable');
    cdp = await connectCdp(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send('Page.navigate', { url });
    return { browserProcess, cdp, height, width };
  } catch (error) {
    cdp?.close();
    await stopProcess(browserProcess);
    throw error;
  }
}

async function closeBrowserSession(session) {
  session?.cdp.close();
  await stopProcess(session?.browserProcess);
}

async function inspectPng(filePath) {
  const bytes = await readFile(filePath);
  if (bytes.length < 24 || bytes.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error(`browser did not create a PNG: ${filePath}`);
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length };
}

async function screenshot(session, outputPath) {
  const captured = await session.cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(outputPath, Buffer.from(captured.data, 'base64'));
  const png = await inspectPng(outputPath);
  if (png.width !== session.width || png.height !== session.height) {
    throw new Error(
      `screenshot size ${png.width}x${png.height}, expected ${session.width}x${session.height}`,
    );
  }
  return png;
}

function clickButtonExpression(label) {
  return `(() => {
    const button = Array.from(document.querySelectorAll('button')).find(
      (node) => node.textContent?.trim() === ${JSON.stringify(label)} && !node.disabled
    );
    if (!button) return false;
    button.click();
    return true;
  })()`;
}

async function saveComposer(cdp, { sourceKind = 'pdf', summary = null } = {}) {
  await waitForExpression(
    cdp,
    `document.querySelector('[role="dialog"]')?.textContent?.includes('提炼为证据') === true`,
    'Evidence Composer did not open',
  );
  if (summary !== null) {
    await evaluateValue(
      cdp,
      `(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const areas = dialog?.querySelectorAll('textarea');
        const input = areas?.[0];
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(summary)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`,
    );
  }
  if (sourceKind === 'ocr') {
    await evaluateValue(
      cdp,
      `(() => {
        const select = document.querySelector('[role="dialog"] select');
        if (!select) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        setter.call(select, 'ocr');
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`,
    );
  }
  if (!(await evaluateValue(cdp, clickButtonExpression('保存证据')))) {
    throw new Error('Evidence Composer save button is unavailable');
  }
  await waitForExpression(
    cdp,
    `document.querySelector('[role="dialog"]') === null`,
    'Evidence Composer did not close after save',
  );
}

async function browserEvidenceRoundTrip({ browser, outputRoot, profileRoot, webBase, asset }) {
  const session = await openBrowserSession({
    browser,
    profilePath: path.join(profileRoot, 'roundtrip'),
    url: `${webBase}/research/read/${encodeURIComponent(asset.assetId)}`,
    width: 1440,
    height: 900,
  });
  const { cdp } = session;
  try {
    await waitForExpression(
      cdp,
      `document.querySelector('[aria-label="第 1 页"]') !== null &&
       document.querySelector('.textLayer span') !== null`,
      'generated PDF text layer did not render',
      30_000,
    );

    if (!(await evaluateValue(cdp, clickButtonExpression('提炼文字')))) {
      throw new Error('text evidence tool is unavailable');
    }
    await waitForExpression(
      cdp,
      `Array.from(document.querySelectorAll('button')).some((node) =>
        node.textContent?.trim() === '提炼文字' && node.getAttribute('aria-pressed') === 'true')`,
      'text evidence tool did not become active',
    );
    const textRect = await evaluateValue(
      cdp,
      `(() => {
        const span = Array.from(document.querySelectorAll('.textLayer span')).find((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.width > 40 && bounds.height > 0 && bounds.top > 0 && bounds.bottom < innerHeight;
        });
        if (!span) return null;
        const bounds = span.getBoundingClientRect();
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
      })()`,
    );
    if (!textRect) throw new Error('no visible PDF text is available for evidence selection');
    const textY = textRect.y + textRect.height / 2;
    await drag(cdp, textRect.x + 2, textY, textRect.x + textRect.width - 2, textY);
    await saveComposer(cdp);

    if (!(await evaluateValue(cdp, clickButtonExpression('提炼区域')))) {
      throw new Error('area evidence tool is unavailable');
    }
    await waitForExpression(
      cdp,
      `Array.from(document.querySelectorAll('button')).some((node) =>
        node.textContent?.trim() === '提炼区域' && node.getAttribute('aria-pressed') === 'true')`,
      'area evidence tool did not become active',
    );
    const pageBounds = await evaluateValue(
      cdp,
      `(() => {
        const page = document.querySelector('[aria-label="第 1 页"]');
        if (!page) return null;
        const bounds = page.getBoundingClientRect();
        return { left: bounds.left, top: bounds.top };
      })()`,
    );
    if (!pageBounds) throw new Error('PDF page is unavailable for region evidence');
    await drag(
      cdp,
      pageBounds.left + 300,
      pageBounds.top + 200,
      pageBounds.left + 410,
      pageBounds.top + 290,
    );
    await saveComposer(cdp, { summary: 'Browser-created region evidence.' });

    const panelVisible = await evaluateValue(cdp, `document.body.innerText.includes('阅读面板')`);
    if (!panelVisible && !(await evaluateValue(cdp, clickButtonExpression('导航与批注')))) {
      throw new Error('reader side panel could not be opened');
    }
    await waitForExpression(
      cdp,
      `Array.from(document.querySelectorAll('article')).some((article) =>
        article.textContent?.includes('OCR proxy annotation'))`,
      'OCR proxy annotation did not render in the reader panel',
    );
    const openedOcrComposer = await evaluateValue(
      cdp,
      `(() => {
        const article = Array.from(document.querySelectorAll('article')).find((node) =>
          node.textContent?.includes('OCR proxy annotation'));
        const button = Array.from(article?.querySelectorAll('button') ?? []).find((node) =>
          node.textContent?.trim() === '提炼');
        if (!button) return false;
        button.click();
        return true;
      })()`,
    );
    if (!openedOcrComposer) throw new Error('OCR proxy annotation could not open the composer');
    await saveComposer(cdp, { sourceKind: 'ocr' });
    const readerPng = await screenshot(
      session,
      path.join(outputRoot, 'reader-created-evidence.png'),
    );

    await cdp.send('Page.navigate', { url: `${webBase}/research/knowledge` });
    await waitForExpression(
      cdp,
      `document.body.innerText.includes('研究知识') &&
       document.body.innerText.includes('批注已修订') &&
       document.body.innerText.includes('批注已删除') &&
       document.body.innerText.includes('文件已变化') &&
       document.body.innerText.includes('不可用')`,
      'knowledge workspace did not show every source state',
      30_000,
    );
    if (!(await evaluateValue(cdp, clickButtonExpression('新建')))) {
      throw new Error('knowledge note create button is unavailable');
    }
    await waitForExpression(
      cdp,
      `document.querySelector('[aria-label="笔记标题"]') !== null`,
      'new note did not open in the editor',
    );
    const firstEvidenceOpened = await evaluateValue(
      cdp,
      `(() => {
        const heading = Array.from(document.querySelectorAll('p')).find((node) =>
          node.textContent?.trim() === '证据流');
        const pane = heading?.closest('main');
        const button = pane?.querySelector('button');
        if (!button) return false;
        button.click();
        return true;
      })()`,
    );
    if (!firstEvidenceOpened) throw new Error('evidence inspector could not be opened');
    await waitForExpression(
      cdp,
      `Array.from(document.querySelectorAll('button')).some((node) =>
        node.textContent?.trim() === '关联证据')`,
      'evidence-to-note relationship action did not render',
    );
    await evaluateValue(cdp, clickButtonExpression('关联证据'));
    await waitForExpression(
      cdp,
      `document.body.innerText.includes('证据已关联到笔记')`,
      'evidence was not linked to the current note',
    );
    const sourceHref = await evaluateValue(
      cdp,
      `document.querySelector('a[href^="/research/read/"]')?.getAttribute('href') ?? null`,
    );
    if (!sourceHref?.includes('annotation=')) {
      throw new Error(`stable source link is incomplete: ${sourceHref}`);
    }
    await cdp.send('Page.navigate', { url: `${webBase}${sourceHref}` });
    await waitForExpression(
      cdp,
      `(() => {
        const id = new URL(location.href).searchParams.get('annotation');
        return Boolean(id && document.querySelector('[data-annotation-id="' + id + '"]'));
      })()`,
      'knowledge source link did not locate the original annotation',
      30_000,
    );
    const roundtripPng = await screenshot(
      session,
      path.join(outputRoot, 'knowledge-source-roundtrip.png'),
    );
    const overflow = await evaluateValue(
      cdp,
      `document.documentElement.scrollWidth > document.documentElement.clientWidth`,
    );
    if (overflow) throw new Error('roundtrip reader has horizontal page overflow');
    return { readerPng, roundtripPng, sourceHref };
  } finally {
    await closeBrowserSession(session);
  }
}

async function captureKnowledgeState({
  browser,
  outputRoot,
  profileRoot,
  webBase,
  width,
  empty = false,
  mode = 'sources',
}) {
  const id = empty ? 'empty' : mode === 'sources' ? 'source-states' : mode;
  const session = await openBrowserSession({
    browser,
    profilePath: path.join(profileRoot, `${id}-${width}`),
    url: `${webBase}/research/knowledge`,
    width,
    height: 900,
  });
  try {
    await waitForExpression(
      session.cdp,
      `document.body.innerText.includes('研究知识') &&
       Array.from(document.querySelectorAll('button')).some((node) =>
         node.textContent?.trim() === '观点') &&
       Array.from(document.querySelectorAll('button')).some((node) =>
         node.textContent?.trim() === '矩阵') &&
       Array.from(document.querySelectorAll('button')).some((node) =>
         node.textContent?.trim() === '写作')`,
      `${id} knowledge page did not render at ${width}px`,
      30_000,
    );
    if (mode === 'claims') {
      if (!(await evaluateValue(session.cdp, clickButtonExpression('观点')))) {
        throw new Error('claim workspace could not be selected');
      }
      await waitForExpression(
        session.cdp,
        `document.body.innerText.includes('The effect is durable but sample-dependent.') &&
         document.body.innerText.includes('Open question awaiting evidence.')`,
        `claim workspace did not render at ${width}px`,
      );
    } else if (mode === 'matrices') {
      if (!(await evaluateValue(session.cdp, clickButtonExpression('矩阵')))) {
        throw new Error('matrix workspace could not be selected');
      }
      await waitForExpression(
        session.cdp,
        `document.body.innerText.includes('Cross-paper evidence map') &&
         document.body.innerText.includes('4 篇文献 × 3 行') &&
         document.body.innerText.includes('需要复核')`,
        `matrix workspace did not render at ${width}px`,
      );
    } else if (mode === 'writing') {
      if (!(await evaluateValue(session.cdp, clickButtonExpression('写作')))) {
        throw new Error('writing workspace could not be selected');
      }
      try {
        await waitForExpression(
          session.cdp,
          `Array.from(document.querySelectorAll('input')).some((node) =>
             node.value.includes('Sourced literature review draft')) &&
           Array.from(document.querySelectorAll('input')).some((node) =>
             node.value === 'Argument and evidence') &&
           document.body.innerText.includes('The effect is durable but sample-dependent.') &&
           document.body.innerText.includes('查看来源')`,
          `writing workspace did not render at ${width}px`,
        );
      } catch (error) {
        const state = await evaluateValue(
          session.cdp,
          `({
            inputs: Array.from(document.querySelectorAll('input')).map((node) => node.value),
            text: document.body.innerText.slice(0, 4000)
          })`,
        );
        throw new Error(`${error.message}: ${JSON.stringify(state)}`);
      }
    } else if (mode === 'export') {
      if (!(await evaluateValue(session.cdp, clickButtonExpression('导出研究内容')))) {
        throw new Error('knowledge export dialog could not be opened');
      }
      await waitForExpression(
        session.cdp,
        `document.querySelector('[role="dialog"]')?.textContent?.includes('导出研究内容') === true &&
         document.querySelector('[role="dialog"] select') !== null &&
         Array.from(document.querySelectorAll('[role="dialog"] button')).some((node) =>
           node.textContent?.trim() === '预览' && !node.disabled)`,
        `knowledge export dialog did not render at ${width}px`,
      );
      const targetPath = path.join(outputRoot, `knowledge-export-preview-${width}.md`);
      await evaluateValue(
        session.cdp,
        `(() => {
          const input = document.querySelector('input[placeholder*=".md / .csv"]');
          if (!input) return false;
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(input, ${JSON.stringify(targetPath)});
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        })()`,
      );
      if (!(await evaluateValue(session.cdp, clickButtonExpression('预览')))) {
        throw new Error('knowledge export preview could not be submitted');
      }
      await waitForExpression(
        session.cdp,
        `document.querySelector('[role="dialog"]')?.textContent?.includes('来源引用') === true &&
         document.querySelector('[role="dialog"]')?.textContent?.includes('预计大小') === true`,
        `knowledge export preview did not render at ${width}px`,
      );
    } else if (mode === 'search') {
      if (!(await evaluateValue(session.cdp, clickButtonExpression('搜索知识')))) {
        throw new Error('knowledge search could not be opened');
      }
      await waitForExpression(
        session.cdp,
        `document.body.innerText.includes('搜索研究知识') &&
         document.querySelector('input[placeholder="输入标题、正文或原文关键词"]') !== null`,
        `knowledge search did not render at ${width}px`,
      );
      await evaluateValue(
        session.cdp,
        `(() => {
          const input = document.querySelector('input[placeholder="输入标题、正文或原文关键词"]');
          if (!input) return false;
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(input, 'durable');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        })()`,
      );
      if (!(await evaluateValue(session.cdp, clickButtonExpression('搜索')))) {
        throw new Error('knowledge search could not be submitted');
      }
      await waitForExpression(
        session.cdp,
        `document.body.innerText.includes('Durable effect') &&
         document.body.innerText.includes('The effect is durable but sample-dependent.') &&
         document.querySelector('a[href^="/research/read/"]') !== null &&
         document.querySelector('a[href^="/research/knowledge?"]') !== null`,
        `knowledge search results did not render at ${width}px`,
      );
    } else if (empty) {
      if (!(await evaluateValue(session.cdp, clickButtonExpression('回收站')))) {
        throw new Error('knowledge trash view could not be selected');
      }
      await waitForExpression(
        session.cdp,
        `document.body.innerText.includes('回收站里没有证据。')`,
        'empty evidence state did not render',
      );
    } else {
      await waitForExpression(
        session.cdp,
        `document.body.innerText.includes('证据流')`,
        `source workspace did not render at ${width}px`,
      );
      await waitForExpression(
        session.cdp,
        `document.body.innerText.includes('批注已修订') &&
         document.body.innerText.includes('批注已删除') &&
         document.body.innerText.includes('文件已变化') &&
         document.body.innerText.includes('不可用')`,
        `source states did not render at ${width}px`,
      );
    }
    const responsive = await evaluateValue(
      session.cdp,
      `({
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        tabs: Array.from(document.querySelectorAll('[role="tab"]')).filter((node) =>
          ['笔记', '证据', '检查'].includes(node.textContent?.trim())).length,
        desktopColumns: getComputedStyle(document.querySelector('main')?.parentElement ?? document.body).display
      })`,
    );
    if (responsive.overflow) throw new Error(`${id} has horizontal overflow at ${width}px`);
    if (mode === 'sources' && width === 390 && responsive.tabs !== 3) {
      throw new Error('390px knowledge workspace did not switch to single-pane tabs');
    }
    const outputPath = path.join(outputRoot, `${id}-${width}.png`);
    const png = await screenshot(session, outputPath);
    const browserErrors = session.cdp.events.filter(
      (event) =>
        event.method === 'Runtime.exceptionThrown' ||
        (event.params?.entry?.level === 'error' &&
          String(event.params.entry.url ?? '').includes('/api/research/')),
    );
    if (browserErrors.length > 0) {
      throw new Error(`${id} browser emitted errors: ${JSON.stringify(browserErrors)}`);
    }
    return { id, width, height: 900, ...png, screenshotPath: outputPath };
  } finally {
    await closeBrowserSession(session);
  }
}

async function captureCanonicalRestorePreview({
  browser,
  outputRoot,
  profileRoot,
  webBase,
  width,
  sourcePath,
}) {
  const id = 'canonical-restore';
  const session = await openBrowserSession({
    browser,
    profilePath: path.join(profileRoot, `${id}-${width}`),
    url: `${webBase}/research`,
    width,
    height: 900,
  });
  try {
    await waitForExpression(
      session.cdp,
      `document.body.innerText.includes('文献库') &&
       Array.from(document.querySelectorAll('button')).some((node) =>
         node.textContent?.trim() === '恢复资料包')`,
      `research library did not render restore entry at ${width}px`,
      30_000,
    );
    if (!(await evaluateValue(session.cdp, clickButtonExpression('恢复资料包')))) {
      throw new Error('canonical restore dialog could not be opened');
    }
    await waitForExpression(
      session.cdp,
      `document.querySelector('[role="dialog"]')?.textContent?.includes('恢复研究资料包') === true`,
      `canonical restore dialog did not render at ${width}px`,
    );
    await evaluateValue(
      session.cdp,
      `(() => {
        const input = document.querySelector('input[placeholder*="library.json"]');
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(sourcePath)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`,
    );
    if (!(await evaluateValue(session.cdp, clickButtonExpression('预览')))) {
      throw new Error('canonical restore preview could not be submitted');
    }
    await waitForExpression(
      session.cdp,
      `document.querySelector('[role="dialog"]')?.textContent?.includes('当前资料库有数据，不能恢复') === true &&
       document.querySelector('[role="dialog"]')?.textContent?.includes('ID 冲突') === true &&
       document.querySelector('[role="dialog"]')?.textContent?.includes('预计复制') === true`,
      `canonical restore preview did not render at ${width}px`,
      30_000,
    );
    const overflow = await evaluateValue(
      session.cdp,
      `document.documentElement.scrollWidth > document.documentElement.clientWidth`,
    );
    if (overflow) throw new Error(`canonical restore has horizontal overflow at ${width}px`);
    const outputPath = path.join(outputRoot, `${id}-${width}.png`);
    const png = await screenshot(session, outputPath);
    const browserErrors = session.cdp.events.filter(
      (event) =>
        event.method === 'Runtime.exceptionThrown' ||
        (event.params?.entry?.level === 'error' &&
          String(event.params.entry.url ?? '').includes('/api/research/')),
    );
    if (browserErrors.length > 0) {
      throw new Error(`${id} browser emitted errors: ${JSON.stringify(browserErrors)}`);
    }
    return { id, width, height: 900, ...png, screenshotPath: outputPath };
  } finally {
    await closeBrowserSession(session);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const browser = findBrowserExecutable();
  if (!browser) throw new Error('no Edge/Chrome executable found; set RESEARCH_KNOWLEDGE_BROWSER');
  const browserVersion = execFileSync(browser, ['--version'], { encoding: 'utf8' }).trim();
  const stamp = new Date().toISOString().replaceAll(/[^0-9A-Za-z]+/g, '-');
  const outputRoot = path.resolve(
    options.output ?? path.join(repoRoot, 'test-results', 'research-knowledge', `visual-${stamp}`),
  );
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'research-knowledge-visual-qa-'));
  const profileRoot = path.join(tempRoot, 'profiles');
  const databasePath = path.join(tempRoot, 'visual-qa.db');
  const dataDir = path.join(tempRoot, 'data');
  await mkdir(outputRoot, { recursive: true });
  const serverPort = await reservePort();
  const webPort = await reservePort();
  const apiBase = `http://127.0.0.1:${serverPort}`;
  const webBase = `http://127.0.0.1:${webPort}`;
  let serverProcess;
  let webProcess;
  try {
    serverProcess = startProcess(npmExecutable, ['run', 'dev:server'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PORT: String(serverPort),
        WORKBENCH_DATA_DIR: dataDir,
        WORKBENCH_DB: databasePath,
        WORKBENCH_LOG: path.join(tempRoot, 'server.log'),
      },
    });
    webProcess = startProcess(
      npmExecutable,
      ['run', 'dev:web', '--', '--port', String(webPort), '--strictPort'],
      {
        cwd: repoRoot,
        env: { ...process.env, WORKBENCH_API_TARGET: apiBase },
      },
    );
    await Promise.all([
      waitForUrl(`${apiBase}/api/health`, serverProcess),
      waitForUrl(`${webBase}/`, webProcess),
    ]);

    const assetEntries = await Promise.all(
      [
        ['current', 'Knowledge Visual Current'],
        ['revised', 'Knowledge Visual Revised'],
        ['deleted', 'Knowledge Visual Deleted'],
        ['mismatch', 'Knowledge Visual Mismatch'],
        [
          'unavailable',
          'Knowledge Visual Unavailable With A Deliberately Long Research Paper Title For Layout QA',
        ],
      ].map(async ([key, title]) => [
        key,
        await seedPdf(apiBase, makeTextPdf(4, title), `${key}.pdf`, title),
      ]),
    );
    const assets = Object.fromEntries(assetEntries);
    await seedSourceStates(apiBase, databasePath, assets);

    const ocrAnnotation = await createAnnotation(apiBase, assets.current, 'OCR proxy annotation');
    const sqlite = new Database(databasePath);
    try {
      sqlite.pragma('busy_timeout = 5000');
      sqlite
        .prepare(
          `INSERT INTO research_ocr_page_cache
           (asset_id, asset_hash, page_number, languages_key, engine, engine_version,
            language_pack_version, text_content, position_json, created_at, updated_at)
           VALUES (?, ?, 1, 'eng', 'tesseract', '7.0.0', 'visual-packs-1',
                   'OCR proxy annotation', NULL, ?, ?)`,
        )
        .run(
          assets.current.assetId,
          assets.current.contentHash,
          new Date().toISOString(),
          new Date().toISOString(),
        );
    } finally {
      sqlite.close();
    }
    if (!ocrAnnotation.id) throw new Error('OCR proxy annotation was not created');

    const roundtrip = await browserEvidenceRoundTrip({
      browser,
      outputRoot,
      profileRoot,
      webBase,
      asset: assets.current,
    });
    const evidencePage = await requestJson(`${apiBase}/api/research/v1/evidence?limit=100`);
    if (evidencePage.evidence?.length < 7) {
      throw new Error(
        `browser and seeded flows produced only ${evidencePage.evidence?.length ?? 0} evidence`,
      );
    }
    if (!evidencePage.evidence.some((item) => item.sourceSnapshot?.sourceKind === 'ocr')) {
      throw new Error('browser OCR proxy flow did not create OCR evidence');
    }
    let comparisonResources = null;
    if (options.phase === 'c2' || options.phase === 'c3' || options.phase === 'all') {
      comparisonResources = await seedClaimsAndMatrix(apiBase, assets);
    }
    if (options.phase === 'c3' || options.phase === 'all') {
      await seedWritingBoard(apiBase, comparisonResources);
    }
    const canonicalSourcePath =
      options.phase === 'c3' || options.phase === 'all'
        ? await createCanonicalBundle(apiBase, path.join(tempRoot, 'canonical-preview-bundle'))
        : null;

    const captures = [];
    const modes =
      options.phase === 'c1'
        ? ['sources']
        : options.phase === 'c2'
          ? ['claims', 'matrices']
          : options.phase === 'c3'
            ? ['writing', 'search', 'export']
            : ['sources', 'claims', 'matrices', 'writing', 'search', 'export'];
    for (const mode of modes) {
      for (const width of [1440, 1024, 768, 390]) {
        captures.push(
          await captureKnowledgeState({
            browser,
            outputRoot,
            profileRoot,
            webBase,
            width,
            mode,
          }),
        );
      }
    }
    if (options.phase === 'c1' || options.phase === 'all') {
      captures.push(
        await captureKnowledgeState({
          browser,
          outputRoot,
          profileRoot,
          webBase,
          width: 390,
          empty: true,
        }),
      );
    }
    if (canonicalSourcePath) {
      for (const width of [1440, 1024, 768, 390]) {
        captures.push(
          await captureCanonicalRestorePreview({
            browser,
            outputRoot,
            profileRoot,
            webBase,
            width,
            sourcePath: canonicalSourcePath,
          }),
        );
      }
    }

    const result = {
      status: 'passed',
      phase: options.phase,
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      browser,
      browserVersion,
      generatedAt: new Date().toISOString(),
      browserCreatedEvidence: 3,
      sourceRoundtrip: roundtrip.sourceHref,
      captures: captures.map((capture) => ({
        ...capture,
        screenshotPath: path.relative(repoRoot, capture.screenshotPath),
      })),
    };
    await writeFile(path.join(outputRoot, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await Promise.all([stopProcess(webProcess), stopProcess(serverProcess)]);
    if (options.keepData) console.log(`visual QA data kept at ${tempRoot}`);
    else await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({ code: 'RESEARCH_KNOWLEDGE_VISUAL_QA_FAILED', message: error.message }),
  );
  process.exitCode = 1;
});
