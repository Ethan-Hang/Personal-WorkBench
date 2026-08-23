import { createHash, randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { ResearchErrorCode } from '../contract.js';
import {
  errorCode,
  nodeResearchFileSystem,
  type FileIdentity,
  type ResearchFileSystem,
} from './file-system.js';

const CHUNK_SIZE = 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

export interface HashProgress {
  processedBytes: number;
  totalBytes: number;
}

export interface FileOperationOptions {
  signal?: AbortSignal;
  onProgress?: (progress: HashProgress) => void;
}

export interface ManagedObjectResult {
  contentHash: string;
  byteSize: number;
  mimeType: 'application/pdf';
  originalPath: string;
  resolvedSourcePath: string;
  objectKey: string;
  objectPath: string;
  reusedObject: boolean;
  sourceIdentity: FileIdentity;
}

export interface LinkedFileResult {
  contentHash: string;
  byteSize: number;
  mimeType: 'application/pdf';
  originalPath: string;
  resolvedPath: string;
  sourceIdentity: FileIdentity;
  originalPathIsSymbolicLink: boolean;
}

export interface FileAuditResult {
  state: 'available' | 'missing' | 'changed';
  errorCode: string | null;
  observedIdentity: FileIdentity | null;
}

export interface RelinkResult extends LinkedFileResult {
  matchesExpectedAsset: boolean;
}

export interface ManagedObjectEntry {
  objectKey: string;
  objectPath: string;
  contentHash: string;
  byteSize: number;
  mtimeMs: number;
}

export interface QuarantinedManagedObject extends ManagedObjectEntry {
  quarantinePath: string;
}

export interface StagedManagedUpload {
  path: string;
  byteSize: number;
}

export class FileLifecycleError extends Error {
  constructor(
    message: string,
    readonly code: ResearchErrorCode,
    readonly stage: string,
    readonly retryable: boolean,
    readonly causeCode: string | null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'FileLifecycleError';
  }
}

function mappedError(error: unknown, stage: string): FileLifecycleError {
  if (error instanceof FileLifecycleError) return error;
  const causeCode = errorCode(error);
  switch (causeCode) {
    case 'ENOENT':
      return new FileLifecycleError('文件不存在', 'FILE_MISSING', stage, true, causeCode, {
        cause: error,
      });
    case 'EBUSY':
      return new FileLifecycleError('文件正在被占用', 'FILE_BUSY', stage, true, causeCode, {
        cause: error,
      });
    case 'EACCES':
    case 'EPERM':
      return new FileLifecycleError(
        '没有权限访问文件',
        'FILE_PERMISSION_DENIED',
        stage,
        true,
        causeCode,
        { cause: error },
      );
    case 'ENOSPC':
      return new FileLifecycleError('托管位置空间不足', 'FILE_NO_SPACE', stage, true, causeCode, {
        cause: error,
      });
    case 'EXDEV':
      return new FileLifecycleError(
        '临时文件与托管位置不在同一文件系统',
        'FILE_CROSS_DEVICE',
        stage,
        false,
        causeCode,
        { cause: error },
      );
    default:
      return new FileLifecycleError('文件操作失败', 'FILE_IO', stage, true, causeCode, {
        cause: error,
      });
  }
}

function throwIfAborted(signal: AbortSignal | undefined, stage: string): void {
  if (!signal?.aborted) return;
  throw new FileLifecycleError('文件操作已取消', 'IMPORT_CANCELLED', stage, true, 'ABORT_ERR');
}

function objectKeyFor(contentHash: string): string {
  return `sha256/${contentHash.slice(0, 2)}/${contentHash.slice(2, 4)}/${contentHash}`;
}

async function closeQuietly(handle: { close(): Promise<void> } | null): Promise<void> {
  if (!handle) return;
  try {
    await handle.close();
  } catch {
    // 保留触发清理的原始错误。
  }
}

export class ResearchContentStore {
  constructor(
    private readonly managedRoot: () => string,
    private readonly fs: ResearchFileSystem = nodeResearchFileSystem,
    private readonly createId: () => string = randomUUID,
  ) {}

  async resolvedRoot(): Promise<string> {
    const requested = resolve(this.managedRoot());
    try {
      await this.fs.mkdir(requested);
      return await this.fs.realpath(requested);
    } catch (error) {
      throw mappedError(error, 'prepare-managed-root');
    }
  }

  private async objectPath(objectKey: string): Promise<string> {
    const root = await this.resolvedRoot();
    const target = resolve(root, objectKey);
    const inside = relative(root, target);
    if (inside.startsWith(`..${sep}`) || inside === '..' || isAbsolute(inside)) {
      throw new FileLifecycleError(
        '对象路径越出托管根目录',
        'INVALID_INPUT',
        'resolve-object',
        false,
        null,
      );
    }
    return target;
  }

  async stageManagedUpload(
    chunks: AsyncIterable<Uint8Array>,
    options: FileOperationOptions = {},
  ): Promise<StagedManagedUpload> {
    const root = await this.resolvedRoot();
    const stagingRoot = join(root, '.staging');
    const uploadPath = join(stagingRoot, `${this.createId()}.upload`);
    let target = null;
    let byteSize = 0;
    const signature = Buffer.alloc(5);
    let signatureBytes = 0;
    try {
      await this.fs.mkdir(stagingRoot);
      target = await this.fs.openWriteExclusive(uploadPath);
      for await (const value of chunks) {
        throwIfAborted(options.signal, 'upload');
        const chunk = Buffer.from(value);
        if (chunk.length === 0) continue;
        byteSize += chunk.length;
        if (byteSize > MAX_UPLOAD_BYTES) {
          throw new FileLifecycleError(
            '单个 PDF 不能超过 2 GiB',
            'INVALID_INPUT',
            'upload',
            false,
            null,
          );
        }
        if (signatureBytes < signature.length) {
          const copied = Math.min(chunk.length, signature.length - signatureBytes);
          chunk.copy(signature, signatureBytes, 0, copied);
          signatureBytes += copied;
        }
        let offset = 0;
        while (offset < chunk.length) {
          const written = await target.write(chunk, offset, chunk.length - offset);
          if (written <= 0) throw new Error('write returned no progress');
          offset += written;
        }
        options.onProgress?.({ processedBytes: byteSize, totalBytes: byteSize });
      }
      if (signatureBytes !== signature.length || signature.toString('ascii') !== '%PDF-') {
        throw new FileLifecycleError('文件内容不是 PDF', 'PDF_INVALID', 'upload', false, null);
      }
      await target.sync();
      await closeQuietly(target);
      target = null;
      return { path: uploadPath, byteSize };
    } catch (error) {
      await closeQuietly(target);
      await this.fs.remove(uploadPath).catch(() => undefined);
      throw mappedError(error, 'upload');
    }
  }

  async discardStagedUpload(uploadPath: string): Promise<void> {
    const root = await this.resolvedRoot();
    const stagingRoot = resolve(root, '.staging');
    const target = resolve(uploadPath);
    const inside = relative(stagingRoot, target);
    if (
      inside.startsWith(`..${sep}`) ||
      inside === '..' ||
      isAbsolute(inside) ||
      !target.endsWith('.upload')
    ) {
      throw new FileLifecycleError(
        '上传临时路径不合法',
        'INVALID_INPUT',
        'discard-upload',
        false,
        null,
      );
    }
    try {
      await this.fs.remove(target);
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw mappedError(error, 'discard-upload');
    }
  }

  private async hashHandle(
    sourcePath: string,
    targetPath: string | null,
    identity: FileIdentity,
    options: FileOperationOptions,
    validatePdf = false,
  ): Promise<string> {
    let source = null;
    let target = null;
    const digest = createHash('sha256');
    let processedBytes = 0;
    const signature = Buffer.alloc(5);
    let signatureBytes = 0;
    try {
      source = await this.fs.openRead(sourcePath);
      if (targetPath) target = await this.fs.openWriteExclusive(targetPath);
      const buffer = Buffer.allocUnsafe(CHUNK_SIZE);
      while (true) {
        throwIfAborted(options.signal, targetPath ? 'copy' : 'hash');
        const bytesRead = await source.read(buffer);
        if (bytesRead === 0) break;
        if (signatureBytes < signature.length) {
          const copied = Math.min(bytesRead, signature.length - signatureBytes);
          buffer.copy(signature, signatureBytes, 0, copied);
          signatureBytes += copied;
        }
        digest.update(buffer.subarray(0, bytesRead));
        if (target) {
          let offset = 0;
          while (offset < bytesRead) {
            const written = await target.write(buffer, offset, bytesRead - offset);
            if (written <= 0) throw new Error('write returned no progress');
            offset += written;
          }
        }
        processedBytes += bytesRead;
        options.onProgress?.({ processedBytes, totalBytes: identity.size });
      }
      if (processedBytes !== identity.size) {
        throw new FileLifecycleError(
          '文件在读取过程中发生变化',
          'FILE_CHANGED',
          targetPath ? 'copy' : 'hash',
          true,
          null,
        );
      }
      if (
        validatePdf &&
        (signatureBytes !== signature.length || signature.toString('ascii') !== '%PDF-')
      ) {
        throw new FileLifecycleError(
          '文件内容不是 PDF',
          'PDF_INVALID',
          'validate-pdf',
          false,
          null,
        );
      }
      if (target) await target.sync();
      await closeQuietly(target);
      target = null;
      await closeQuietly(source);
      source = null;
      return digest.digest('hex');
    } catch (error) {
      await closeQuietly(target);
      await closeQuietly(source);
      throw mappedError(error, targetPath ? 'copy' : 'hash');
    }
  }

  private async verifyExistingObject(
    objectPath: string,
    expectedHash: string,
    expectedSize: number,
    signal?: AbortSignal,
  ): Promise<void> {
    const identity = await this.fs.stat(objectPath);
    if (!identity.isFile || identity.size !== expectedSize) {
      throw new FileLifecycleError(
        '托管对象路径已存在，但大小与内容地址不符',
        'FILE_CHANGED',
        'verify-existing-object',
        false,
        null,
      );
    }
    const actualHash = await this.hashHandle(objectPath, null, identity, { signal });
    if (actualHash !== expectedHash) {
      throw new FileLifecycleError(
        '托管对象路径已存在，但 hash 与内容地址不符',
        'FILE_CHANGED',
        'verify-existing-object',
        false,
        null,
      );
    }
  }

  async ingestManaged(
    sourcePath: string,
    options: FileOperationOptions = {},
  ): Promise<ManagedObjectResult> {
    const originalPath = sourcePath;
    let tempPath: string | null = null;
    try {
      throwIfAborted(options.signal, 'prepare');
      const root = await this.resolvedRoot();
      const stagingRoot = join(root, '.staging');
      await this.fs.mkdir(stagingRoot);
      const sourceIdentity = await this.fs.stat(sourcePath);
      if (!sourceIdentity.isFile) {
        throw new FileLifecycleError(
          '只能导入普通文件',
          'INVALID_INPUT',
          'stat-source',
          false,
          null,
        );
      }
      const resolvedSourcePath = await this.fs.realpath(sourcePath);
      tempPath = join(stagingRoot, `${this.createId()}.part`);
      const contentHash = await this.hashHandle(
        sourcePath,
        tempPath,
        sourceIdentity,
        options,
        true,
      );
      throwIfAborted(options.signal, 'publish');
      const objectKey = objectKeyFor(contentHash);
      const objectPath = await this.objectPath(objectKey);
      await this.fs.mkdir(dirname(objectPath));

      let reusedObject = false;
      try {
        await this.fs.link(tempPath, objectPath);
      } catch (error) {
        const code = errorCode(error);
        if (code !== 'EEXIST') throw error;
        await this.verifyExistingObject(
          objectPath,
          contentHash,
          sourceIdentity.size,
          options.signal,
        );
        reusedObject = true;
      }
      await this.fs.unlink(tempPath);
      tempPath = null;
      return {
        contentHash,
        byteSize: sourceIdentity.size,
        mimeType: 'application/pdf',
        originalPath,
        resolvedSourcePath,
        objectKey,
        objectPath,
        reusedObject,
        sourceIdentity,
      };
    } catch (error) {
      if (tempPath) await this.fs.remove(tempPath).catch(() => undefined);
      throw mappedError(error, 'managed-ingest');
    }
  }

  async inspectLinked(
    sourcePath: string,
    options: FileOperationOptions = {},
  ): Promise<LinkedFileResult> {
    try {
      throwIfAborted(options.signal, 'prepare');
      const originalIdentity = await this.fs.lstat(sourcePath);
      const resolvedPath = await this.fs.realpath(sourcePath);
      const sourceIdentity = await this.fs.stat(resolvedPath);
      if (!sourceIdentity.isFile) {
        throw new FileLifecycleError(
          '只能链接普通文件',
          'INVALID_INPUT',
          'stat-source',
          false,
          null,
        );
      }
      const contentHash = await this.hashHandle(resolvedPath, null, sourceIdentity, options, true);
      return {
        contentHash,
        byteSize: sourceIdentity.size,
        mimeType: 'application/pdf',
        originalPath: sourcePath,
        resolvedPath,
        sourceIdentity,
        originalPathIsSymbolicLink: originalIdentity.isSymbolicLink,
      };
    } catch (error) {
      throw mappedError(error, 'linked-inspect');
    }
  }

  async auditLinked(
    path: string,
    expectedHash: string,
    expectedSize: number,
    options: FileOperationOptions = {},
  ): Promise<FileAuditResult> {
    try {
      const resolved = await this.fs.realpath(path);
      const identity = await this.fs.stat(resolved);
      if (!identity.isFile || identity.size !== expectedSize) {
        return { state: 'changed', errorCode: 'SIZE_CHANGED', observedIdentity: identity };
      }
      const hash = await this.hashHandle(resolved, null, identity, options);
      return hash === expectedHash
        ? { state: 'available', errorCode: null, observedIdentity: identity }
        : { state: 'changed', errorCode: 'HASH_CHANGED', observedIdentity: identity };
    } catch (error) {
      if (
        errorCode(error) === 'ENOENT' ||
        (error instanceof FileLifecycleError && error.code === 'FILE_MISSING')
      ) {
        return { state: 'missing', errorCode: 'ENOENT', observedIdentity: null };
      }
      throw mappedError(error, 'audit-linked');
    }
  }

  async auditManaged(
    objectKey: string,
    expectedHash: string,
    expectedSize: number,
    options: FileOperationOptions = {},
  ): Promise<FileAuditResult> {
    try {
      const path = await this.objectPath(objectKey);
      return await this.auditLinked(path, expectedHash, expectedSize, options);
    } catch (error) {
      if (error instanceof FileLifecycleError && error.code === 'FILE_MISSING') {
        return { state: 'missing', errorCode: 'ENOENT', observedIdentity: null };
      }
      throw error;
    }
  }

  async relink(
    newPath: string,
    expectedHash: string,
    options: FileOperationOptions = {},
  ): Promise<RelinkResult> {
    const inspected = await this.inspectLinked(newPath, options);
    return { ...inspected, matchesExpectedAsset: inspected.contentHash === expectedHash };
  }

  async removeManagedObject(
    objectKey: string,
    expectedHash: string,
    expectedSize: number,
  ): Promise<void> {
    if (!SHA256_PATTERN.test(expectedHash) || objectKey !== objectKeyFor(expectedHash)) {
      throw new FileLifecycleError(
        '对象标识与 hash 不一致',
        'INVALID_INPUT',
        'remove-object',
        false,
        null,
      );
    }
    const objectPath = await this.objectPath(objectKey);
    const audit = await this.auditManaged(objectKey, expectedHash, expectedSize);
    if (audit.state === 'missing') return;
    if (audit.state !== 'available') {
      throw new FileLifecycleError(
        '托管对象已变化，拒绝删除',
        'FILE_CHANGED',
        'remove-object',
        false,
        null,
      );
    }
    try {
      await this.fs.unlink(objectPath);
    } catch (error) {
      throw mappedError(error, 'remove-object');
    }
  }

  async quarantineManagedObject(
    objectKey: string,
    expectedHash: string,
    expectedSize: number,
  ): Promise<QuarantinedManagedObject | null> {
    if (!SHA256_PATTERN.test(expectedHash) || objectKey !== objectKeyFor(expectedHash)) {
      throw new FileLifecycleError(
        '对象标识与 hash 不一致',
        'INVALID_INPUT',
        'quarantine-object',
        false,
        null,
      );
    }
    const objectPath = await this.objectPath(objectKey);
    const audit = await this.auditManaged(objectKey, expectedHash, expectedSize);
    if (audit.state === 'missing') return null;
    if (audit.state !== 'available') {
      throw new FileLifecycleError(
        '托管对象已变化，拒绝删除',
        'FILE_CHANGED',
        'quarantine-object',
        false,
        null,
      );
    }
    const root = await this.resolvedRoot();
    const quarantineRoot = join(root, '.trash');
    await this.fs.mkdir(quarantineRoot);
    const quarantinePath = join(quarantineRoot, `${expectedHash}-${this.createId()}.pending`);
    try {
      await this.fs.rename(objectPath, quarantinePath);
    } catch (error) {
      throw mappedError(error, 'quarantine-object');
    }
    return {
      objectKey,
      objectPath,
      contentHash: expectedHash,
      byteSize: expectedSize,
      mtimeMs: audit.observedIdentity?.mtimeMs ?? 0,
      quarantinePath,
    };
  }

  async restoreQuarantinedObject(object: QuarantinedManagedObject): Promise<void> {
    try {
      await this.fs.mkdir(dirname(object.objectPath));
      await this.fs.rename(object.quarantinePath, object.objectPath);
    } catch (error) {
      throw mappedError(error, 'restore-quarantined-object');
    }
  }

  async finalizeQuarantinedObject(object: QuarantinedManagedObject): Promise<void> {
    try {
      await this.fs.unlink(object.quarantinePath);
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw mappedError(error, 'finalize-quarantined-object');
    }
  }

  async listManagedObjects(): Promise<ManagedObjectEntry[]> {
    const root = await this.resolvedRoot();
    const algorithmRoot = join(root, 'sha256');
    const found: ManagedObjectEntry[] = [];
    let firstLevels: string[];
    try {
      firstLevels = await this.fs.readdir(algorithmRoot);
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return [];
      throw mappedError(error, 'scan-managed-objects');
    }
    for (const first of firstLevels) {
      if (!/^[a-f0-9]{2}$/.test(first)) continue;
      const firstPath = join(algorithmRoot, first);
      let secondLevels: string[];
      try {
        secondLevels = await this.fs.readdir(firstPath);
      } catch {
        continue;
      }
      for (const second of secondLevels) {
        if (!/^[a-f0-9]{2}$/.test(second)) continue;
        const secondPath = join(firstPath, second);
        let names: string[];
        try {
          names = await this.fs.readdir(secondPath);
        } catch {
          continue;
        }
        for (const contentHash of names) {
          if (!SHA256_PATTERN.test(contentHash)) continue;
          if (contentHash.slice(0, 2) !== first || contentHash.slice(2, 4) !== second) continue;
          const objectKey = objectKeyFor(contentHash);
          const objectPath = join(secondPath, contentHash);
          try {
            const identity = await this.fs.stat(objectPath);
            if (!identity.isFile) continue;
            found.push({
              objectKey,
              objectPath,
              contentHash,
              byteSize: identity.size,
              mtimeMs: identity.mtimeMs,
            });
          } catch {
            // 扫描过程中对象可能被另一次导入发布或清理；下次对账会重新采样。
          }
        }
      }
    }
    return found.sort((left, right) => left.objectKey.localeCompare(right.objectKey));
  }

  async removeStaleStagingFiles(olderThan: Date): Promise<string[]> {
    const files = await this.listStagingFiles();
    const removed: string[] = [];
    for (const path of files) {
      try {
        const identity = await this.fs.stat(path);
        if (identity.mtimeMs > olderThan.getTime()) continue;
        await this.fs.remove(path);
        removed.push(path);
      } catch (error) {
        if (errorCode(error) !== 'ENOENT') throw mappedError(error, 'remove-stale-staging');
      }
    }
    return removed;
  }

  async listStagingFiles(): Promise<string[]> {
    const root = await this.resolvedRoot();
    const stagingRoot = join(root, '.staging');
    try {
      return (await this.fs.readdir(stagingRoot)).map((name) => join(stagingRoot, name));
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return [];
      throw mappedError(error, 'list-staging');
    }
  }
}
