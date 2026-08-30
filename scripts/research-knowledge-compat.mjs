#!/usr/bin/env node

import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, release, totalmem } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

function parseArgs(argv) {
  const options = { phase: 'c1', browser: false, targetScale: false, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--phase') options.phase = argv[++index];
    else if (value === '--browser') options.browser = true;
    else if (value === '--target-scale') options.targetScale = true;
    else if (value === '--output') options.output = argv[++index];
    else if (value === '--help' || value === '-h') {
      console.log(`Research knowledge compatibility runner

Usage:
  node scripts/research-knowledge-compat.mjs --phase c1|c2|c3|all [--browser] [--target-scale]

The runner records results by module and current platform. It never marks an untested
platform as passed.`);
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

async function run(command, args, env = process.env) {
  const startedAt = Date.now();
  console.log(`\n> ${[command, ...args].map((value) => JSON.stringify(value)).join(' ')}`);
  const child = spawn(command, args, {
    cwd: repoRoot,
    env,
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
  const stamp = new Date().toISOString().replaceAll(/[^0-9A-Za-z]+/g, '-');
  const outputRoot = path.resolve(
    options.output ??
      path.join(repoRoot, 'test-results', 'research-knowledge', `${options.phase}-${stamp}`),
  );
  await mkdir(outputRoot, { recursive: true });

  const includeScale = options.phase === 'c3' || options.phase === 'all';
  const includeDelivery = options.phase === 'c3' || options.phase === 'all';
  const testFiles = [
    'modules/research/src/acceptance/slice-c-workflow.test.ts',
    'modules/research/src/storage/knowledge-migrations.test.ts',
    'modules/research/src/storage/knowledge-repository.test.ts',
    'modules/research/src/knowledge/service.test.ts',
    'modules/research/src/knowledge/source-state.test.ts',
    'modules/research/src/server/knowledge-routes.test.ts',
    'modules/research/src/ui/api.test.ts',
    ...(includeDelivery
      ? [
          'modules/research/src/interop/knowledge-export.test.ts',
          'modules/research/src/interop/canonical.test.ts',
          'modules/research/src/interop/canonical-restore.test.ts',
          'modules/research/src/interop/portable-export.test.ts',
          'modules/research/src/server/export-routes.test.ts',
          'modules/research/src/server/file-picker.test.ts',
        ]
      : []),
    ...(includeScale ? ['modules/research/src/storage/knowledge-scale.test.ts'] : []),
  ];
  const moduleRun = await run(
    process.execPath,
    [path.join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs'), 'run', ...testFiles],
    {
      ...process.env,
      ...(includeScale && options.targetScale ? { RUN_RESEARCH_KNOWLEDGE_SCALE: '1' } : {}),
    },
  );

  let visualRun = null;
  let visualResult = null;
  const visualOutput = path.join(outputRoot, 'visual');
  if (options.browser) {
    visualRun = await run(process.execPath, [
      path.join(scriptDir, 'research-knowledge-visual-qa.mjs'),
      '--phase',
      options.phase,
      '--output',
      visualOutput,
    ]);
    visualResult = JSON.parse(await readFile(path.join(visualOutput, 'result.json'), 'utf8'));
  }

  const currentPlatform = `${process.platform}-${process.arch}`;
  const otherPlatforms = ['darwin-arm64', 'win32-x64'].filter(
    (platform) => platform !== currentPlatform,
  );
  const phaseLabel =
    options.phase === 'c1'
      ? 'c1-source-evidence'
      : options.phase === 'c2'
        ? 'c2-claims-matrices'
        : options.phase === 'c3'
          ? 'c3-writing-search-delivery'
          : 'c1-c3-research-knowledge';
  const modules = [
    {
      id: `${phaseLabel}-domain-and-integrity`,
      platform: currentPlatform,
      status: 'passed',
      durationMs: moduleRun.durationMs,
      evidence: 'modules/research/src/acceptance/slice-c-workflow.test.ts',
    },
    {
      id: `${phaseLabel}-ui`,
      platform: currentPlatform,
      status: options.browser ? 'passed' : 'not-run',
      durationMs: visualRun?.durationMs ?? null,
      evidence: options.browser ? path.relative(repoRoot, visualOutput) : null,
    },
    ...(includeScale
      ? [
          {
            id: `${phaseLabel}-${options.targetScale ? 'target' : 'representative'}-scale`,
            platform: currentPlatform,
            status: 'passed',
            durationMs: moduleRun.durationMs,
            evidence: 'modules/research/src/storage/knowledge-scale.test.ts',
          },
        ]
      : []),
    ...otherPlatforms.flatMap((platform) => [
      {
        id: `${phaseLabel}-domain-and-integrity`,
        platform,
        status: 'not-run',
        durationMs: null,
        evidence: null,
      },
      {
        id: `${phaseLabel}-ui`,
        platform,
        status: 'not-run',
        durationMs: null,
        evidence: null,
      },
      ...(includeScale
        ? [
            {
              id: `${phaseLabel}-${options.targetScale ? 'target' : 'representative'}-scale`,
              platform,
              status: 'not-run',
              durationMs: null,
              evidence: null,
            },
          ]
        : []),
    ]),
  ];
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
      browser: visualResult?.browserVersion ?? 'not-run',
    },
    corpus: [
      'generated PDF text layer',
      'generated area anchor',
      'local OCR cache proxy',
      'source revision and deletion',
      'asset mismatch and unavailable source',
      ...(options.phase === 'c1'
        ? []
        : ['claims with and without evidence', 'cross-paper matrix and review baseline']),
      ...(options.phase === 'c3' || options.phase === 'all'
        ? [
            'writing sections',
            'text blocks',
            'four stable resource references',
            'unified knowledge search and stable links',
            'deterministic Markdown and CSV outputs',
            'canonical v1/v2 empty-library restore',
            'missing attachment preservation and rollback cleanup',
          ]
        : []),
    ],
    conditions: {
      visualProfiles: options.browser ? 'fresh profile per viewport and state' : 'not-run',
      viewports: options.browser ? [1440, 1024, 768, 390] : [],
      privatePdfRequired: false,
      scale: includeScale ? (options.targetScale ? 'target' : 'representative') : 'not-run',
    },
    modules,
  };
  await writeFile(path.join(outputRoot, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify({ code: 'RESEARCH_KNOWLEDGE_COMPAT_FAILED', message: error.message }),
  );
  process.exitCode = 1;
});
