import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { platform, release, tmpdir } from 'node:os';
import { join, resolve, win32 } from 'node:path';

// Windows: node scripts/research-windows-file-semantics.mjs
// Other volume/share: node scripts/research-windows-file-semantics.mjs --root "D:\\validation"
// Managed-root target on another volume/share:
// node scripts/research-windows-file-semantics.mjs --managed-target "D:\\validation"
// Non-Windows syntax and portable-flow check: node scripts/research-windows-file-semantics.mjs --smoke

const EXPECTED_LOCK_ERRORS = new Set(['EACCES', 'EBUSY', 'EPERM']);
const EXPECTED_PUBLISH_COLLISION_ERRORS = new Set(['EACCES', 'EEXIST', 'EPERM']);
const argv = process.argv.slice(2);

let baseRoot = tmpdir();
let managedTargetBase = null;
let smokeMode = false;

for (let index = 0; index < argv.length; index += 1) {
  const argument = argv[index];

  if (argument === '--smoke') {
    smokeMode = true;
    continue;
  }

  if (argument === '--root') {
    const value = argv[index + 1];
    if (!value) {
      throw new Error('--root requires a directory path');
    }
    baseRoot = resolve(value);
    index += 1;
    continue;
  }

  if (argument === '--managed-target') {
    const value = argv[index + 1];
    if (!value) {
      throw new Error('--managed-target requires a directory path');
    }
    managedTargetBase = resolve(value);
    index += 1;
    continue;
  }

  throw new Error(`Unknown argument: ${argument}`);
}

const isWindows = platform() === 'win32';
const results = {
  environment: {
    platform: platform(),
    release: release(),
    node: process.version,
    architecture: process.arch,
    baseRoot,
    managedTargetBase,
    smokeMode,
  },
  assertions: [],
  warnings: [],
  observations: {},
};

function recordAssertion(name, passed, details) {
  results.assertions.push({ name, passed, details });
}

function recordWarning(name, details) {
  results.warnings.push({ name, details });
}

function serializeError(error) {
  if (!error) return null;

  return {
    name: error.name ?? 'Error',
    code: error.code ?? null,
    message: error.message ?? String(error),
  };
}

async function attempt(operation) {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    return { ok: false, error: serializeError(error) };
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function hashFile(filePath) {
  return sha256(await readFile(filePath));
}

function nodeMeetsMinimum() {
  const [major, minor, patch] = process.versions.node.split('.').map(Number);
  return major > 22 || (major === 22 && (minor > 22 || (minor === 22 && patch >= 1)));
}

async function waitForPath(filePath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const current = await attempt(() => stat(filePath));
    if (current.ok) return true;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }

  return false;
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolveExit) => child.once('exit', resolveExit)),
    new Promise((resolveWait) => setTimeout(resolveWait, 2_000)),
  ]);
}

async function testWindowsDenyDeleteLock(root) {
  if (!isWindows) return { skipped: 'requires Windows' };

  const target = join(root, 'deny-delete-lock.pdf');
  const renamedTarget = join(root, 'deny-delete-lock-renamed.pdf');
  const marker = join(root, 'deny-delete-lock.ready');
  await writeFile(target, 'locked-content');

  const command = [
    '$target = [Environment]::GetEnvironmentVariable("WB_RESEARCH_LOCK_TARGET")',
    '$marker = [Environment]::GetEnvironmentVariable("WB_RESEARCH_LOCK_MARKER")',
    '$stream = [System.IO.File]::Open($target, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)',
    'try {',
    '  [System.IO.File]::WriteAllText($marker, "ready")',
    '  Start-Sleep -Seconds 30',
    '} finally {',
    '  $stream.Dispose()',
    '}',
  ].join('\n');

  const child = spawn(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
    {
      env: {
        ...process.env,
        WB_RESEARCH_LOCK_TARGET: target,
        WB_RESEARCH_LOCK_MARKER: marker,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );

  let stderr = '';
  let spawnError = null;
  child.once('error', (error) => {
    spawnError = serializeError(error);
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  try {
    const ready = await waitForPath(marker, 5_000);
    if (!ready) {
      return {
        ready: false,
        exitCode: child.exitCode,
        spawnError,
        stderr: stderr.trim(),
      };
    }

    const move = await attempt(() => rename(target, renamedTarget));
    const deleteTarget = move.ok ? renamedTarget : target;
    const remove = await attempt(() => unlink(deleteTarget));

    return {
      ready: true,
      rename: move,
      unlink: remove,
      expectedLockObserved:
        !move.ok &&
        !remove.ok &&
        EXPECTED_LOCK_ERRORS.has(move.error.code) &&
        EXPECTED_LOCK_ERRORS.has(remove.error.code),
    };
  } finally {
    await stopChild(child);
  }
}

async function commitManagedObject(root, bytes) {
  const digest = sha256(bytes);
  const objectDirectory = join(root, 'managed', 'sha256', digest.slice(0, 2), digest.slice(2, 4));
  const finalPath = join(objectDirectory, digest);
  const stagingDirectory = join(root, 'managed', '.staging');
  const stagedPath = join(stagingDirectory, `${digest}.${randomUUID()}.part`);

  await mkdir(objectDirectory, { recursive: true });
  await mkdir(stagingDirectory, { recursive: true });
  await writeFile(stagedPath, bytes, { flag: 'wx' });

  const existing = await attempt(() => stat(finalPath));
  if (existing.ok) {
    if ((await hashFile(finalPath)) !== digest) {
      await rm(stagedPath, { force: true });
      throw new Error('Existing managed object does not match its SHA-256 path');
    }

    await rm(stagedPath, { force: true });
    return { digest, finalPath, outcome: 'reused' };
  }

  try {
    // 与实际 content store 一致：完整 staging 文件通过同盘 hard link 无覆盖发布。
    // POSIX rename 会静默替换已有目标，不能承担内容寻址对象的竞争提交。
    await link(stagedPath, finalPath);
    await unlink(stagedPath);
    return { digest, finalPath, outcome: 'stored' };
  } catch (error) {
    if (!EXPECTED_PUBLISH_COLLISION_ERRORS.has(error?.code)) throw error;

    const finalHash = await attempt(() => hashFile(finalPath));
    if (!finalHash.ok || finalHash.value !== digest) throw error;

    await rm(stagedPath, { force: true });
    return { digest, finalPath, outcome: 'reused-after-race' };
  }
}

await mkdir(baseRoot, { recursive: true });
const root = await mkdtemp(join(baseRoot, 'wb-research-windows-'));
let externalManagedTarget = null;
results.environment.testRoot = root;

try {
  recordAssertion(
    'runs on Windows',
    isWindows || smokeMode,
    isWindows
      ? 'win32 detected'
      : smokeMode
        ? 'non-Windows smoke mode'
        : 'use --smoke outside Windows',
  );
  recordAssertion('Node.js meets repository minimum', nodeMeetsMinimum(), 'requires >=22.22.1');

  const rootStat = await stat(root, { bigint: true });
  results.observations.root = {
    canonical: await realpath(root),
    device: rootStat.dev.toString(),
  };

  const unicodeDirectory = join(root, '含 空格 research');
  const nfcName = 'Caf\u00e9-论文.PDF';
  const nfdName = nfcName.normalize('NFD');
  const unicodePath = join(unicodeDirectory, nfcName);
  await mkdir(unicodeDirectory);
  await writeFile(unicodePath, 'unicode-content');

  const listedNames = await readdir(unicodeDirectory);
  const nfdAlias = await attempt(() => readFile(join(unicodeDirectory, nfdName)));
  const lowerCaseAlias = await attempt(() =>
    readFile(join(unicodeDirectory, nfcName.toLocaleLowerCase('en-US'))),
  );
  results.observations.unicodeAndCase = {
    requestedName: nfcName,
    requestedUtf8Hex: Buffer.from(nfcName).toString('hex'),
    listedNames,
    listedUtf8Hex: listedNames.map((name) => Buffer.from(name).toString('hex')),
    nfdAliasReadable: nfdAlias.ok,
    lowerCaseAliasReadable: lowerCaseAlias.ok,
  };
  recordAssertion(
    'Unicode filename is preserved and readable',
    listedNames.includes(nfcName) && (await readFile(unicodePath, 'utf8')) === 'unicode-content',
    results.observations.unicodeAndCase,
  );

  if (isWindows) {
    const reservedName = await attempt(() => writeFile(join(root, 'CON.pdf'), 'reserved'));
    const invalidCharacter = await attempt(() => writeFile(join(root, 'invalid?.pdf'), 'reserved'));
    results.observations.windowsReservedNames = { reservedName, invalidCharacter };
    recordAssertion(
      'Win32 reserved paths are rejected',
      !reservedName.ok && !invalidCharacter.ok,
      results.observations.windowsReservedNames,
    );
  } else {
    results.observations.windowsReservedNames = { skipped: 'requires Windows' };
  }

  const targetPath = join(root, 'target.pdf');
  const movedTargetPath = join(root, 'target-moved.pdf');
  const symlinkPath = join(root, 'linked-paper.pdf');
  await writeFile(targetPath, 'same-content');

  const createSymlink = await attempt(() => symlink(targetPath, symlinkPath, 'file'));
  if (createSymlink.ok) {
    const symlinkStat = await lstat(symlinkPath);
    const canonicalBeforeMove = await realpath(symlinkPath);
    await rename(targetPath, movedTargetPath);
    const readAfterMove = await attempt(() => readFile(symlinkPath));
    const canonicalAfterMove = await attempt(() => realpath(symlinkPath));
    results.observations.symlink = {
      created: true,
      isSymbolicLink: symlinkStat.isSymbolicLink(),
      canonicalBeforeMove,
      readAfterTargetMove: readAfterMove,
      realpathAfterTargetMove: canonicalAfterMove,
    };
    recordAssertion(
      'Moved symlink target becomes missing',
      !readAfterMove.ok && !canonicalAfterMove.ok,
      results.observations.symlink,
    );
  } else {
    await rename(targetPath, movedTargetPath);
    results.observations.symlink = { created: false, error: createSymlink.error };
    recordWarning(
      'Symbolic-link creation unavailable',
      'Record whether Windows Developer Mode or SeCreateSymbolicLinkPrivilege is enabled.',
    );
  }

  const hardLinkPath = join(root, 'hard-link.pdf');
  const createHardLink = await attempt(() => link(movedTargetPath, hardLinkPath));
  if (createHardLink.ok) {
    const sourceStat = await stat(movedTargetPath, { bigint: true });
    const hardLinkStat = await stat(hardLinkPath, { bigint: true });
    results.observations.hardLink = {
      sameDeviceAndFileId:
        sourceStat.dev === hardLinkStat.dev && sourceStat.ino === hardLinkStat.ino,
      sourceLinks: sourceStat.nlink.toString(),
      sameHash: (await hashFile(movedTargetPath)) === (await hashFile(hardLinkPath)),
    };
  } else {
    results.observations.hardLink = { created: false, error: createHardLink.error };
    recordWarning('Hard-link creation unavailable', createHardLink.error);
  }

  const readOnlyPath = join(root, 'read-only.pdf');
  await writeFile(readOnlyPath, 'read-only-content');
  const makeReadOnly = await attempt(() => chmod(readOnlyPath, 0o444));
  const readOnlyWrite = await attempt(() => writeFile(readOnlyPath, 'changed'));
  results.observations.readOnly = { chmod: makeReadOnly, overwrite: readOnlyWrite };
  await attempt(() => chmod(readOnlyPath, 0o644));

  const openPath = join(root, 'node-open-source.pdf');
  const renamedOpenPath = join(root, 'node-open-renamed.pdf');
  await writeFile(openPath, 'open-handle-content');
  const handle = await open(openPath, 'r');
  try {
    const moveWhileOpen = await attempt(() => rename(openPath, renamedOpenPath));
    const activePath = moveWhileOpen.ok ? renamedOpenPath : openPath;
    const removeWhileOpen = await attempt(() => unlink(activePath));
    const buffer = Buffer.alloc(Buffer.byteLength('open-handle-content'));
    const readAfterOperations = await attempt(() => handle.read(buffer, 0, buffer.length, 0));
    results.observations.nodeOpenHandle = {
      rename: moveWhileOpen,
      unlink: removeWhileOpen,
      readAfterOperations: readAfterOperations.ok ? buffer.toString('utf8') : readAfterOperations,
    };
  } finally {
    await handle.close();
  }

  const denyDeleteLock = await testWindowsDenyDeleteLock(root);
  results.observations.windowsDenyDeleteLock = denyDeleteLock;
  if (isWindows) {
    recordAssertion(
      'Windows deny-delete sharing blocks rename and unlink',
      denyDeleteLock.expectedLockObserved === true,
      denyDeleteLock,
    );
  }

  const replacementDirectory = join(root, 'rename-replacement');
  const existingDestination = join(replacementDirectory, 'destination.pdf');
  const stagedReplacement = join(replacementDirectory, 'staged.pdf');
  await mkdir(replacementDirectory);
  await writeFile(existingDestination, 'old');
  await writeFile(stagedReplacement, 'new');
  const replacement = await attempt(() => rename(stagedReplacement, existingDestination));
  results.observations.renameReplacement = {
    rename: replacement,
    finalContents: await readFile(existingDestination, 'utf8'),
  };

  let longDirectory = root;
  while (join(longDirectory, 'long-path.pdf').length <= 300) {
    longDirectory = join(longDirectory, `segment-${'x'.repeat(24)}`);
  }
  await mkdir(longDirectory, { recursive: true });
  const longPath = join(longDirectory, 'long-path.pdf');
  const longPathWrite = await attempt(() => writeFile(longPath, 'long-path-content'));
  const longPathRead = await attempt(() => readFile(longPath, 'utf8'));
  results.observations.longPath = {
    characters: longPath.length,
    namespaced: win32.toNamespacedPath(longPath),
    write: longPathWrite,
    read: longPathRead,
  };
  recordAssertion(
    'Path longer than 260 characters is readable and writable',
    longPathWrite.ok && longPathRead.ok && longPathRead.value === 'long-path-content',
    results.observations.longPath,
  );

  const managedBytes = Buffer.from('%PDF-1.7\nmanaged-object-content\n%%EOF\n');
  const concurrentManagedRoot = join(root, 'managed-concurrent');
  const [firstCommit, secondCommit] = await Promise.all([
    commitManagedObject(concurrentManagedRoot, managedBytes),
    commitManagedObject(concurrentManagedRoot, managedBytes),
  ]);
  const finalManagedHash = await hashFile(firstCommit.finalPath);
  const finalManagedStat = await stat(firstCommit.finalPath, { bigint: true });
  const managedRootStat = await stat(concurrentManagedRoot, { bigint: true });
  results.observations.managedCommit = {
    firstCommit,
    secondCommit,
    sameFinalPath: firstCommit.finalPath === secondCommit.finalPath,
    finalHashMatches: finalManagedHash === firstCommit.digest,
    sameDevice: finalManagedStat.dev === managedRootStat.dev,
  };
  recordAssertion(
    'Concurrent managed commits preserve one verified object',
    results.observations.managedCommit.sameFinalPath &&
      results.observations.managedCommit.finalHashMatches &&
      results.observations.managedCommit.sameDevice,
    results.observations.managedCommit,
  );

  const migrationSourceRoot = join(root, 'managed-migration-source');
  if (managedTargetBase) {
    await mkdir(managedTargetBase, { recursive: true });
    externalManagedTarget = await mkdtemp(join(managedTargetBase, 'wb-research-migration-'));
  }
  const migrationTargetRoot = externalManagedTarget ?? join(root, 'managed-migration-target');
  const migrationBytes = [
    Buffer.from('managed-root-migration-first'),
    Buffer.from('managed-root-migration-second'),
  ];
  const migrationSources = [];
  const migrationTargets = [];
  for (const bytes of migrationBytes) {
    const source = await commitManagedObject(migrationSourceRoot, bytes);
    const target = await commitManagedObject(migrationTargetRoot, await readFile(source.finalPath));
    migrationSources.push(source);
    migrationTargets.push(target);
  }
  const migrationVerified = await Promise.all(
    migrationSources.map(async (source, index) => {
      const target = migrationTargets[index];
      return (
        target &&
        source.digest === target.digest &&
        (await hashFile(source.finalPath)) === source.digest &&
        (await hashFile(target.finalPath)) === source.digest
      );
    }),
  );
  results.observations.managedRootMigration = {
    sourceRoot: migrationSourceRoot,
    targetRoot: migrationTargetRoot,
    externalTarget: externalManagedTarget !== null,
    sourceDevice: (await stat(migrationSourceRoot, { bigint: true })).dev.toString(),
    targetDevice: (await stat(migrationTargetRoot, { bigint: true })).dev.toString(),
    objects: migrationVerified.length,
    allHashesMatch: migrationVerified.every(Boolean),
    oldObjectsRemainReadable: migrationVerified.every(Boolean),
  };
  recordAssertion(
    'Managed-root copy verifies every object and retains the old root',
    migrationVerified.length === migrationBytes.length && migrationVerified.every(Boolean),
    results.observations.managedRootMigration,
  );

  results.observations.win32Syntax = {
    drivePath: win32.normalize('c:/Users/Test/../Papers/paper.pdf'),
    uncPath: win32.normalize('\\\\server\\share\\folder\\..\\paper.pdf'),
    namespacedPath: win32.toNamespacedPath('C:\\Papers\\paper.pdf'),
    differentDriveRelative: win32.relative('C:\\Library', 'D:\\Paper.pdf'),
  };
} catch (error) {
  recordAssertion('Validation script completed', false, serializeError(error));
} finally {
  const cleanup = await attempt(async () => {
    await rm(root, { recursive: true, force: true });
    if (externalManagedTarget) {
      await rm(externalManagedTarget, { recursive: true, force: true });
    }
  });
  recordAssertion(
    'Temporary directories are cleaned',
    cleanup.ok,
    cleanup.ok ? [root, externalManagedTarget].filter(Boolean) : cleanup.error,
  );
}

const failedAssertions = results.assertions.filter((item) => !item.passed);
results.summary = {
  passed: results.assertions.length - failedAssertions.length,
  failed: failedAssertions.length,
  warnings: results.warnings.length,
};

console.log(JSON.stringify(results, null, 2));

if (failedAssertions.length > 0) {
  process.exitCode = isWindows || smokeMode ? 1 : 2;
}
