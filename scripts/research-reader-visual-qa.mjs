import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function parseArgs(argv) {
  const options = { phase: 'b1', output: null, keepData: false, serve: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--phase') options.phase = argv[++index];
    else if (value === '--output') options.output = argv[++index];
    else if (value === '--keep-data') options.keepData = true;
    else if (value === '--serve') options.serve = true;
    else if (value === '--help') {
      console.log(`Research reader visual QA

Usage:
  node scripts/research-reader-visual-qa.mjs [--phase b1] [--output PATH] [--keep-data] [--serve]

Environment:
  RESEARCH_READER_BROWSER  Edge/Chrome executable override`);
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${value}`);
    }
  }
  if (!options.phase) throw new Error('--phase must not be empty');
  return options;
}

function pdfEscape(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

function makeTextPdf({ pageCount, paddingBytes = 0, textPrefix }) {
  const fontObjectNumber = 3 + pageCount * 2;
  const pageObjectNumbers = Array.from({ length: pageCount }, (_, index) => 3 + index * 2);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((value) => `${value} 0 R`).join(' ')}] /Count ${pageCount} >>`,
  ];
  for (let index = 0; index < pageCount; index += 1) {
    const pageNumber = index + 1;
    const contentObjectNumber = pageObjectNumbers[index] + 1;
    const padding = paddingBytes > 0 ? `\n%${'x'.repeat(Math.max(0, paddingBytes - 2))}` : '';
    const content =
      [
        'BT',
        '/F1 14 Tf',
        '72 720 Td',
        `(${pdfEscape(`${textPrefix} page ${pageNumber}`)}) Tj`,
        '0 -24 Td',
        `(searchable reader visual QA token page-${pageNumber}) Tj`,
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
      const { port } = address;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function startProcess(command, args, options) {
  const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      output += chunk.toString();
      if (output.length > 40_000) output = output.slice(-40_000);
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
  if (!response.ok)
    throw new Error(`${init?.method ?? 'GET'} ${url}: ${body.error ?? response.status}`);
  return body;
}

async function seedPdf(apiBase, bytes, fileName, title) {
  const requestId = `visual-${randomUUID()}`;
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
  const item = inspected?.item;
  if (!item?.id || !inspected.asset?.id) {
    throw new Error(`inspection did not produce an Asset for ${fileName}`);
  }
  const committed = await requestJson(
    `${apiBase}/api/research/v1/import-sessions/${session.id}/confirm`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemId: item.id,
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
  const attachment = detail.editions?.flatMap((edition) => edition.attachments ?? [])[0];
  const location = attachment?.asset?.locations?.find((candidate) => candidate.mode === 'managed');
  if (!attachment?.assetId || !location?.resolvedPath) {
    throw new Error(`committed work did not expose a managed Asset for ${fileName}`);
  }
  return {
    assetId: attachment.assetId,
    locationPath: location.resolvedPath,
    workId: committed.workId,
  };
}

function findBrowserExecutable() {
  if (process.env.RESEARCH_READER_BROWSER) return process.env.RESEARCH_READER_BROWSER;
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

async function inspectPng(filePath) {
  const bytes = await readFile(filePath);
  if (bytes.length < 24 || bytes.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error(`browser did not create a PNG: ${filePath}`);
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length };
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
  let sequence = 0;
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('DevTools WebSocket failed')), {
      once: true,
    });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id === undefined) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  return {
    close: () => socket.close(),
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

async function captureCase({
  browser,
  outputRoot,
  profileRoot,
  url,
  id,
  width,
  height,
  expected,
  verifySelection = false,
}) {
  const screenshotPath = path.join(outputRoot, `${id}-${width}.png`);
  const profilePath = path.join(profileRoot, `${id}-${width}`);
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
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send('Page.navigate', { url });
    const deadline = Date.now() + 30_000;
    let ready = false;
    while (Date.now() < deadline) {
      const expression =
        expected.kind === 'selector'
          ? `document.querySelector(${JSON.stringify(expected.value)}) !== null`
          : `document.body?.innerText.includes(${JSON.stringify(expected.value)}) === true`;
      const evaluated = await cdp.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
      });
      if (evaluated.result?.value === true) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) {
      const body = await cdp.send('Runtime.evaluate', {
        expression: 'document.body?.innerText ?? ""',
        returnByValue: true,
      });
      throw new Error(
        `${id} at ${width}px did not render ${expected.kind} ${expected.value}; body: ${String(
          body.result?.value ?? '',
        ).slice(-1_000)}`,
      );
    }
    let selectedText = null;
    let copiedText = null;
    if (verifySelection) {
      const selectionDeadline = Date.now() + 10_000;
      let rect = null;
      while (Date.now() < selectionDeadline && !rect) {
        const textTarget = await cdp.send('Runtime.evaluate', {
          expression: `(() => {
            const span = Array.from(document.querySelectorAll('.textLayer span')).find((element) => {
              const bounds = element.getBoundingClientRect();
              return bounds.width > 20 && bounds.height > 0 && bounds.right > 0 && bounds.bottom > 0 &&
                bounds.left < innerWidth && bounds.top < innerHeight;
            });
            if (!span) return null;
            const bounds = span.getBoundingClientRect();
            return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
          })()`,
          returnByValue: true,
        });
        rect = textTarget.result?.value ?? null;
        if (!rect) await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!rect) throw new Error(`${id} has no visible selectable PDF text span`);
      const startX = Math.max(0, rect.x) + 2;
      const endX = Math.min(width, rect.x + rect.width) - 2;
      const y = Math.min(height - 1, Math.max(0, rect.y + rect.height / 2));
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: startX,
        y,
        button: 'left',
        buttons: 1,
        clickCount: 1,
      });
      for (let step = 1; step <= 4; step += 1) {
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: startX + ((endX - startX) * step) / 4,
          y,
          button: 'left',
          buttons: 1,
        });
      }
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: endX,
        y,
        button: 'left',
        buttons: 0,
        clickCount: 1,
      });
      const selection = await cdp.send('Runtime.evaluate', {
        expression: 'window.getSelection()?.toString() ?? ""',
        returnByValue: true,
      });
      selectedText = String(selection.result?.value ?? '');
      if (!selectedText.trim()) throw new Error(`${id} PDF text layer could not be selected`);
      await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          globalThis.__researchReaderQaCopiedText = null;
          document.addEventListener('copy', (event) => {
            globalThis.__researchReaderQaCopiedText =
              event.clipboardData?.getData('text/plain') || window.getSelection()?.toString() || '';
          }, { once: true });
        })()`,
      });
      const copyModifiers = process.platform === 'darwin' ? 4 : 2;
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        modifiers: copyModifiers,
        key: 'c',
        code: 'KeyC',
        windowsVirtualKeyCode: 67,
        commands: ['Copy'],
      });
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        modifiers: copyModifiers,
        key: 'c',
        code: 'KeyC',
        windowsVirtualKeyCode: 67,
      });
      const copied = await cdp.send('Runtime.evaluate', {
        expression: 'globalThis.__researchReaderQaCopiedText ?? ""',
        returnByValue: true,
      });
      copiedText = String(copied.result?.value ?? '');
      if (copiedText !== selectedText) throw new Error(`${id} selected PDF text was not copied`);
    }
    const captured = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });
    await writeFile(screenshotPath, Buffer.from(captured.data, 'base64'));
    const png = await inspectPng(screenshotPath);
    if (png.width !== width || png.height !== height) {
      throw new Error(
        `${id} screenshot size ${png.width}x${png.height}, expected ${width}x${height}`,
      );
    }
    return { id, width, height, screenshotPath, selectedText, copiedText, ...png };
  } finally {
    cdp?.close();
    await stopProcess(browserProcess);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const browser = findBrowserExecutable();
  if (!browser) throw new Error('no Edge/Chrome executable found; set RESEARCH_READER_BROWSER');
  const stamp = new Date().toISOString().replaceAll(/[^0-9A-Za-z]+/g, '-');
  const outputRoot = path.resolve(
    options.output ??
      path.join(repoRoot, 'test-results', 'research-reader', `${options.phase}-${stamp}`),
  );
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'research-reader-visual-qa-'));
  const profileRoot = path.join(tempRoot, 'profiles');
  await mkdir(outputRoot, { recursive: true });
  const serverPort = await reservePort();
  const webPort = await reservePort();
  const apiBase = `http://127.0.0.1:${serverPort}`;
  const webBase = `http://127.0.0.1:${webPort}`;
  const databasePath = path.join(tempRoot, 'visual-qa.db');
  const dataDir = path.join(tempRoot, 'data');
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

    const normalBytes = makeTextPdf({
      pageCount: 180,
      textPrefix: 'Research Reader Visual QA',
    });
    const encryptedBytes = Buffer.from(
      (
        await readFile(
          path.join(scriptDir, 'fixtures', 'research-reader-encrypted.pdf.b64'),
          'utf8',
        )
      ).trim(),
      'base64',
    );
    const normal = await seedPdf(
      apiBase,
      normalBytes,
      'reader-visual-180-pages.pdf',
      'Reader Visual QA',
    );
    const corrupt = await seedPdf(
      apiBase,
      normalBytes.subarray(0, Math.floor(normalBytes.length * 0.55)),
      'reader-corrupt.pdf',
      'Reader Corrupt State',
    );
    const encrypted = await seedPdf(
      apiBase,
      encryptedBytes,
      'reader-encrypted.pdf',
      'Reader Encrypted State',
    );
    const captures = [];
    for (const width of [1440, 1024, 768, 390]) {
      captures.push(
        await captureCase({
          browser,
          outputRoot,
          profileRoot,
          url: `${webBase}/research/read/${encodeURIComponent(normal.assetId)}`,
          id: 'normal',
          width,
          height: 900,
          expected: { kind: 'selector', value: '[aria-label="第 1 页"]' },
          verifySelection: width === 1440,
        }),
      );
    }
    captures.push(
      await captureCase({
        browser,
        outputRoot,
        profileRoot,
        url: `${webBase}/research/read/${encodeURIComponent(encrypted.assetId)}`,
        id: 'encrypted',
        width: 1024,
        height: 900,
        expected: { kind: 'text', value: '输入文档密码' },
      }),
    );
    captures.push(
      await captureCase({
        browser,
        outputRoot,
        profileRoot,
        url: `${webBase}/research/read/${encodeURIComponent(corrupt.assetId)}`,
        id: 'corrupt',
        width: 1024,
        height: 900,
        expected: { kind: 'text', value: '无法打开 PDF' },
      }),
    );

    const missingPath = `${normal.locationPath}.visual-qa-missing`;
    await rename(normal.locationPath, missingPath);
    try {
      captures.push(
        await captureCase({
          browser,
          outputRoot,
          profileRoot,
          url: `${webBase}/research/read/${encodeURIComponent(normal.assetId)}`,
          id: 'missing',
          width: 1024,
          height: 900,
          expected: { kind: 'text', value: '无法进入阅读器' },
        }),
      );
    } finally {
      await rename(missingPath, normal.locationPath);
    }
    captures.push(
      await captureCase({
        browser,
        outputRoot,
        profileRoot,
        url: `${webBase}/research/read/${encodeURIComponent(normal.assetId)}`,
        id: 'restored',
        width: 1024,
        height: 900,
        expected: { kind: 'selector', value: '[aria-label="第 1 页"]' },
      }),
    );

    const result = {
      status: 'passed',
      phase: options.phase,
      platform: process.platform,
      arch: process.arch,
      browser,
      node: process.version,
      generatedAt: new Date().toISOString(),
      captures: captures.map((capture) => ({
        ...capture,
        screenshotPath: path.relative(repoRoot, capture.screenshotPath),
      })),
    };
    await writeFile(path.join(outputRoot, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
    if (options.serve) {
      console.log(
        JSON.stringify({
          status: 'serving',
          readerUrl: `${webBase}/research/read/${encodeURIComponent(normal.assetId)}`,
          encryptedReaderUrl: `${webBase}/research/read/${encodeURIComponent(encrypted.assetId)}`,
          password: 'research-b0',
        }),
      );
      await new Promise((resolve) => {
        process.once('SIGINT', resolve);
        process.once('SIGTERM', resolve);
      });
    }
  } finally {
    await Promise.all([stopProcess(webProcess), stopProcess(serverProcess)]);
    if (options.keepData) console.log(`visual QA data kept at ${tempRoot}`);
    else await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({ code: 'RESEARCH_READER_VISUAL_QA_FAILED', message: error.message }),
  );
  process.exitCode = 1;
});
