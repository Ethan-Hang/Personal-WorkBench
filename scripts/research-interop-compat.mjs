#!/usr/bin/env node

import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, release, totalmem } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const phases = ['parser', 'atomic-output', 'csl', 'all'];

function parseArgs(argv) {
  const options = { phase: 'all', browser: false, targetScale: false, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--phase') options.phase = argv[++index];
    else if (value === '--browser') options.browser = true;
    else if (value === '--target-scale') options.targetScale = true;
    else if (value === '--output') options.output = argv[++index];
    else if (value === '--help' || value === '-h') {
      console.log(`Research interoperability compatibility runner

Usage:
  node scripts/research-interop-compat.mjs --phase parser|atomic-output|csl|all
       [--target-scale] [--browser] [--output /path/to/results]

Results are recorded per module and platform. An untested platform is always not-run.`);
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${value}`);
    }
  }
  if (!phases.includes(options.phase)) {
    throw new Error('--phase supports parser, atomic-output, csl, or all');
  }
  return options;
}

function filesystemName() {
  try {
    if (process.platform === 'darwin') {
      const output = execFileSync('diskutil', ['info', repoRoot], {
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

async function run(command, args, env = process.env) {
  const startedAt = Date.now();
  console.log(`\n> ${[command, ...args].map((value) => JSON.stringify(value)).join(' ')}`);
  const child = spawn(command, args, {
    cwd: repoRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let tail = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      const value = chunk.toString();
      process.stdout.write(value);
      tail = `${tail}${value}`.slice(-20_000);
    });
  }
  const outcome = await new Promise((resolve) => {
    child.once('error', (error) => resolve({ error }));
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  return {
    status: outcome.error || outcome.code !== 0 ? 'failed' : 'passed',
    durationMs: Date.now() - startedAt,
    exitCode: outcome.code ?? null,
    signal: outcome.signal ?? null,
    error: outcome.error?.message ?? null,
    tail,
  };
}

function selectedModules(phase) {
  const modules = {
    parser: {
      id: 'parser-encoding',
      files: [
        'modules/research/src/contract.test.ts',
        'modules/research/src/interop/records',
        'modules/research/src/interop/adapter',
        'modules/research/src/storage/interop-migrations.test.ts',
        'modules/research/src/storage/interop-scale.test.ts',
      ],
    },
    'atomic-output': {
      id: 'atomic-output',
      files: [
        'modules/research/src/interop/safe-text-output.test.ts',
        'modules/research/src/interop/export',
        'modules/research/src/server/file-picker.test.ts',
        'modules/research/src/server/interop-routes.test.ts',
      ],
    },
    csl: {
      id: 'csl-snapshots',
      files: ['modules/research/src/interop/citation'],
    },
  };
  return phase === 'all' ? Object.values(modules) : [modules[phase]];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const stamp = new Date().toISOString().replaceAll(/[^0-9A-Za-z]+/g, '-');
  const outputRoot = path.resolve(
    options.output ??
      path.join(repoRoot, 'test-results', 'research-interop', `${options.phase}-${stamp}`),
  );
  await mkdir(outputRoot, { recursive: true });
  const currentPlatform = `${process.platform}-${process.arch}`;
  const platformMatrix = [...new Set([currentPlatform, 'darwin-arm64', 'win32-x64'])];
  const modules = [];
  const vitest = path.join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs');
  const metricsPath = path.join(outputRoot, 'scale-metrics.json');

  for (const module of selectedModules(options.phase)) {
    const includeScale = module.id === 'parser-encoding' && options.targetScale;
    const outcome = await run(process.execPath, ['--expose-gc', vitest, 'run', ...module.files], {
      ...process.env,
      ...(includeScale
        ? {
            RUN_RESEARCH_INTEROP_SCALE: '1',
            RESEARCH_INTEROP_SCALE_METRICS: metricsPath,
          }
        : {}),
    });
    modules.push({
      id: module.id,
      platform: currentPlatform,
      status: outcome.status,
      durationMs: outcome.durationMs,
      exitCode: outcome.exitCode,
      evidence: module.files,
      failureTail: outcome.status === 'failed' ? outcome.tail : null,
    });
  }

  if (options.phase === 'all') {
    const outcome = await run(process.execPath, [
      '--expose-gc',
      vitest,
      'run',
      'modules/research/src/acceptance/slice-d-workflow.test.ts',
      'modules/research/src/interop/canonical.test.ts',
      'modules/research/src/interop/canonical-restore.test.ts',
      'modules/research/src/interop/portable-export.test.ts',
      'modules/research/src/server/export-routes.test.ts',
      'modules/research/src/ui/api.test.ts',
    ]);
    modules.push({
      id: 'adapter-canonical-acceptance',
      platform: currentPlatform,
      status: outcome.status,
      durationMs: outcome.durationMs,
      exitCode: outcome.exitCode,
      evidence: [
        'modules/research/src/acceptance/slice-d-workflow.test.ts',
        'modules/research/src/interop/canonical.test.ts',
        'modules/research/src/interop/canonical-restore.test.ts',
      ],
      failureTail: outcome.status === 'failed' ? outcome.tail : null,
    });
  }

  let visualResult = null;
  if (options.browser) {
    const visualRoot = path.join(outputRoot, 'visual');
    const outcome = await run(process.execPath, [
      path.join(scriptDir, 'research-interop-visual-qa.mjs'),
      '--output',
      visualRoot,
    ]);
    try {
      visualResult = JSON.parse(await readFile(path.join(visualRoot, 'result.json'), 'utf8'));
    } catch {
      visualResult = null;
    }
    modules.push({
      id: 'interop-ui',
      platform: currentPlatform,
      status: outcome.status,
      durationMs: outcome.durationMs,
      exitCode: outcome.exitCode,
      evidence: [path.relative(repoRoot, visualRoot)],
      failureTail: outcome.status === 'failed' ? outcome.tail : null,
    });
  }

  for (const platform of platformMatrix.filter((value) => value !== currentPlatform)) {
    for (const module of modules.filter((value) => value.platform === currentPlatform)) {
      modules.push({
        id: module.id,
        platform,
        status: 'not-run',
        durationMs: null,
        exitCode: null,
        evidence: null,
        failureTail: null,
      });
    }
  }

  let scaleMetrics = null;
  try {
    scaleMetrics = JSON.parse(await readFile(metricsPath, 'utf8'));
  } catch {
    scaleMetrics = null;
  }
  const status = modules.some(
    (module) => module.platform === currentPlatform && module.status === 'failed',
  )
    ? 'failed'
    : 'passed';
  const result = {
    status,
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
      browser: visualResult?.browserVersion ?? 'not-run',
    },
    conditions: {
      targetScale: options.targetScale,
      scale: options.targetScale ? '10,000 records and 50 MiB per format' : 'not-run',
      browser: options.browser ? 'fresh profile per viewport' : 'not-run',
      viewports: options.browser ? [1440, 1024, 768, 390] : [],
    },
    scaleMetrics,
    modules,
  };
  await writeFile(path.join(outputRoot, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  if (status === 'failed') process.exitCode = 1;
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      code: 'RESEARCH_INTEROP_COMPAT_FAILED',
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
