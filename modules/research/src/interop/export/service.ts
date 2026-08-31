import { randomUUID } from 'node:crypto';
import { extname, resolve } from 'node:path';
import type {
  InteropExportJobView,
  InteropExportPreview,
  InteropFormat,
  PreviewInteropExportInput,
  StartInteropExportInput,
} from '../../contract.js';
import type { InteropOutputDialog } from '../../server/file-picker.js';
import { InteropServiceError } from '../records/service.js';
import { InteropRepositoryConflictError, type InteropRepository } from '../records/repository.js';
import { parseBibtexRecords } from '../records/bibtex-parser.js';
import { parseCslJsonRecords } from '../records/csl-json-parser.js';
import { parseRisRecords } from '../records/ris-parser.js';
import { writeSafeTextOutput } from '../safe-text-output.js';
import { generateCitationKeys, writeInteropRecords } from './model.js';
import type { InteropExportJobRecord } from './repository.js';

function extension(format: InteropFormat): string {
  return format === 'bibtex' ? '.bib' : format === 'ris' ? '.ris' : '.json';
}

function recordCount(format: InteropFormat, content: string): number {
  if (format === 'bibtex') return parseBibtexRecords(content).length;
  if (format === 'ris') return parseRisRecords(content).length;
  return parseCslJsonRecords(content).length;
}

function targetKey(workId: string, editionId: string | null): string {
  return `${workId}:${editionId ?? ''}`;
}

function toView(job: InteropExportJobRecord): InteropExportJobView {
  return {
    id: job.id,
    status: job.status,
    format: job.format,
    scope: job.scope,
    editionPolicy: job.editionPolicy,
    frozenEntities: job.frozenEntities,
    previewToken: job.previewToken,
    targetPath: job.targetPath,
    losses: job.losses,
    result: job.result,
    errorCode: job.errorCode,
    revision: job.revision,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
  };
}

export class ResearchInteropExportService {
  private readonly selectedTargets = new Set<string>();
  private readonly controllers = new Map<string, AbortController>();

  constructor(
    private readonly repository: InteropRepository,
    private readonly outputDialog: InteropOutputDialog,
    private readonly createId: () => string = randomUUID,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  preview(input: PreviewInteropExportInput): InteropExportPreview {
    const records = this.repository.projectExportRecords(input.scope, input.editionPolicy);
    const preferences = new Map<string, string>();
    const savedPreferences = new Map(
      this.repository
        .listCitationKeyPreferences(records.map((record) => record.work.id))
        .map((preference) => [targetKey(preference.workId, preference.editionId), preference]),
    );
    for (const preference of savedPreferences.values()) {
      preferences.set(targetKey(preference.workId, preference.editionId), preference.preferredKey);
    }
    for (const [target, key] of Object.entries(input.keyOverrides)) preferences.set(target, key);
    let keys: Map<string, string>;
    try {
      keys = generateCitationKeys(records, preferences);
    } catch (error) {
      throw new InteropServiceError(
        'RESEARCH_INTEROP_INVALID_RECORD',
        error instanceof Error ? error.message : String(error),
        400,
      );
    }
    const projected = records.map((record) => ({
      ...record,
      citationKey: keys.get(targetKey(record.work.id, record.edition?.id ?? null))!,
    }));
    const rendered = writeInteropRecords(input.format, projected);
    const frozenEntities = projected.map((record) => {
      const key = targetKey(record.work.id, record.edition?.id ?? null);
      const saved = savedPreferences.get(key);
      return {
        workId: record.work.id,
        workRevision: record.work.revision,
        editionId: record.edition?.id ?? null,
        editionRevision: record.edition?.revision ?? null,
        citationKey: record.citationKey,
        citationKeySource: saved
          ? ('user' as const)
          : record.source?.format === 'bibtex' && record.source.sourceKey === record.citationKey
            ? ('imported' as const)
            : ('generated' as const),
        citationKeyRevision: saved?.revision ?? 0,
      };
    });
    const job = this.repository.createOrGetExportPreview({
      id: this.createId(),
      requestId: input.requestId,
      format: input.format,
      scope: input.scope,
      editionPolicy: input.editionPolicy,
      frozenEntities,
      previewToken: this.createId(),
      losses: rendered.losses,
    });
    return {
      jobId: job.id,
      previewToken: job.previewToken!,
      format: job.format,
      scope: job.scope,
      editionPolicy: job.editionPolicy,
      frozenEntities: job.frozenEntities,
      workCount: new Set(job.frozenEntities.map((entity) => entity.workId)).size,
      recordCount: job.frozenEntities.length,
      issueCount: job.losses.length,
      losses: job.losses,
      revision: job.revision,
    };
  }

  get(id: string): InteropExportJobView {
    const job = this.repository.getExport(id);
    if (!job)
      throw new InteropServiceError('RESEARCH_INTEROP_INVALID_RECORD', '导出任务不存在', 404);
    return toView(job);
  }

  async pickTarget(format: InteropFormat) {
    const path = await this.outputDialog.saveInterop({
      format,
      suggestedName: `research-export${extension(format)}`,
    });
    if (!path) return { path: null, cancelled: true };
    const absolute = resolve(path);
    if (extname(absolute).toLocaleLowerCase() !== extension(format)) {
      throw new InteropServiceError(
        'RESEARCH_INTEROP_UNSUPPORTED_FORMAT',
        `导出目标必须使用 ${extension(format)} 扩展名`,
        400,
      );
    }
    this.selectedTargets.add(absolute);
    return { path: absolute, cancelled: false };
  }

  start(id: string, input: StartInteropExportInput): InteropExportJobView {
    const job = this.repository.getExport(id);
    if (!job)
      throw new InteropServiceError('RESEARCH_INTEROP_INVALID_RECORD', '导出任务不存在', 404);
    const targetPath = resolve(input.targetPath);
    if (!this.selectedTargets.has(targetPath)) {
      throw new InteropServiceError(
        'RESEARCH_INTEROP_JOB_STATE_CONFLICT',
        '请先通过文件选择器选择导出目标',
      );
    }
    if (
      job.status !== 'previewed' ||
      job.previewToken !== input.previewToken ||
      job.revision !== input.expectedRevision
    ) {
      throw new InteropServiceError('RESEARCH_INTEROP_REVISION_CONFLICT', '导出预览已经变化');
    }
    if (!this.repository.frozenEntitiesCurrent(job.frozenEntities)) {
      throw new InteropServiceError(
        'RESEARCH_INTEROP_REVISION_CONFLICT',
        '预览后的文献字段已经变化，请重新预览',
      );
    }
    if (extname(targetPath).toLocaleLowerCase() !== extension(job.format)) {
      throw new InteropServiceError('RESEARCH_INTEROP_UNSUPPORTED_FORMAT', '导出扩展名不匹配', 400);
    }
    const running = this.repository.updateExport(job.id, job.revision, {
      status: 'running',
      targetPath,
      errorCode: null,
    });
    const controller = new AbortController();
    this.controllers.set(job.id, controller);
    void this.execute(running, input.overwriteConfirmed, controller);
    return toView(running);
  }

  cancel(id: string): InteropExportJobView {
    const job = this.repository.getExport(id);
    if (!job)
      throw new InteropServiceError('RESEARCH_INTEROP_INVALID_RECORD', '导出任务不存在', 404);
    if (['completed', 'cancelled', 'failed'].includes(job.status)) return toView(job);
    this.controllers.get(id)?.abort();
    const cancelled = this.repository.updateExport(id, job.revision, {
      status: 'cancelled',
      completedAt: this.clock().toISOString(),
    });
    return toView(cancelled);
  }

  saveCitationKey(input: {
    workId: string;
    editionId: string | null;
    preferredKey: string;
    expectedRevision: number;
  }) {
    try {
      return this.repository.saveCitationKeyPreference({ id: this.createId(), ...input });
    } catch (error) {
      if (error instanceof InteropRepositoryConflictError) {
        throw new InteropServiceError('RESEARCH_INTEROP_REVISION_CONFLICT', 'citation key 已变化');
      }
      throw error;
    }
  }

  shutdown(): void {
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
  }

  private async execute(
    job: InteropExportJobRecord,
    overwriteConfirmed: boolean,
    controller: AbortController,
  ): Promise<void> {
    try {
      if (!this.repository.frozenEntitiesCurrent(job.frozenEntities)) {
        throw new Error('预览后的文献字段已经变化');
      }
      const keyByTarget = new Map(
        job.frozenEntities.map((entity) => [
          targetKey(entity.workId, entity.editionId),
          entity.citationKey,
        ]),
      );
      const records = this.repository
        .projectExportRecords(job.scope, job.editionPolicy)
        .map((record) => ({
          ...record,
          citationKey: keyByTarget.get(targetKey(record.work.id, record.edition?.id ?? null))!,
        }));
      if (
        records.some((record) => !record.citationKey) ||
        records.length !== job.frozenEntities.length
      ) {
        throw new Error('冻结导出清单与当前投影不一致');
      }
      const rendered = writeInteropRecords(job.format, records);
      const output = await writeSafeTextOutput({
        targetPath: job.targetPath!,
        content: rendered.content,
        overwriteConfirmed,
        signal: controller.signal,
        cancelMessage: '文献记录导出已取消',
        validate: (content) => {
          if (recordCount(job.format, content) !== records.length) {
            throw new Error('导出文件重新解析后的记录数不一致');
          }
        },
      });
      const current = this.repository.getExport(job.id);
      if (!current || current.status !== 'running') return;
      this.repository.updateExport(job.id, current.revision, {
        status: 'completed',
        losses: rendered.losses,
        result: { ...output, recordCount: records.length },
        completedAt: this.clock().toISOString(),
      });
    } catch (error) {
      const current = this.repository.getExport(job.id);
      if (!current || current.status !== 'running') return;
      const cancelled = error instanceof DOMException && error.name === 'AbortError';
      this.repository.updateExport(job.id, current.revision, {
        status: cancelled ? 'cancelled' : 'failed',
        errorCode: cancelled ? null : error instanceof Error ? error.message : String(error),
        completedAt: this.clock().toISOString(),
      });
    } finally {
      this.controllers.delete(job.id);
    }
  }
}
