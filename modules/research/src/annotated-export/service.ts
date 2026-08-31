import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import {
  annotatedExportJobSchema,
  annotatedExportPreviewInputSchema,
  annotatedExportPreviewSchema,
  annotatedExportReportSchema,
  pickAnnotatedExportTargetInputSchema,
  pickAnnotatedExportTargetResponseSchema,
  retryAnnotatedExportInputSchema,
  startAnnotatedExportInputSchema,
  type AnnotatedExportDecision,
  type AnnotatedExportJob,
  type AnnotatedExportPreview,
  type AnnotatedExportPreviewInput,
  type Annotation,
  type PickAnnotatedExportTargetInput,
  type PickAnnotatedExportTargetResponse,
  type RetryAnnotatedExportInput,
  type StartAnnotatedExportInput,
} from '../contract.js';
import type { AnnotationRepository } from '../annotation/repository.js';
import {
  PdfLibAnnotatedPdfWriter,
  planAnnotatedPdfExport,
  type AnnotatedPdfWriter,
} from '../interop/annotated-export.js';
import type { ReaderContentSource, ResolvedReaderContent } from '../reader/content-source.js';
import { ReaderError } from '../reader/errors.js';
import type { PdfOutputDialog } from '../server/file-picker.js';
import type { AnnotatedExportJobRecord, AnnotatedExportRepository } from './repository.js';

interface StoredOptions {
  input: StartAnnotatedExportInput;
  sourceHash: string;
}

export interface AnnotatedExportServiceOptions {
  writer?: AnnotatedPdfWriter;
  createId?: () => string;
  now?: () => Date;
}

function counts(decisions: AnnotatedExportDecision[]) {
  return {
    standardCount: decisions.filter((value) => value.treatment === 'standard').length,
    flattenedCount: decisions.filter((value) => value.treatment === 'flattened').length,
    skippedCount: decisions.filter((value) => value.treatment === 'skipped').length,
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function hashFile(filePath: string, signal?: AbortSignal): Promise<string> {
  const digest = createHash('sha256');
  const stream = createReadStream(filePath, signal ? { signal } : undefined);
  for await (const chunk of stream) digest.update(chunk as Buffer);
  return digest.digest('hex');
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('带批注副本导出已取消', 'AbortError');
}

function targetPath(input: string): string {
  const target = resolve(input);
  if (dirname(target) === target) {
    throw new ReaderError('READER_EXPORT_FAILED', '导出目标不能是文件系统根目录', 400);
  }
  if (!target.toLowerCase().endsWith('.pdf')) {
    throw new ReaderError('READER_EXPORT_FAILED', '带批注副本必须使用 .pdf 扩展名', 400);
  }
  return target;
}

function tempPath(target: string, id: string): string {
  return join(dirname(target), `.${basename(target)}.tmp-${id}`);
}

function backupPath(target: string, id: string): string {
  return join(dirname(target), `.${basename(target)}.backup-${id}`);
}

async function publish(
  temporary: string,
  target: string,
  overwriteConfirmed: boolean,
  id: string,
): Promise<void> {
  if (!(await exists(target))) {
    await rename(temporary, target);
    return;
  }
  if (!overwriteConfirmed) {
    throw new ReaderError('READER_EXPORT_TARGET_EXISTS', '导出目标已存在，需要再次确认覆盖', 409);
  }
  const backup = backupPath(target, id);
  if (await exists(backup)) throw new Error('ANNOTATED_EXPORT_BACKUP_EXISTS');
  await rename(target, backup);
  try {
    await rename(temporary, target);
  } catch (error) {
    await rename(backup, target);
    throw error;
  }
  await rm(backup, { force: true });
}

function errorCode(error: unknown): string {
  if (error instanceof ReaderError) return error.code;
  if (error instanceof Error && error.message.startsWith('ANNOTATED_EXPORT_')) {
    return error.message;
  }
  return 'READER_EXPORT_FAILED';
}

export class ResearchAnnotatedExportService {
  private readonly writer: AnnotatedPdfWriter;
  private readonly createId: () => string;
  private readonly now: () => Date;
  private active: {
    id: string;
    controller: AbortController;
    shutdownRequested: boolean;
  } | null = null;
  private runPromise: Promise<void> | null = null;
  private reserved = false;

  constructor(
    private readonly repository: AnnotatedExportRepository & AnnotationRepository,
    private readonly contentSource: ReaderContentSource,
    private readonly outputDialog: PdfOutputDialog,
    options: AnnotatedExportServiceOptions = {},
  ) {
    this.writer = options.writer ?? new PdfLibAnnotatedPdfWriter();
    this.createId = options.createId ?? randomUUID;
    this.now = options.now ?? (() => new Date());
  }

  async pickTarget(
    input: PickAnnotatedExportTargetInput,
  ): Promise<PickAnnotatedExportTargetResponse> {
    const parsed = pickAnnotatedExportTargetInputSchema.parse(input);
    const selected = await this.outputDialog.savePdf(parsed);
    const selectedPdf =
      selected && !selected.toLowerCase().endsWith('.pdf') ? `${selected}.pdf` : selected;
    return pickAnnotatedExportTargetResponseSchema.parse({
      path: selectedPdf ? targetPath(selectedPdf) : null,
      cancelled: selected === null,
    });
  }

  async preview(
    assetId: string,
    input: AnnotatedExportPreviewInput,
  ): Promise<AnnotatedExportPreview> {
    const parsed = annotatedExportPreviewInputSchema.parse(input);
    const content = await this.contentSource.resolve(assetId);
    await this.assertSourceHash(content);
    const annotations = await this.annotations(assetId, parsed);
    const inspection = await this.writer.inspect(content.filePath);
    const decisions = planAnnotatedPdfExport(
      annotations,
      inspection.pageCount,
      content.contentHash,
    );
    const target = parsed.targetPath ? targetPath(parsed.targetPath) : null;
    const summary = counts(decisions);
    return annotatedExportPreviewSchema.parse({
      assetId,
      sourceHash: content.contentHash,
      sourceBytes: inspection.sourceBytes,
      estimatedOutputBytes:
        inspection.sourceBytes + summary.standardCount * 512 + summary.flattenedCount * 128,
      pageCount: inspection.pageCount,
      annotationCount: annotations.length,
      ...summary,
      targetPath: target,
      targetExists: target ? await exists(target) : false,
      decisions,
      warnings: [
        '输出是新的完整重写副本；原始 PDF 不会修改',
        ...decisions.flatMap((decision) => (decision.warning ? [decision.warning] : [])),
      ],
    });
  }

  async start(assetId: string, input: StartAnnotatedExportInput): Promise<AnnotatedExportJob> {
    await this.reserve();
    try {
      const parsed = startAnnotatedExportInputSchema.parse(input);
      const content = await this.contentSource.resolve(assetId);
      await this.assertSourceHash(content);
      const target = await this.validateTarget(content, parsed);
      const annotations = await this.annotations(assetId, parsed);
      const id = this.createId();
      const temporary = tempPath(target, id);
      if (await exists(temporary)) {
        throw new ReaderError('READER_EXPORT_BUSY', '同名导出临时文件已存在', 409);
      }
      const record = await this.repository.createAnnotatedExportJob({
        id,
        assetId,
        optionsJson: JSON.stringify({ input: parsed, sourceHash: content.contentHash }),
        targetPath: target,
        tempPath: temporary,
        totalAnnotations: annotations.length,
      });
      this.launch(record);
      return this.view(record);
    } finally {
      this.reserved = false;
    }
  }

  async get(id: string): Promise<AnnotatedExportJob> {
    const record = await this.repository.getAnnotatedExportJob(id);
    if (!record) throw new ReaderError('READER_EXPORT_NOT_FOUND', '导出任务不存在', 404);
    return this.view(record);
  }

  async cancel(id: string): Promise<AnnotatedExportJob> {
    const record = await this.repository.getAnnotatedExportJob(id);
    if (!record) throw new ReaderError('READER_EXPORT_NOT_FOUND', '导出任务不存在', 404);
    if (!['queued', 'running'].includes(record.status)) return this.view(record);
    if (this.active?.id === id) {
      this.active.controller.abort();
      await this.runPromise;
    } else {
      await this.cleanupTemp(record);
      await this.repository.updateAnnotatedExportJob(id, {
        status: 'cancelled',
        errorCode: 'EXPORT_CANCELLED',
        completedAt: this.now().toISOString(),
      });
    }
    return this.get(id);
  }

  async retry(id: string, input: RetryAnnotatedExportInput): Promise<AnnotatedExportJob> {
    await this.reserve();
    try {
      const retry = retryAnnotatedExportInputSchema.parse(input);
      const record = await this.repository.getAnnotatedExportJob(id);
      if (!record) throw new ReaderError('READER_EXPORT_NOT_FOUND', '导出任务不存在', 404);
      if (!['cancelled', 'failed', 'interrupted'].includes(record.status)) {
        throw new ReaderError('READER_EXPORT_BUSY', '当前导出任务不能重试', 409);
      }
      const stored = this.storedOptions(record);
      const content = await this.contentSource.resolve(record.assetId);
      if (content.contentHash !== stored.sourceHash) {
        throw new ReaderError('READER_EXPORT_FAILED', 'Asset 已变化，请重新预览导出', 409);
      }
      const parsed = { ...stored.input, overwriteConfirmed: retry.overwriteConfirmed };
      await this.assertSourceHash(content);
      await this.validateTarget(content, parsed);
      const annotations = await this.annotations(record.assetId, parsed);
      await this.cleanupTemp(record);
      const queued = await this.repository.updateAnnotatedExportJob(id, {
        status: 'queued',
        completedAnnotations: 0,
        totalAnnotations: annotations.length,
        reportJson: null,
        errorCode: null,
        completedAt: null,
        tempPath: tempPath(record.targetPath, id),
        optionsJson: JSON.stringify({ input: parsed, sourceHash: stored.sourceHash }),
      });
      if (!queued) throw new ReaderError('READER_EXPORT_NOT_FOUND', '导出任务不存在', 404);
      this.launch(queued);
      return this.view(queued);
    } finally {
      this.reserved = false;
    }
  }

  async openLocation(id: string): Promise<{ opened: true }> {
    const record = await this.repository.getAnnotatedExportJob(id);
    if (!record) throw new ReaderError('READER_EXPORT_NOT_FOUND', '导出任务不存在', 404);
    if (record.status !== 'completed' || !(await exists(record.targetPath))) {
      throw new ReaderError('READER_EXPORT_FAILED', '导出文件当前不可用', 409);
    }
    if (!(await this.outputDialog.reveal(record.targetPath))) {
      throw new ReaderError('READER_EXPORT_FAILED', '无法打开导出文件位置', 500);
    }
    return { opened: true };
  }

  async recoverInterruptedJobs(): Promise<void> {
    const records = await this.repository.markRecoverableAnnotatedExportJobsInterrupted();
    await Promise.all(records.map((record) => this.cleanupTemp(record)));
  }

  async shutdown(): Promise<void> {
    if (!this.active) return;
    this.active.shutdownRequested = true;
    this.active.controller.abort();
    await this.runPromise;
  }

  private async reserve(): Promise<void> {
    if (this.reserved || this.active) {
      throw new ReaderError('READER_EXPORT_BUSY', '已有带批注副本导出正在运行', 409);
    }
    this.reserved = true;
    try {
      if (await this.repository.getActiveAnnotatedExportJob()) {
        throw new ReaderError('READER_EXPORT_BUSY', '已有带批注副本导出正在运行', 409);
      }
    } catch (error) {
      this.reserved = false;
      throw error;
    }
  }

  private async annotations(
    assetId: string,
    scope: { includeGeneral: boolean; contextIds: string[] },
  ): Promise<Annotation[]> {
    return this.repository.listAnnotations({
      assetId,
      includeGeneral: scope.includeGeneral,
      contextIds: scope.contextIds,
      includeDeleted: false,
    });
  }

  private async assertSourceHash(
    content: ResolvedReaderContent,
    signal?: AbortSignal,
  ): Promise<void> {
    if ((await hashFile(content.filePath, signal)) !== content.contentHash) {
      throw new ReaderError(
        'READER_EXPORT_FAILED',
        'PDF 文件内容已经变化，请先检查或重新定位',
        409,
      );
    }
  }

  private async validateTarget(
    content: ResolvedReaderContent,
    input: StartAnnotatedExportInput,
  ): Promise<string> {
    const requestedTarget = resolve(input.targetPath);
    if (await exists(requestedTarget)) {
      const [sourceIdentity, targetIdentity] = await Promise.all([
        stat(content.filePath),
        stat(requestedTarget),
      ]);
      if (sourceIdentity.dev === targetIdentity.dev && sourceIdentity.ino === targetIdentity.ino) {
        throw new ReaderError('READER_EXPORT_FAILED', '带批注副本不能覆盖原始 PDF', 409);
      }
    }
    const target = targetPath(input.targetPath);
    let parent;
    try {
      parent = await stat(dirname(target));
    } catch {
      throw new ReaderError('READER_EXPORT_FAILED', '导出目录不存在', 400);
    }
    if (!parent.isDirectory()) {
      throw new ReaderError('READER_EXPORT_FAILED', '导出目标的父路径不是目录', 400);
    }
    if ((await exists(target)) && !input.overwriteConfirmed) {
      throw new ReaderError('READER_EXPORT_TARGET_EXISTS', '导出目标已存在，需要再次确认覆盖', 409);
    }
    return target;
  }

  private launch(record: AnnotatedExportJobRecord, input?: StartAnnotatedExportInput): void {
    const controller = new AbortController();
    this.active = { id: record.id, controller, shutdownRequested: false };
    this.runPromise = this.run(record, input ?? this.storedOptions(record).input, controller.signal)
      .catch(() => undefined)
      .finally(() => {
        this.active = null;
        this.runPromise = null;
      });
  }

  private async run(
    record: AnnotatedExportJobRecord,
    input: StartAnnotatedExportInput,
    signal: AbortSignal,
  ): Promise<void> {
    const temporary = record.tempPath ?? tempPath(record.targetPath, record.id);
    try {
      const stored = this.storedOptions(record);
      const content = await this.contentSource.resolve(record.assetId);
      await this.repository.updateAnnotatedExportJob(record.id, {
        status: 'running',
        tempPath: temporary,
        errorCode: null,
      });
      const annotations = await this.annotations(record.assetId, input);
      const result = await this.writer.write({
        sourcePath: content.filePath,
        targetPath: temporary,
        sourceHash: stored.sourceHash,
        annotations,
        signal,
        onProgress: async (completed, total) => {
          await this.repository.updateAnnotatedExportJob(record.id, {
            completedAnnotations: completed,
            totalAnnotations: total,
          });
        },
      });
      await this.assertSourceHash(content, signal);
      throwIfAborted(signal);
      await publish(temporary, record.targetPath, input.overwriteConfirmed, record.id);
      const summary = counts(result.decisions);
      const completedAt = this.now().toISOString();
      const report = annotatedExportReportSchema.parse({
        schemaVersion: 1,
        assetId: record.assetId,
        sourceHash: stored.sourceHash,
        outputHash: result.outputHash,
        sourceBytes: result.sourceBytes,
        outputBytes: result.outputBytes,
        pageCount: result.pageCount,
        targetPath: record.targetPath,
        ...summary,
        sourceHashUnchanged: true,
        outputReadable: result.outputReadable,
        fullRewrite: result.fullRewrite,
        decisions: result.decisions,
        warnings: result.warnings,
        completedAt,
      });
      await this.repository.updateAnnotatedExportJob(record.id, {
        status: 'completed',
        tempPath: null,
        completedAnnotations: annotations.length,
        totalAnnotations: annotations.length,
        reportJson: JSON.stringify(report),
        errorCode: null,
        completedAt,
      });
    } catch (error) {
      const cancelled = signal.aborted;
      const interrupted =
        cancelled && this.active?.id === record.id && this.active.shutdownRequested;
      await this.repository.updateAnnotatedExportJob(record.id, {
        status: interrupted ? 'interrupted' : cancelled ? 'cancelled' : 'failed',
        errorCode: interrupted
          ? 'SERVER_STOPPED'
          : cancelled
            ? 'EXPORT_CANCELLED'
            : errorCode(error),
        completedAt: interrupted ? null : this.now().toISOString(),
      });
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  private storedOptions(record: AnnotatedExportJobRecord): StoredOptions {
    const stored = JSON.parse(record.optionsJson) as StoredOptions;
    return {
      input: startAnnotatedExportInputSchema.parse(stored.input),
      sourceHash: stored.sourceHash,
    };
  }

  private view(
    record: AnnotatedExportJobRecord,
    overrideInput?: StartAnnotatedExportInput,
  ): AnnotatedExportJob {
    const stored = this.storedOptions(record);
    return annotatedExportJobSchema.parse({
      id: record.id,
      assetId: record.assetId,
      status: record.status,
      options: overrideInput ?? stored.input,
      targetPath: record.targetPath,
      completedAnnotations: record.completedAnnotations,
      totalAnnotations: record.totalAnnotations,
      report: record.reportJson ? JSON.parse(record.reportJson) : null,
      errorCode: record.errorCode,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      completedAt: record.completedAt,
    });
  }

  private async cleanupTemp(record: AnnotatedExportJobRecord): Promise<void> {
    if (!record.tempPath) return;
    const expected = tempPath(record.targetPath, record.id);
    if (resolve(record.tempPath) !== resolve(expected)) return;
    await rm(expected, { force: true }).catch(() => undefined);
  }
}
