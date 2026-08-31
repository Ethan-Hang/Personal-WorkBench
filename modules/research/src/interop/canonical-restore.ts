import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import {
  canonicalImportPreviewSchema,
  canonicalImportReportSchema,
  type CanonicalImportPreview,
  type CanonicalImportReport,
} from '../contract.js';
import { ResearchContentStore } from '../files/content-store.js';
import { validateCanonicalRoundTrip } from '../storage/canonical-roundtrip.js';
import {
  canonicalResearchLibrarySchema,
  canonicalResearchLibraryV3Schema,
  normalizeCanonicalResearchLibrary,
  type CanonicalResearchLibraryV3,
} from './canonical.js';
import {
  canonicalRecordCount,
  type CanonicalDatabaseImportResult,
} from '../storage/canonical-import.js';

const MAX_CANONICAL_BYTES = 256 * 1024 * 1024;

export interface CanonicalRestoreRepository {
  canonicalImportTargetIsEmpty(): Promise<boolean>;
  canonicalImportConflictIds(input: unknown, limit?: number): Promise<string[]>;
  importCanonicalSnapshot(input: unknown): Promise<CanonicalDatabaseImportResult>;
  exportCanonicalSnapshot(exportedAt: string): Promise<unknown>;
}

export class CanonicalRestoreError extends Error {
  constructor(
    readonly kind: 'invalid' | 'not-found' | 'conflict',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CanonicalRestoreError';
  }
}

interface LoadedCanonical {
  sourcePath: string;
  schemaVersion: 1 | 2 | 3;
  canonical: CanonicalResearchLibraryV3;
}

interface AssetPlan {
  asset: CanonicalResearchLibraryV3['assets'][number];
  objectKey: string;
  portablePath: string;
  sourcePath: string | null;
  alreadyManaged: boolean;
}

interface RestorePlan {
  assets: AssetPlan[];
  availableAssetCount: number;
  missingAssetCount: number;
  estimatedCopyBytes: number;
}

function objectKeyFor(contentHash: string): string {
  return `sha256/${contentHash.slice(0, 2)}/${contentHash.slice(2, 4)}/${contentHash}`;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException('恢复已取消', 'AbortError');
}

async function loadCanonical(sourceInput: string): Promise<LoadedCanonical> {
  let sourcePath = resolve(sourceInput);
  let info;
  try {
    info = await stat(sourcePath);
  } catch (cause) {
    throw new CanonicalRestoreError('not-found', '找不到 canonical JSON', { cause });
  }
  if (info.isDirectory()) {
    sourcePath = join(sourcePath, 'library.json');
    try {
      info = await stat(sourcePath);
    } catch (cause) {
      throw new CanonicalRestoreError('not-found', '目录中没有 library.json', { cause });
    }
  }
  if (!info.isFile() || extname(sourcePath).toLocaleLowerCase() !== '.json') {
    throw new CanonicalRestoreError('invalid', '恢复来源必须是 canonical JSON 文件');
  }
  if (info.size > MAX_CANONICAL_BYTES) {
    throw new CanonicalRestoreError('invalid', 'canonical JSON 超过 256 MiB');
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(await readFile(sourcePath, 'utf8')) as unknown;
  } catch (cause) {
    throw new CanonicalRestoreError('invalid', 'canonical JSON 无法解析', { cause });
  }
  const parsed = canonicalResearchLibrarySchema.safeParse(decoded);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const location = issue?.path.length ? `（${issue.path.join('.')}）` : '';
    throw new CanonicalRestoreError(
      'invalid',
      `canonical 数据不符合 schema${location}：${issue?.message ?? '未知错误'}`,
    );
  }
  return {
    sourcePath,
    schemaVersion: parsed.data.schemaVersion,
    canonical: normalizeCanonicalResearchLibrary(parsed.data),
  };
}

async function planAssets(
  loaded: LoadedCanonical,
  contentStore: ResearchContentStore,
  signal?: AbortSignal,
): Promise<RestorePlan> {
  const locationsByAsset = new Map<string, CanonicalResearchLibraryV3['locations']>();
  for (const location of loaded.canonical.locations) {
    const current = locationsByAsset.get(location.assetId) ?? [];
    current.push(location);
    locationsByAsset.set(location.assetId, current);
  }
  const assets: AssetPlan[] = [];
  let estimatedCopyBytes = 0;
  for (const asset of [...loaded.canonical.assets].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    throwIfAborted(signal);
    const objectKey = objectKeyFor(asset.contentHash);
    const managedAudit = await contentStore.auditManaged(
      objectKey,
      asset.contentHash,
      asset.byteSize,
      { signal },
    );
    const portablePath = join(dirname(loaded.sourcePath), 'files', objectKey);
    if (managedAudit.state === 'available') {
      assets.push({ asset, objectKey, portablePath, sourcePath: null, alreadyManaged: true });
      continue;
    }
    const canonicalLocations = [...(locationsByAsset.get(asset.id) ?? [])].sort((left, right) => {
      if (left.mode !== right.mode) return left.mode === 'managed' ? -1 : 1;
      return left.id.localeCompare(right.id);
    });
    const candidates = [
      portablePath,
      ...canonicalLocations.flatMap((location) => [location.resolvedPath, location.originalPath]),
    ];
    let sourcePath: string | null = null;
    for (const candidate of [...new Set(candidates.filter(Boolean))]) {
      throwIfAborted(signal);
      const audit = await contentStore.auditLinked(candidate, asset.contentHash, asset.byteSize, {
        signal,
      });
      if (audit.state === 'available') {
        sourcePath = candidate;
        break;
      }
    }
    if (sourcePath !== null) estimatedCopyBytes += asset.byteSize;
    assets.push({ asset, objectKey, portablePath, sourcePath, alreadyManaged: false });
  }
  const availableAssetCount = assets.filter(
    (asset) => asset.alreadyManaged || asset.sourcePath !== null,
  ).length;
  return {
    assets,
    availableAssetCount,
    missingAssetCount: assets.length - availableAssetCount,
    estimatedCopyBytes,
  };
}

function previewWarnings(
  loaded: LoadedCanonical,
  plan: RestorePlan,
  targetEmpty: boolean,
  conflictIds: string[],
): string[] {
  const warnings: string[] = [];
  if (loaded.schemaVersion < 3)
    warnings.push(`旧版 schema v${loaded.schemaVersion} 将按 v3 结构导入`);
  if (!targetEmpty) warnings.push('当前资料库不是空库，不能执行恢复');
  if (conflictIds.length > 0) warnings.push(`发现 ${conflictIds.length} 个 ID 冲突`);
  if (plan.missingAssetCount > 0) {
    warnings.push(`${plan.missingAssetCount} 个附件文件缺失，记录仍会保留并标记为缺失`);
  }
  return warnings;
}

export async function previewCanonicalRestore(
  repository: CanonicalRestoreRepository,
  contentStore: ResearchContentStore,
  sourcePath: string,
  signal?: AbortSignal,
): Promise<CanonicalImportPreview> {
  const loaded = await loadCanonical(sourcePath);
  const [targetEmpty, conflictIds, plan] = await Promise.all([
    repository.canonicalImportTargetIsEmpty(),
    repository.canonicalImportConflictIds(loaded.canonical),
    planAssets(loaded, contentStore, signal),
  ]);
  return canonicalImportPreviewSchema.parse({
    sourcePath: loaded.sourcePath,
    schemaVersion: loaded.schemaVersion,
    targetEmpty,
    recordCount: canonicalRecordCount(loaded.canonical),
    workCount: loaded.canonical.works.length,
    attachmentCount: loaded.canonical.attachments.length,
    availableAssetCount: plan.availableAssetCount,
    missingAssetCount: plan.missingAssetCount,
    estimatedCopyBytes: plan.estimatedCopyBytes,
    conflictIds,
    warnings: previewWarnings(loaded, plan, targetEmpty, conflictIds),
  });
}

interface ManagedLocation {
  assetId: string;
  objectKey: string;
  objectPath: string;
  originalPath: string;
  observedSize: number;
  observedMtimeMs: number;
  deviceId: string;
  fileId: string;
}

function nextLocationId(assetId: string, used: Set<string>): string {
  const base = `canonical-import-${assetId}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function prepareImportedCanonical(
  loaded: LoadedCanonical,
  plan: RestorePlan,
  managed: Map<string, ManagedLocation>,
  managedRoot: string,
  at: string,
): CanonicalResearchLibraryV3 {
  const canonical = canonicalResearchLibraryV3Schema.parse(structuredClone(loaded.canonical));
  const usedLocationIds = new Set(canonical.locations.map((location) => location.id));
  for (const planned of plan.assets) {
    const assetLocations = canonical.locations.filter(
      (location) => location.assetId === planned.asset.id,
    );
    const imported = managed.get(planned.asset.id);
    if (imported) {
      let location = assetLocations.find(
        (candidate) => candidate.mode === 'managed' && candidate.objectKey === imported.objectKey,
      );
      if (!location) {
        location = {
          id: nextLocationId(planned.asset.id, usedLocationIds),
          assetId: planned.asset.id,
          mode: 'managed',
          originalPath: imported.originalPath,
          resolvedPath: imported.objectPath,
          objectKey: imported.objectKey,
          state: planned.asset.state === 'recycled' ? 'recycled' : 'available',
          deviceId: imported.deviceId,
          fileId: imported.fileId,
          observedSize: imported.observedSize,
          observedMtimeMs: imported.observedMtimeMs,
          errorCode: null,
          lastCheckedAt: at,
          createdAt: at,
          updatedAt: at,
          recycledAt: planned.asset.state === 'recycled' ? planned.asset.recycledAt : null,
        };
        canonical.locations.push(location);
      } else {
        location.originalPath = imported.originalPath;
        location.resolvedPath = imported.objectPath;
        location.state = planned.asset.state === 'recycled' ? 'recycled' : 'available';
        location.observedSize = imported.observedSize;
        location.observedMtimeMs = imported.observedMtimeMs;
        location.deviceId = imported.deviceId;
        location.fileId = imported.fileId;
        location.errorCode = null;
        location.lastCheckedAt = at;
        location.updatedAt = at;
      }
      continue;
    }
    for (const location of assetLocations) {
      if (location.state !== 'recycled') location.state = 'missing';
      location.errorCode = 'CANONICAL_ATTACHMENT_MISSING';
      location.lastCheckedAt = at;
      location.updatedAt = at;
    }
    if (assetLocations.length === 0) {
      canonical.locations.push({
        id: nextLocationId(planned.asset.id, usedLocationIds),
        assetId: planned.asset.id,
        mode: 'managed',
        originalPath: planned.portablePath,
        resolvedPath: join(managedRoot, planned.objectKey),
        objectKey: planned.objectKey,
        state: 'missing',
        deviceId: null,
        fileId: null,
        observedSize: null,
        observedMtimeMs: null,
        errorCode: 'CANONICAL_ATTACHMENT_MISSING',
        lastCheckedAt: at,
        createdAt: at,
        updatedAt: at,
        recycledAt: null,
      });
    }
  }
  return canonicalResearchLibraryV3Schema.parse(canonical);
}

export interface RestoreCanonicalOptions {
  signal?: AbortSignal;
  completedAt?: () => string;
}

export async function restoreCanonicalIntoEmptyLibrary(
  repository: CanonicalRestoreRepository,
  contentStore: ResearchContentStore,
  sourcePath: string,
  options: RestoreCanonicalOptions = {},
): Promise<CanonicalImportReport> {
  const loaded = await loadCanonical(sourcePath);
  if (!(await repository.canonicalImportTargetIsEmpty())) {
    throw new CanonicalRestoreError('conflict', '当前资料库不是空库，不能执行恢复');
  }
  const conflicts = await repository.canonicalImportConflictIds(loaded.canonical);
  if (conflicts.length > 0) {
    throw new CanonicalRestoreError('conflict', '恢复内容与当前资料库存在 ID 冲突');
  }
  const plan = await planAssets(loaded, contentStore, options.signal);
  const managedRoot = await contentStore.resolvedRoot();
  const managed = new Map<string, ManagedLocation>();
  const createdObjects = new Map<
    string,
    { objectKey: string; contentHash: string; byteSize: number }
  >();
  let copiedAssets = 0;
  let copiedBytes = 0;
  let databaseCommitted = false;
  try {
    for (const planned of plan.assets) {
      throwIfAborted(options.signal);
      if (planned.alreadyManaged) {
        const objectPath = join(managedRoot, planned.objectKey);
        const info = await stat(objectPath);
        managed.set(planned.asset.id, {
          assetId: planned.asset.id,
          objectKey: planned.objectKey,
          objectPath,
          originalPath: objectPath,
          observedSize: info.size,
          observedMtimeMs: Math.trunc(info.mtimeMs),
          deviceId: info.dev.toString(),
          fileId: info.ino.toString(),
        });
        continue;
      }
      if (!planned.sourcePath) continue;
      const result = await contentStore.ingestManagedFile(
        planned.sourcePath,
        planned.asset.mimeType,
        { signal: options.signal },
      );
      if (
        result.contentHash !== planned.asset.contentHash ||
        result.byteSize !== planned.asset.byteSize
      ) {
        if (!result.reusedObject) {
          await contentStore.removeManagedObject(
            result.objectKey,
            result.contentHash,
            result.byteSize,
          );
        }
        throw new CanonicalRestoreError('invalid', `附件 ${planned.asset.id} 的 hash 已变化`);
      }
      if (!result.reusedObject) {
        createdObjects.set(result.objectKey, {
          objectKey: result.objectKey,
          contentHash: result.contentHash,
          byteSize: result.byteSize,
        });
      }
      const audit = await contentStore.auditManaged(
        result.objectKey,
        result.contentHash,
        result.byteSize,
      );
      if (audit.state !== 'available' || !audit.observedIdentity) {
        throw new CanonicalRestoreError('invalid', `附件 ${planned.asset.id} 复制后校验失败`);
      }
      if (!result.reusedObject) {
        copiedAssets += 1;
        copiedBytes += result.byteSize;
      }
      managed.set(planned.asset.id, {
        assetId: planned.asset.id,
        objectKey: result.objectKey,
        objectPath: result.objectPath,
        originalPath: result.originalPath,
        observedSize: audit.observedIdentity.size,
        observedMtimeMs: Math.trunc(audit.observedIdentity.mtimeMs),
        deviceId: audit.observedIdentity.deviceId,
        fileId: audit.observedIdentity.fileId,
      });
    }
    throwIfAborted(options.signal);
    const completedAt = options.completedAt?.() ?? new Date().toISOString();
    const prepared = prepareImportedCanonical(loaded, plan, managed, managedRoot, completedAt);
    const imported = await repository.importCanonicalSnapshot(prepared);
    databaseCommitted = true;
    const exported = await repository.exportCanonicalSnapshot(completedAt);
    validateCanonicalRoundTrip(exported);
    return canonicalImportReportSchema.parse({
      schemaVersion: loaded.schemaVersion,
      importedRecords: imported.recordCount,
      importedWorks: prepared.works.length,
      importedAttachments: prepared.attachments.length,
      copiedAssets,
      copiedBytes,
      missingAssets: plan.missingAssetCount,
      foreignKeysValid: true,
      roundTripValid: true,
      searchIndexed: imported.searchIndexed,
      completedAt,
      warnings: previewWarnings(loaded, plan, true, []),
    });
  } catch (cause) {
    if (!databaseCommitted) {
      await Promise.allSettled(
        [...createdObjects.values()].map((object) =>
          contentStore.removeManagedObject(object.objectKey, object.contentHash, object.byteSize),
        ),
      );
    }
    throw cause;
  }
}
