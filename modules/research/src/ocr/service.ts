import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ocrJobSchema, startOcrInputSchema, type OcrJob, type StartOcrInput } from '../contract.js';
import type { ReaderContentSource } from '../reader/content-source.js';
import { ReaderError } from '../reader/errors.js';
import { OcrEngineError, TesseractOcrEngine, type OcrEngine } from './engine.js';
import {
  OCR_LANGUAGE_CACHE_DIRECTORY,
  OCR_LANGUAGE_PACK_VERSION,
  TESSERACT_ENGINE,
  TESSERACT_ENGINE_VERSION,
} from './language-packs.js';
import type { OcrJobRecord, OcrRepository } from './repository.js';

type StopStatus = 'paused' | 'cancelled' | 'interrupted';

export interface OcrServiceOptions {
  engine?: OcrEngine;
  engineName?: string;
  engineVersion?: string;
  languagePackVersion?: string;
  cacheRoot: () => string;
  createId?: () => string;
  yieldMs?: number;
  beforeRun?: (assetId: string) => Promise<void> | void;
  afterRun?: (assetId: string) => Promise<void> | void;
}

export class ResearchOcrService {
  private readonly engine: OcrEngine;
  private readonly engineName: string;
  private readonly engineVersion: string;
  private readonly languagePackVersion: string;
  private readonly createId: () => string;
  private readonly yieldMs: number;
  private active: { jobId: string; assetId: string; controller: AbortController } | null = null;
  private runPromise: Promise<void> | null = null;
  private reserved = false;
  private readonly stopStatuses = new Map<string, StopStatus>();

  constructor(
    private readonly repository: OcrRepository,
    private readonly contentSource: ReaderContentSource,
    private readonly options: OcrServiceOptions,
  ) {
    this.engine = options.engine ?? new TesseractOcrEngine();
    this.engineName = options.engineName ?? TESSERACT_ENGINE;
    this.engineVersion = options.engineVersion ?? TESSERACT_ENGINE_VERSION;
    this.languagePackVersion = options.languagePackVersion ?? OCR_LANGUAGE_PACK_VERSION;
    this.createId = options.createId ?? randomUUID;
    this.yieldMs = options.yieldMs ?? 8;
  }

  async get(assetId: string): Promise<OcrJob | null> {
    const job = await this.repository.getLatestOcrJob(assetId);
    return job ? this.view(job) : null;
  }

  async start(assetId: string, input: StartOcrInput): Promise<OcrJob> {
    return this.create(assetId, startOcrInputSchema.parse(input), true);
  }

  async rebuild(assetId: string, input: StartOcrInput): Promise<OcrJob> {
    const latest = await this.repository.getLatestOcrJob(assetId);
    if (latest && ['queued', 'running'].includes(latest.status)) {
      await this.stop(assetId, 'cancelled');
    }
    return this.create(assetId, startOcrInputSchema.parse(input), false);
  }

  async resume(assetId: string): Promise<OcrJob> {
    await this.assertAvailable();
    const job = await this.repository.getLatestOcrJob(assetId);
    if (!job) {
      throw new ReaderError('READER_OCR_NOT_FOUND', '这份 PDF 还没有 OCR 任务', 404);
    }
    if (job.status === 'completed') return this.view(job);
    const queued = await this.repository.setOcrJobStatus(job.id, 'queued');
    if (!queued) throw new ReaderError('READER_OCR_NOT_FOUND', 'OCR 任务不存在', 404);
    this.launch(queued, true);
    return this.view(queued);
  }

  async pause(assetId: string): Promise<OcrJob> {
    return this.stopOrThrow(assetId, 'paused');
  }

  async cancel(assetId: string): Promise<OcrJob> {
    return this.stopOrThrow(assetId, 'cancelled');
  }

  async recoverInterruptedJobs(): Promise<void> {
    const jobIds = await this.repository.markRecoverableOcrJobsInterrupted();
    const [first, ...extra] = jobIds;
    for (const jobId of extra) {
      await this.repository.setOcrJobStatus(jobId, 'failed', 'OCR_CONCURRENT_RECOVERY');
    }
    if (first) {
      const job = await this.repository.getOcrJob(first);
      if (job) this.launch(job, true);
    }
  }

  async shutdown(): Promise<void> {
    if (!this.active) return;
    const { jobId, controller } = this.active;
    this.stopStatuses.set(jobId, 'interrupted');
    await this.repository.setOcrJobStatus(jobId, 'interrupted', 'SERVER_STOPPED');
    controller.abort();
    await this.runPromise;
  }

  private async create(assetId: string, input: StartOcrInput, useCache: boolean): Promise<OcrJob> {
    await this.assertAvailable();
    this.reserved = true;
    try {
      const content = await this.contentSource.resolve(assetId);
      const job = await this.repository.createOcrJob({
        id: this.createId(),
        assetId,
        assetHash: content.contentHash,
        languages: input.languages,
        engine: this.engineName,
        engineVersion: this.engineVersion,
        languagePackVersion: this.languagePackVersion,
      });
      this.launch(job, useCache);
      return this.view(job);
    } finally {
      this.reserved = false;
    }
  }

  private async assertAvailable(): Promise<void> {
    if (this.reserved || this.active || (await this.repository.getActiveOcrJob())) {
      throw new ReaderError('READER_OCR_BUSY', '已有 OCR 任务正在运行，请先等待或停止它', 409);
    }
  }

  private async stopOrThrow(assetId: string, status: StopStatus): Promise<OcrJob> {
    const job = await this.repository.getLatestOcrJob(assetId);
    if (!job) throw new ReaderError('READER_OCR_NOT_FOUND', '这份 PDF 还没有 OCR 任务', 404);
    await this.stop(assetId, status);
    const stopped = await this.repository.getOcrJob(job.id);
    if (!stopped) throw new ReaderError('READER_OCR_NOT_FOUND', 'OCR 任务不存在', 404);
    return this.view(stopped);
  }

  private async stop(assetId: string, status: StopStatus): Promise<void> {
    if (this.active?.assetId === assetId) {
      this.stopStatuses.set(this.active.jobId, status);
      this.active.controller.abort();
      await this.runPromise;
      return;
    }
    const job = await this.repository.getLatestOcrJob(assetId);
    if (job) {
      await this.repository.setOcrJobStatus(
        job.id,
        status,
        status === 'interrupted' ? 'SERVER_STOPPED' : null,
      );
    }
  }

  private launch(job: OcrJobRecord, useCache: boolean): void {
    const controller = new AbortController();
    this.active = { jobId: job.id, assetId: job.assetId, controller };
    this.runPromise = this.run(job.id, useCache, controller.signal).finally(() => {
      this.active = null;
      this.stopStatuses.delete(job.id);
      this.runPromise = null;
    });
  }

  private async run(jobId: string, useCache: boolean, signal: AbortSignal): Promise<void> {
    const queued = await this.repository.getOcrJob(jobId);
    if (!queued) return;
    let backgroundReserved = false;
    try {
      const running = await this.repository.setOcrJobStatus(jobId, 'running');
      if (!running) return;
      await this.options.beforeRun?.(running.assetId);
      backgroundReserved = true;
      if (useCache) {
        const cached = await this.repository.completeOcrJobFromCache(jobId);
        if (cached?.status === 'completed') return;
      }
      const content = await this.contentSource.resolve(running.assetId);
      if (content.contentHash !== running.assetHash) {
        await this.repository.setOcrJobStatus(jobId, 'failed', 'OCR_ASSET_CHANGED');
        return;
      }
      const cachePath = join(this.options.cacheRoot(), OCR_LANGUAGE_CACHE_DIRECTORY);
      await mkdir(cachePath, { recursive: true });
      await this.engine.recognize({
        filePath: content.filePath,
        cachePath,
        startPage: running.nextPage,
        languages: running.languages,
        signal,
        onMetadata: async (totalPages) => {
          await this.repository.setOcrTotalPages(jobId, totalPages);
        },
        onPage: async (page, totalPages) => {
          await this.repository.commitOcrPage({
            jobId,
            pageNumber: page.pageNumber,
            totalPages,
            textContent: page.text,
            pageSize: page.pageSize,
            positions: page.positions,
          });
          if (this.yieldMs > 0) await new Promise((resolve) => setTimeout(resolve, this.yieldMs));
        },
      });
      await this.repository.setOcrJobStatus(jobId, 'completed');
    } catch (error) {
      if (signal.aborted || (error instanceof OcrEngineError && error.code === 'OCR_ABORTED')) {
        const status = this.stopStatuses.get(jobId) ?? 'interrupted';
        await this.repository.setOcrJobStatus(
          jobId,
          status,
          status === 'interrupted' ? 'PROCESS_INTERRUPTED' : null,
        );
        return;
      }
      await this.repository.setOcrJobStatus(
        jobId,
        'failed',
        error instanceof OcrEngineError ? error.code : 'OCR_UNKNOWN',
      );
    } finally {
      if (backgroundReserved) await this.options.afterRun?.(queued.assetId);
    }
  }

  private view(record: OcrJobRecord): OcrJob {
    return ocrJobSchema.parse({
      ...record,
      processedPages: Math.min(record.totalPages, Math.max(0, record.nextPage - 1)),
    });
  }
}
