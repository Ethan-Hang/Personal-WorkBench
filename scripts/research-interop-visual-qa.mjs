#!/usr/bin/env node

import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const widths = [1440, 1024, 768, 390];

function parseArgs(argv) {
  const options = { output: null, keepData: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--output') options.output = argv[++index];
    else if (value === '--keep-data') options.keepData = true;
    else if (value === '--help' || value === '-h') {
      console.log(`Research interoperability visual QA

Usage:
  node scripts/research-interop-visual-qa.mjs [--output PATH] [--keep-data]

Environment:
  RESEARCH_INTEROP_BROWSER  Edge/Chrome executable override`);
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${value}`);
    }
  }
  return options;
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

function startProcess(command, args, options = {}) {
  const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      output = `${output}${chunk.toString()}`.slice(-50_000);
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
    signal: globalThis.AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${url}: ${body.error ?? response.status}`);
  }
  return body;
}

function findBrowserExecutable() {
  if (process.env.RESEARCH_INTEROP_BROWSER) return process.env.RESEARCH_INTEROP_BROWSER;
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

async function waitForDevtoolsTargets(port, processInfo) {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    if (processInfo.child.exitCode !== null) {
      throw new Error(
        `browser exited before DevTools targets were ready:\n${processInfo.output()}`,
      );
    }
    try {
      const targets = await globalThis
        .fetch(`http://127.0.0.1:${port}/json/list`, {
          signal: globalThis.AbortSignal.timeout(3_000),
        })
        .then((response) => response.json());
      if (Array.isArray(targets)) return targets;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `browser DevTools targets timed out: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
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
  return {
    events,
    close: () => socket.close(),
    send(method, params = {}) {
      const id = ++sequence;
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

async function evaluateAwaitedValue(cdp, expression) {
  const evaluated = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (evaluated.exceptionDetails) {
    throw new Error(
      evaluated.exceptionDetails.exception?.description ?? 'browser promise evaluation failed',
    );
  }
  return evaluated.result?.value;
}

async function waitForExpression(cdp, expression, message, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await evaluateValue(cdp, expression)) === true) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const pageText = await evaluateValue(
    cdp,
    `document.body?.innerText?.replace(/\\s+/g, ' ').slice(0, 1500) ?? ''`,
  ).catch(() => '');
  throw new Error(`${message}; page text: ${pageText}`);
}

function clickButtonExpression(label, contains = false) {
  return `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((node) =>
      !node.disabled && ${contains ? `node.textContent?.includes(${JSON.stringify(label)})` : `node.textContent?.trim() === ${JSON.stringify(label)}`}
    );
    if (!button) return false;
    button.click();
    return true;
  })()`;
}

async function clickButton(cdp, label, contains = false) {
  if (!(await evaluateValue(cdp, clickButtonExpression(label, contains)))) {
    throw new Error(`button is unavailable: ${label}`);
  }
}

async function setNativeValue(cdp, selectorExpression, value) {
  const changed = await evaluateValue(
    cdp,
    `(() => {
      const control = ${selectorExpression};
      if (!control) return false;
      const prototype = control instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : control instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
      setter.call(control, ${JSON.stringify(value)});
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`,
  );
  if (!changed) throw new Error(`control is unavailable for value: ${value}`);
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
    const targets = await waitForDevtoolsTargets(port, browserProcess);
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
    await cdp.send('Browser.grantPermissions', {
      origin: new globalThis.URL(url).origin,
      permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
    });
    await cdp.send('Page.navigate', { url });
    return { browserProcess, cdp, width, height };
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

async function screenshot(session, outputPath, id) {
  const captured = await session.cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const bytes = Buffer.from(captured.data, 'base64');
  await writeFile(outputPath, bytes);
  if (bytes.length < 24 || bytes.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error(`browser did not create a PNG: ${id}`);
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== session.width || height !== session.height) {
    throw new Error(
      `screenshot ${id} is ${width}x${height}, expected ${session.width}x${session.height}`,
    );
  }
  return {
    id,
    width,
    height,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function noPageOverflow(cdp, state) {
  const overflow = await evaluateValue(
    cdp,
    `document.documentElement.scrollWidth > document.documentElement.clientWidth`,
  );
  if (overflow) throw new Error(`${state} has horizontal page overflow`);
}

async function captureWidth({ browser, captureRoot, profileRoot, webBase, width, documentTitle }) {
  const session = await openBrowserSession({
    browser,
    profilePath: path.join(profileRoot, `viewport-${width}`),
    url: `${webBase}/research`,
    width,
    height: 900,
  });
  const { cdp } = session;
  const captures = [];
  const capture = async (state) => {
    await noPageOverflow(cdp, `${state} at ${width}px`);
    captures.push(
      await screenshot(
        session,
        path.join(captureRoot, `${width}-${state}.png`),
        `${width}-${state}`,
      ),
    );
  };
  try {
    await waitForExpression(
      cdp,
      `document.body.innerText.includes('文献库') && document.body.innerText.includes('Visual Interoperability Study')`,
      `library did not load at ${width}px`,
      30_000,
    );

    await clickButton(cdp, '导入文献数据');
    await waitForExpression(
      cdp,
      `document.querySelector('[role="dialog"]')?.textContent?.includes('选择交换格式') === true`,
      'interop import dialog did not open',
    );
    await clickButton(cdp, '选择 BibTeX 文件');
    await waitForExpression(
      cdp,
      `document.querySelector('[role="dialog"]')?.textContent?.includes('重复候选') === true &&
       document.querySelector('[role="dialog"]')?.textContent?.includes('总计 2') === true`,
      'interop review did not show conflict and record summary',
      30_000,
    );
    await capture('import-conflict');
    await clickButton(cdp, 'broken', true);
    await waitForExpression(
      cdp,
      `document.querySelector('[role="dialog"]')?.textContent?.includes('查看来源原文') === true &&
       document.querySelector('[role="dialog"]')?.textContent?.includes('Token mismatch') === true`,
      'invalid import record did not expose its diagnostic',
    );
    await evaluateValue(
      cdp,
      `(() => { const details = document.querySelector('[role="dialog"] details'); if (!details) return false; details.open = true; return true; })()`,
    );
    await capture('import-error');
    await evaluateValue(
      cdp,
      `(() => { const close = document.querySelector('[role="dialog"] [aria-label="关闭"]'); if (!close) return false; close.click(); return true; })()`,
    );
    await waitForExpression(
      cdp,
      `document.querySelector('[role="dialog"]') === null`,
      'import dialog did not close',
    );

    await clickButton(cdp, 'Visual Interoperability Study', true);
    await clickButton(cdp, '导出记录');
    await waitForExpression(
      cdp,
      `document.querySelector('[role="dialog"]')?.textContent?.includes('导出文献记录') === true`,
      'interop export dialog did not open',
    );
    await clickButton(cdp, '生成预览');
    await waitForExpression(
      cdp,
      `document.querySelector('[role="dialog"] input[aria-label^="Citation key"]') !== null`,
      'interop export preview did not expose a citation key',
    );
    await setNativeValue(
      cdp,
      `document.querySelector('[role="dialog"] input[aria-label^="Citation key"]')`,
      `Visual${width}`,
    );
    await clickButton(cdp, '保存偏好');
    await waitForExpression(
      cdp,
      `document.querySelector('[role="dialog"]')?.textContent?.includes('已保存') === true`,
      'citation key preference did not save',
    );
    await capture('export-key');
    await evaluateValue(
      cdp,
      `document.querySelector('[role="dialog"] [aria-label="关闭"]')?.click()`,
    );
    await waitForExpression(
      cdp,
      `document.querySelector('[role="dialog"]') === null`,
      'export dialog did not close',
    );

    await clickButton(cdp, '引用');
    await waitForExpression(
      cdp,
      `document.querySelector('[role="dialog"]')?.textContent?.includes('复制引用') === true`,
      'citation dialog did not open',
    );
    await clickButton(cdp, '生成');
    await waitForExpression(
      cdp,
      `document.querySelector('[role="dialog"] pre')?.textContent?.includes('2026') === true`,
      'citation preview did not render',
    );
    await cdp.send('Page.bringToFront');
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    const clipboardProbe = await evaluateAwaitedValue(
      cdp,
      `(async () => {
        try {
          await navigator.clipboard.writeText('research-interop-visual-qa');
          return { ok: true };
        } catch (error) {
          return { ok: false, message: error instanceof Error ? error.message : String(error) };
        }
      })()`,
    );
    if (!clipboardProbe?.ok) {
      throw new Error(`clipboard permission probe failed: ${clipboardProbe?.message ?? 'unknown'}`);
    }
    await clickButton(cdp, '复制');
    await waitForExpression(
      cdp,
      `document.querySelector('[role="dialog"]')?.textContent?.includes('已复制到剪贴板') === true`,
      'clipboard copy did not report success',
    );
    await capture('citation-copy');
    await evaluateValue(
      cdp,
      `document.querySelector('[role="dialog"] [aria-label="关闭"]')?.click()`,
    );
    await waitForExpression(
      cdp,
      `document.querySelector('[role="dialog"]') === null`,
      'citation dialog did not close',
    );

    await cdp.send('Page.navigate', { url: `${webBase}/research/knowledge` });
    await waitForExpression(
      cdp,
      `document.body.innerText.includes('研究知识') &&
       Array.from(document.querySelectorAll('button')).some((node) => node.textContent?.trim() === '写作')`,
      'research knowledge page did not load',
      30_000,
    );
    await clickButton(cdp, '写作');
    await waitForExpression(
      cdp,
      `document.body.innerText.includes(${JSON.stringify(documentTitle)})`,
      'writing QA document did not load',
    );
    await clickButton(cdp, documentTitle, true);
    await waitForExpression(
      cdp,
      `Array.from(document.querySelectorAll('main input')).some((input) => input.value === 'Visual section')`,
      'writing QA section did not load',
    );
    await setNativeValue(
      cdp,
      `Array.from(document.querySelectorAll('select')).find((select) =>
        Array.from(select.options).some((option) => option.value === 'citation'))`,
      'citation',
    );
    await waitForExpression(
      cdp,
      `document.body.innerText.includes('Visual Interoperability Study') &&
       document.querySelector('input[placeholder="页码或位置（可选）"]') !== null`,
      'writing citation picker did not load',
    );
    await setNativeValue(
      cdp,
      `document.querySelector('input[placeholder="页码或位置（可选）"]')`,
      `p-${width}`,
    );
    await clickButton(cdp, '加入 1');
    await waitForExpression(
      cdp,
      `Array.from(document.querySelectorAll('article')).some((article) =>
        article.textContent?.includes('Visual Interoperability Study') &&
        article.textContent?.includes('p-${width}'))`,
      'writing citation block was not inserted',
    );
    await clickButton(cdp, '草稿参考文献');
    await waitForExpression(
      cdp,
      `document.querySelector('[role="dialog"]')?.textContent?.includes('草稿参考文献表') === true`,
      'draft bibliography dialog did not open',
    );
    await clickButton(cdp, '生成');
    await waitForExpression(
      cdp,
      `document.querySelector('[role="dialog"] pre')?.textContent?.includes('Visual Interoperability Study') === true`,
      'draft bibliography did not render',
    );
    await capture('writing-citation');

    const browserErrors = cdp.events.filter(
      (event) =>
        event.method === 'Runtime.exceptionThrown' ||
        (event.params?.entry?.level === 'error' &&
          String(event.params.entry.url ?? '').includes('/api/research/')),
    );
    if (browserErrors.length > 0) {
      throw new Error(`browser emitted errors at ${width}px: ${JSON.stringify(browserErrors)}`);
    }
    return captures;
  } finally {
    await closeBrowserSession(session);
  }
}

async function seed(apiBase) {
  const work = await requestJson(`${apiBase}/api/research/v1/works/manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Visual Interoperability Study',
      type: 'article',
      year: 2026,
      authors: ['Jane Smith'],
      editionKind: 'journal',
      publicationTitle: 'Visual QA Journal',
      publisher: null,
      identifiers: [{ scheme: 'doi', value: '10.1000/visual-interop' }],
      collectionIds: [],
    }),
  });
  const documents = {};
  for (const width of widths) {
    const title = `Visual writing ${width}`;
    const document = await requestJson(`${apiBase}/api/research/v1/writing-documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    await requestJson(`${apiBase}/api/research/v1/writing-documents/${document.id}/structure`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedStructureRevision: document.structureRevision,
        sections: [{ title: 'Visual section', position: 0, blocks: [] }],
      }),
    });
    documents[width] = title;
  }
  return { work, documents };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const browser = findBrowserExecutable();
  if (!browser) throw new Error('no Edge/Chrome executable found; set RESEARCH_INTEROP_BROWSER');
  const browserVersion = execFileSync(browser, ['--version'], { encoding: 'utf8' }).trim();
  const stamp = new Date().toISOString().replaceAll(/[^0-9A-Za-z]+/g, '-');
  const outputRoot = path.resolve(
    options.output ?? path.join(repoRoot, 'test-results', 'research-interop', `visual-${stamp}`),
  );
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'research-interop-visual-qa-'));
  const profileRoot = path.join(tempRoot, 'profiles');
  const captureRoot = path.join(tempRoot, 'captures');
  const dataRoot = path.join(tempRoot, 'data');
  const outputFiles = path.join(tempRoot, 'outputs');
  const databasePath = path.join(tempRoot, 'visual-qa.db');
  const bibtexPath = path.join(tempRoot, 'visual.bib');
  const risPath = path.join(tempRoot, 'visual.ris');
  const cslPath = path.join(tempRoot, 'visual.json');
  await Promise.all([
    mkdir(outputRoot, { recursive: true }),
    mkdir(captureRoot, { recursive: true }),
    writeFile(
      bibtexPath,
      `@article{visual-import,title={Conflicting Visual Import},author={Smith, Jane},year={2026},doi={10.1000/visual-interop},x-workbench={retain visual}}\n@article{broken,title={Broken}\n`,
      'utf8',
    ),
    writeFile(risPath, 'TY  - JOUR\r\nID  - visual\r\nTI  - Visual RIS\r\nER  - \r\n', 'utf8'),
    writeFile(
      cslPath,
      JSON.stringify([{ id: 'visual', type: 'article-journal', title: 'Visual CSL' }]),
      'utf8',
    ),
  ]);
  const serverPort = await reservePort();
  const webPort = await reservePort();
  const apiBase = `http://127.0.0.1:${serverPort}`;
  const webBase = `http://127.0.0.1:${webPort}`;
  let serverProcess;
  let webProcess;
  let succeeded = false;
  try {
    serverProcess = startProcess(
      process.execPath,
      [
        path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
        path.join(scriptDir, 'research-interop-visual-server.ts'),
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          PORT: String(serverPort),
          RESEARCH_INTEROP_QA_DB: databasePath,
          RESEARCH_INTEROP_QA_DATA: dataRoot,
          RESEARCH_INTEROP_QA_OUTPUT: outputFiles,
          RESEARCH_INTEROP_QA_SOURCE_BIBTEX: bibtexPath,
          RESEARCH_INTEROP_QA_SOURCE_RIS: risPath,
          RESEARCH_INTEROP_QA_SOURCE_CSL_JSON: cslPath,
        },
      },
    );
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
    const seeded = await seed(apiBase);
    const captures = [];
    for (const width of widths) {
      captures.push(
        ...(await captureWidth({
          browser,
          captureRoot,
          profileRoot,
          webBase,
          width,
          documentTitle: seeded.documents[width],
        })),
      );
    }
    const result = {
      status: 'passed',
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      browser,
      browserVersion,
      generatedAt: new Date().toISOString(),
      profiles: widths.map((width) => ({ width, height: 900, freshProfile: true })),
      flows: [
        'import conflict review',
        'invalid record and raw source',
        'export preview and citation key edit',
        'clipboard citation copy',
        'writing citation insertion and draft bibliography',
      ],
      captures,
      temporaryArtifactsCleaned: !options.keepData,
    };
    await writeFile(path.join(outputRoot, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
    succeeded = true;
  } finally {
    await Promise.all([stopProcess(webProcess), stopProcess(serverProcess)]);
    if (succeeded && !options.keepData) await rm(tempRoot, { recursive: true, force: true });
    else console.log(`visual QA temporary data kept at ${tempRoot}`);
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      code: 'RESEARCH_INTEROP_VISUAL_QA_FAILED',
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
