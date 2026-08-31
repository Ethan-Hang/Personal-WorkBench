import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, release, totalmem } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

function parseArgs(argv) {
  const options = {
    phase: 'b1',
    browser: false,
    ocr: false,
    pdfPaths: [],
    scannedPdf: null,
    output: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--phase') options.phase = argv[++index];
    else if (value === '--browser') options.browser = true;
    else if (value === '--ocr') options.ocr = true;
    else if (value === '--pdf') options.pdfPaths.push(argv[++index]);
    else if (value === '--scanned-pdf') options.scannedPdf = argv[++index];
    else if (value === '--output') options.output = argv[++index];
    else if (value === '--help') {
      console.log(`Research reader compatibility runner

Usage:
  node scripts/research-reader-compat.mjs --phase b1 --browser [--pdf PATH]
  node scripts/research-reader-compat.mjs --phase b2 --browser
  node scripts/research-reader-compat.mjs --phase all --browser --ocr --pdf PATH --scanned-pdf PATH

The runner records compatibility by module and current platform. It never marks an untested
platform as passed.`);
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${value}`);
    }
  }
  if (!['b1', 'b2', 'b3', 'all'].includes(options.phase)) {
    throw new Error('--phase must be b1, b2, b3, or all');
  }
  for (const [label, filePath] of [
    ...options.pdfPaths.map((filePath) => ['--pdf', filePath]),
    ...(options.scannedPdf ? [['--scanned-pdf', options.scannedPdf]] : []),
  ]) {
    if (!filePath || !existsSync(path.resolve(filePath))) {
      throw new Error(`${label} does not exist: ${filePath ?? ''}`);
    }
  }
  return options;
}

function filesystemName() {
  try {
    if (process.platform === 'darwin') {
      const dfOutput = execFileSync('df', ['-P', repoRoot], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const device = dfOutput.trim().split(/\r?\n/).at(-1)?.trim().split(/\s+/, 1)[0];
      if (!device) return 'unknown';
      const output = execFileSync('diskutil', ['info', device], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return output.match(/File System Personality:\s*(.+)/)?.[1]?.trim() ?? 'unknown';
    }
    if (process.platform === 'win32') {
      const root = path.parse(repoRoot).root;
      const output = execFileSync('fsutil', ['fsinfo', 'volumeinfo', root], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return output.match(/File System Name\s*:\s*(.+)/i)?.[1]?.trim() ?? 'unknown';
    }
    return execFileSync('stat', ['-f', '-c', '%T', repoRoot], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

async function run(command, args) {
  const startedAt = Date.now();
  console.log(`\n> ${[command, ...args].map((value) => JSON.stringify(value)).join(' ')}`);
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });
  }
  const outcome = await new Promise((resolve) => {
    child.once('error', (error) => resolve({ error }));
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  if (outcome.error) throw outcome.error;
  if (outcome.code !== 0) {
    throw new Error(`command failed with exit ${outcome.code}, signal ${outcome.signal ?? 'none'}`);
  }
  return { durationMs: Date.now() - startedAt, output };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!['b1', 'b2'].includes(options.phase)) {
    throw new Error(
      `${options.phase} compatibility modules are enabled when that phase is implemented`,
    );
  }
  const stamp = new Date().toISOString().replaceAll(/[^0-9A-Za-z]+/g, '-');
  const outputRoot = path.resolve(
    options.output ?? path.join(repoRoot, 'test-results', 'research-reader', `compat-${stamp}`),
  );
  await mkdir(outputRoot, { recursive: true });
  let moduleRun;
  let b0Output = null;
  let b0Result = null;
  if (options.phase === 'b1') {
    b0Output = path.join(outputRoot, 'b0.json');
    const b0Args = [
      '--expose-gc',
      path.join(scriptDir, 'research-reader-b0.mjs'),
      '--output',
      b0Output,
    ];
    if (options.browser) b0Args.push('--browser');
    if (options.ocr) b0Args.push('--ocr');
    for (const filePath of options.pdfPaths) b0Args.push('--pdf', path.resolve(filePath));
    if (options.scannedPdf) b0Args.push('--pdf', path.resolve(options.scannedPdf));
    moduleRun = await run(process.execPath, b0Args);
    b0Result = JSON.parse(await readFile(b0Output, 'utf8'));
  } else {
    moduleRun = await run(process.execPath, [
      path.join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs'),
      'run',
      'modules/research/src/acceptance/slice-b-workflow.test.ts',
      'modules/research/src/reader/text-index-service.test.ts',
    ]);
  }

  let visualOutput = null;
  let visualRun = null;
  let visualResult = null;
  if (options.browser) {
    visualOutput = path.join(outputRoot, 'visual');
    visualRun = await run(process.execPath, [
      path.join(scriptDir, 'research-reader-visual-qa.mjs'),
      '--phase',
      options.phase,
      '--output',
      visualOutput,
    ]);
    visualResult = JSON.parse(await readFile(path.join(visualOutput, 'result.json'), 'utf8'));
  }

  const currentPlatform = `${process.platform}-${process.arch}`;
  const pendingRequiredPlatforms = ['darwin-arm64', 'win32-x64'].filter(
    (platform) => platform !== currentPlatform,
  );
  const result = {
    status: 'passed',
    phase: options.phase,
    generatedAt: new Date().toISOString(),
    environment: {
      platform: process.platform,
      arch: process.arch,
      release: release(),
      filesystem: filesystemName(),
      node: process.version,
      cpu: cpus()[0]?.model ?? 'unknown',
      cpuCount: cpus().length,
      totalMemoryGiB: Number((totalmem() / 1024 / 1024 / 1024).toFixed(2)),
      browser: b0Result?.browser?.browserVersion ?? visualResult?.browser ?? 'not-run',
    },
    corpus:
      options.phase === 'b1'
        ? ['generated text', '180-page non-linearized', 'blank', 'encrypted', 'corrupt']
        : [
            'generated text',
            '180-page non-linearized',
            'annotations',
            'empty state',
            'page text index',
          ],
    conditions: {
      visualProfiles: options.browser ? 'fresh profile per viewport and state' : 'not-run',
      lifecycle:
        options.phase === 'b1' && options.browser ? '20 rounds in one browser process' : 'not-run',
    },
    cleanup:
      options.phase === 'b1' && options.browser
        ? {
            canvases: b0Result.browser?.canvasesAfterDestroy,
            textLayers: b0Result.browser?.textLayersAfterDestroy,
            loadingTasks: b0Result.browser?.loadingTasksAfterDestroy,
            activeStreams: b0Result.browser?.rangeFinal?.activeStreams,
            lifecycleHeapGrowthMiB: b0Result.browser?.lifecycleHeapGrowthMiB,
          }
        : null,
    modules: [
      {
        id:
          options.phase === 'b1'
            ? 'b1-pdfjs-range-resource-lifecycle'
            : 'b2-context-annotation-and-text-index',
        platform: currentPlatform,
        status: 'passed',
        durationMs: moduleRun.durationMs,
        evidence:
          options.phase === 'b1'
            ? path.relative(repoRoot, b0Output)
            : 'modules/research/src/acceptance/slice-b-workflow.test.ts',
      },
      {
        id: options.phase === 'b1' ? 'b1-reader-ui-and-states' : 'b2-reader-ui-and-search',
        platform: currentPlatform,
        status: options.browser ? 'passed' : 'not-run',
        durationMs: visualRun?.durationMs ?? null,
        evidence: visualOutput ? path.relative(repoRoot, visualOutput) : null,
      },
      ...pendingRequiredPlatforms.flatMap((platform) => [
        {
          id:
            options.phase === 'b1'
              ? 'b1-pdfjs-range-resource-lifecycle'
              : 'b2-context-annotation-and-text-index',
          platform,
          status: 'not-run',
          evidence: null,
        },
        {
          id: options.phase === 'b1' ? 'b1-reader-ui-and-states' : 'b2-reader-ui-and-search',
          platform,
          status: 'not-run',
          evidence: null,
        },
      ]),
    ],
  };
  const resultPath = path.join(outputRoot, 'result.json');
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ code: 'RESEARCH_READER_COMPAT_FAILED', message: error.message }));
  process.exitCode = 1;
});
