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
  node scripts/research-knowledge-visual-qa.mjs --phase c1 [--output PATH] [--keep-data]

Environment:
  RESEARCH_KNOWLEDGE_BROWSER  Edge/Chrome executable override`);
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${value}`);
    }
  }
  if (options.phase !== 'c1') throw new Error('--phase currently supports c1');
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
      const response = await globalThis.fetch(url);
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
  const response = await globalThis.fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${url}: ${body.error ?? response.status}`);
  }
  return body;
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
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  return {
    close: () => socket.close(),
    events,
    send(method, params = {}) {
      sequence += 1;
      const id = sequence;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
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
      .fetch(`http://127.0.0.1:${port}/json/list`)
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
}) {
  const id = empty ? 'empty' : 'source-states';
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
      `document.body.innerText.includes('研究知识') && document.body.innerText.includes('证据流')`,
      `${id} knowledge page did not render at ${width}px`,
      30_000,
    );
    if (empty) {
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
    if (width === 390 && responsive.tabs !== 3) {
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
        ['unavailable', 'Knowledge Visual Unavailable'],
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

    const captures = [];
    for (const width of [1440, 1024, 768, 390]) {
      captures.push(
        await captureKnowledgeState({
          browser,
          outputRoot,
          profileRoot,
          webBase,
          width,
        }),
      );
    }
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
