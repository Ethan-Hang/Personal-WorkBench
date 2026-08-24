import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, lstat, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { z } from 'zod';
import {
  portableExportFileIssueSchema,
  portableExportProgressSchema,
  portableExportReportSchema,
  type PortableExportFileIssue,
  type PortableExportOptions,
  type PortableExportPreview,
  type PortableExportProgress,
  type PortableExportReport,
} from '../contract.js';
import { canonicalResearchLibrarySchema, type CanonicalResearchLibrary } from './canonical.js';
import { validateCanonicalRoundTrip } from '../storage/canonical-roundtrip.js';

const manifestLocationSchema = z.object({
  id: z.string(),
  mode: z.enum(['managed', 'linked']),
  originalPath: z.string(),
  state: z.string(),
});

const portableManifestSchema = z.object({
  schemaVersion: z.literal(1),
  createdAt: z.string(),
  canonicalFile: z.literal('library.json'),
  attachments: z.array(
    z.object({
      attachmentId: z.string(),
      editionId: z.string(),
      assetId: z.string(),
      hashAlgorithm: z.literal('sha256'),
      contentHash: z.string(),
      byteSize: z.number().int().nonnegative(),
      mimeType: z.string(),
      role: z.string(),
      displayName: z.string(),
      originalLocations: z.array(manifestLocationSchema),
      selectedSourceMode: z.enum(['managed', 'linked']).nullable(),
      exportRelativePath: z.string().nullable(),
      included: z.boolean(),
      missing: z.boolean(),
      copyError: z.string().nullable(),
    }),
  ),
  totals: z.object({
    works: z.number().int().nonnegative(),
    attachments: z.number().int().nonnegative(),
    copiedAssets: z.number().int().nonnegative(),
    copiedBytes: z.number().int().nonnegative(),
    missingAttachments: z.number().int().nonnegative(),
    copyFailures: z.number().int().nonnegative(),
  }),
});

interface AvailableLocation {
  id: string;
  mode: 'managed' | 'linked';
  originalPath: string;
  resolvedPath: string;
  state: string;
}

interface PlannedAsset {
  assetId: string;
  contentHash: string;
  byteSize: number;
  source: AvailableLocation;
  relativePath: string;
}

interface ExportPlan {
  assets: PlannedAsset[];
  selectedSourceByAsset: Map<string, AvailableLocation>;
  availableSourceByAsset: Map<string, AvailableLocation>;
  missing: PortableExportFileIssue[];
  estimatedBytes: number;
}

function requestedMode(options: PortableExportOptions, mode: 'managed' | 'linked'): boolean {
  return mode === 'managed' ? options.includeManagedFiles : options.includeLinkedFiles;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function firstAvailable(
  locations: CanonicalResearchLibrary['locations'],
  byteSize: number,
  allowed: (mode: 'managed' | 'linked') => boolean,
): Promise<AvailableLocation | null> {
  const ordered = [...locations].sort((left, right) => {
    if (left.mode !== right.mode) return left.mode === 'managed' ? -1 : 1;
    return left.id.localeCompare(right.id);
  });
  for (const location of ordered) {
    if (!allowed(location.mode)) continue;
    try {
      const info = await stat(location.resolvedPath);
      if (info.isFile() && info.size === byteSize) return location;
    } catch {
      // 下一个位置可能仍可用；最终结果会进入 missing 报告。
    }
  }
  return null;
}

async function planExport(
  canonical: CanonicalResearchLibrary,
  options: PortableExportOptions,
): Promise<ExportPlan> {
  const locationsByAsset = new Map<string, CanonicalResearchLibrary['locations']>();
  for (const location of canonical.locations) {
    const current = locationsByAsset.get(location.assetId) ?? [];
    current.push(location);
    locationsByAsset.set(location.assetId, current);
  }
  const assetsById = new Map(canonical.assets.map((asset) => [asset.id, asset]));
  const selectedSourceByAsset = new Map<string, AvailableLocation>();
  const availableSourceByAsset = new Map<string, AvailableLocation>();
  const missing: PortableExportFileIssue[] = [];

  for (const attachment of canonical.attachments) {
    const asset = assetsById.get(attachment.assetId);
    if (!asset) continue;
    const locations = locationsByAsset.get(asset.id) ?? [];
    let available = availableSourceByAsset.get(asset.id) ?? null;
    if (!available) {
      available = await firstAvailable(locations, asset.byteSize, () => true);
      if (available) availableSourceByAsset.set(asset.id, available);
    }
    let selected = selectedSourceByAsset.get(asset.id) ?? null;
    if (!selected && (options.includeManagedFiles || options.includeLinkedFiles)) {
      selected = await firstAvailable(locations, asset.byteSize, (mode) =>
        requestedMode(options, mode),
      );
      if (selected) selectedSourceByAsset.set(asset.id, selected);
    }
    if (!available || ((options.includeManagedFiles || options.includeLinkedFiles) && !selected)) {
      missing.push({
        attachmentId: attachment.id,
        assetId: asset.id,
        displayName: attachment.displayName,
        reason: available ? '所选文件模式没有可访问位置' : '没有可访问且大小一致的文件位置',
        attemptedPath: locations[0]?.resolvedPath ?? null,
      });
    }
  }

  const assets = [...selectedSourceByAsset.entries()]
    .map(([assetId, source]) => {
      const asset = assetsById.get(assetId)!;
      return {
        assetId,
        contentHash: asset.contentHash,
        byteSize: asset.byteSize,
        source,
        relativePath: join(
          'files',
          'sha256',
          asset.contentHash.slice(0, 2),
          asset.contentHash.slice(2, 4),
          asset.contentHash,
        ),
      };
    })
    .sort((left, right) => left.assetId.localeCompare(right.assetId));
  return {
    assets,
    selectedSourceByAsset,
    availableSourceByAsset,
    missing,
    estimatedBytes: assets.reduce((total, asset) => total + asset.byteSize, 0),
  };
}

export async function previewPortableExport(
  canonicalInput: unknown,
  options: PortableExportOptions,
  targetPath?: string,
): Promise<PortableExportPreview> {
  const canonical = canonicalResearchLibrarySchema.parse(canonicalInput);
  const plan = await planExport(canonical, options);
  const resolvedTarget = targetPath ? resolve(targetPath) : null;
  return {
    workCount: canonical.works.length,
    attachmentCount: canonical.attachments.length,
    selectedAssetCount: plan.assets.length,
    estimatedBytes: plan.estimatedBytes,
    missing: plan.missing,
    targetPath: resolvedTarget,
    targetExists: resolvedTarget ? await exists(resolvedTarget) : false,
  };
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('导出已取消', 'AbortError');
}

async function copyAndHash(
  sourcePath: string,
  targetPath: string,
  signal: AbortSignal,
  onBytes: (bytes: number) => void,
): Promise<{ contentHash: string; byteSize: number }> {
  const digest = createHash('sha256');
  let byteSize = 0;
  const tap = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      digest.update(chunk);
      byteSize += chunk.length;
      onBytes(chunk.length);
      callback(null, chunk);
    },
  });
  await pipeline(
    createReadStream(sourcePath),
    tap,
    createWriteStream(targetPath, { flags: 'wx' }),
    {
      signal,
    },
  );
  return { contentHash: digest.digest('hex'), byteSize };
}

export interface WritePortableExportInput {
  jobId: string;
  targetPath: string;
  canonical: CanonicalResearchLibrary;
  options: PortableExportOptions;
  signal: AbortSignal;
  completedAt: () => string;
  onProgress?: (progress: PortableExportProgress) => void | Promise<void>;
}

export async function writePortableExport(
  input: WritePortableExportInput,
): Promise<PortableExportReport> {
  const canonical = canonicalResearchLibrarySchema.parse(input.canonical);
  const target = resolve(input.targetPath);
  if (dirname(target) === target) throw new Error('导出目标不能是文件系统根目录');
  if (await exists(target)) throw new Error('导出目标已经存在，请选择新的目录');

  const parent = dirname(target);
  await mkdir(parent, { recursive: true });
  const temporary = join(parent, `.${basename(target)}.tmp-${input.jobId}`);
  if (await exists(temporary)) throw new Error('同名导出临时目录已经存在');
  await mkdir(temporary, { recursive: false });

  const plan = await planExport(canonical, input.options);
  let completedAssets = 0;
  let processedBytes = 0;
  let copiedBytes = 0;
  const copyFailures: PortableExportFileIssue[] = [];
  const copiedAssets = new Set<string>();
  const failedAssets = new Map<string, string>();
  const progress = async (phase: PortableExportProgress['phase']) => {
    await input.onProgress?.(
      portableExportProgressSchema.parse({
        phase,
        completedAssets,
        totalAssets: plan.assets.length,
        copiedBytes: processedBytes,
        totalBytes: plan.estimatedBytes,
      }),
    );
  };

  try {
    throwIfAborted(input.signal);
    await progress('snapshot');
    await writeFile(join(temporary, 'library.json'), `${JSON.stringify(canonical, null, 2)}\n`, {
      flag: 'wx',
    });
    await progress('copying');
    for (const planned of plan.assets) {
      throwIfAborted(input.signal);
      const output = resolve(temporary, planned.relativePath);
      const inside = relative(temporary, output);
      if (inside === '..' || inside.startsWith(`..${sep}`)) throw new Error('导出文件越出临时目录');
      await mkdir(dirname(output), { recursive: true });
      try {
        const verified = await copyAndHash(
          planned.source.resolvedPath,
          output,
          input.signal,
          (bytes) => {
            processedBytes += bytes;
          },
        );
        if (
          verified.byteSize !== planned.byteSize ||
          verified.contentHash !== planned.contentHash
        ) {
          throw new Error('复制后文件的大小或 SHA-256 与资料库记录不一致');
        }
        copiedAssets.add(planned.assetId);
        copiedBytes += verified.byteSize;
      } catch (cause) {
        if (input.signal.aborted) throw cause;
        await rm(output, { force: true });
        const message = cause instanceof Error ? cause.message : '文件复制失败';
        failedAssets.set(planned.assetId, message);
        for (const attachment of canonical.attachments.filter(
          (item) => item.assetId === planned.assetId,
        )) {
          copyFailures.push({
            attachmentId: attachment.id,
            assetId: attachment.assetId,
            displayName: attachment.displayName,
            reason: message,
            attemptedPath: planned.source.resolvedPath,
          });
        }
      }
      completedAssets += 1;
      await progress('copying');
    }

    throwIfAborted(input.signal);
    await progress('validating');
    const roundTrip = validateCanonicalRoundTrip(canonical);
    const assetsById = new Map(canonical.assets.map((asset) => [asset.id, asset]));
    const locationsByAsset = new Map<string, CanonicalResearchLibrary['locations']>();
    for (const location of canonical.locations) {
      const current = locationsByAsset.get(location.assetId) ?? [];
      current.push(location);
      locationsByAsset.set(location.assetId, current);
    }
    const manifest = portableManifestSchema.parse({
      schemaVersion: 1,
      createdAt: input.completedAt(),
      canonicalFile: 'library.json',
      attachments: canonical.attachments.map((attachment) => {
        const asset = assetsById.get(attachment.assetId)!;
        const selected = plan.selectedSourceByAsset.get(asset.id) ?? null;
        const relativePath = plan.assets.find((item) => item.assetId === asset.id)?.relativePath;
        return {
          attachmentId: attachment.id,
          editionId: attachment.editionId,
          assetId: asset.id,
          hashAlgorithm: 'sha256',
          contentHash: asset.contentHash,
          byteSize: asset.byteSize,
          mimeType: asset.mimeType,
          role: attachment.role,
          displayName: attachment.displayName,
          originalLocations: (locationsByAsset.get(asset.id) ?? []).map((location) => ({
            id: location.id,
            mode: location.mode,
            originalPath: location.originalPath,
            state: location.state,
          })),
          selectedSourceMode: selected?.mode ?? null,
          exportRelativePath: copiedAssets.has(asset.id) ? (relativePath ?? null) : null,
          included: copiedAssets.has(asset.id),
          missing: !plan.availableSourceByAsset.has(asset.id),
          copyError: failedAssets.get(asset.id) ?? null,
        };
      }),
      totals: {
        works: canonical.works.length,
        attachments: canonical.attachments.length,
        copiedAssets: copiedAssets.size,
        copiedBytes,
        missingAttachments: plan.missing.length,
        copyFailures: copyFailures.length,
      },
    });
    const completedAt = input.completedAt();
    const report = portableExportReportSchema.parse({
      schemaVersion: 1,
      targetPath: target,
      canonicalFile: 'library.json',
      manifestFile: 'manifest.json',
      reportFile: 'report.json',
      canonicalFingerprint: roundTrip.fingerprint,
      roundTripValid: true,
      workCount: canonical.works.length,
      attachmentCount: canonical.attachments.length,
      copiedAssetCount: copiedAssets.size,
      copiedBytes,
      missing: plan.missing,
      copyFailures,
      completedAt,
    });
    portableExportFileIssueSchema.array().parse([...plan.missing, ...copyFailures]);
    await writeFile(join(temporary, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {
      flag: 'wx',
    });
    await writeFile(join(temporary, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, {
      flag: 'wx',
    });
    throwIfAborted(input.signal);
    await progress('publishing');
    await rename(temporary, target);
    await progress('done');
    return report;
  } catch (cause) {
    await rm(temporary, { recursive: true, force: true });
    throw cause;
  }
}

export async function assertPublishedBundle(path: string): Promise<void> {
  const target = resolve(path);
  const info = await lstat(target);
  if (!info.isDirectory()) throw new Error('导出结果不是目录');
  await Promise.all(
    ['library.json', 'manifest.json', 'report.json'].map((name) => access(join(target, name))),
  );
}
