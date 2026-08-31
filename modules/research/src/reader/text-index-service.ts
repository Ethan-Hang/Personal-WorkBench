import {
  pageTextSearchQuerySchema,
  pageTextSearchResultSchema,
  textIndexJobSchema,
  type PageTextSearchQuery,
  type PageTextSearchResult,
  type StartTextIndexInput,
  type TextIndexJob,
} from '../contract.js';
import type { ReaderContentSource } from './content-source.js';
import { ReaderError } from './errors.js';
import type { TextIndexJobRecord, TextIndexRepository } from './text-index-repository.js';
import {
  PdfJsPageTextExtractor,
  TEXT_INDEX_PARSER_VERSION,
  TextIndexExtractionError,
  type PageTextExtractor,
} from './text-index.js';

interface QueuedExtraction {
  assetId: string;
  assetHash: string;
  filePath: string;
  priorityPage: number | null;
}

type StopStatus = 'paused' | 'cancelled' | 'interrupted';

export interface TextIndexServiceOptions {
  extractor?: PageTextExtractor;
  parserVersion?: string;
  yieldMs?: number;
}

export class ResearchTextIndexService {
  private readonly extractor: PageTextExtractor;
  private readonly parserVersion: string;
  private readonly yieldMs: number;
  private readonly queue: QueuedExtraction[] = [];
  private readonly stopStatuses = new Map<string, StopStatus>();
  private active: { assetId: string; controller: AbortController } | null = null;
  private pumpPromise: Promise<void> | null = null;

  constructor(
    private readonly repository: TextIndexRepository,
    private readonly contentSource: ReaderContentSource,
    options: TextIndexServiceOptions = {},
  ) {
    this.extractor = options.extractor ?? new PdfJsPageTextExtractor();
    this.parserVersion = options.parserVersion ?? TEXT_INDEX_PARSER_VERSION;
    this.yieldMs = options.yieldMs ?? 8;
  }

  async recoverInterruptedJobs(): Promise<void> {
    const assetIds = await this.repository.markRunningTextIndexJobsInterrupted();
    for (const assetId of assetIds) {
      try {
        await this.start(assetId, { priorityPage: null });
      } catch {
        await this.repository.setTextIndexJobStatus(assetId, 'failed', 'RECOVERY_FAILED');
      }
    }
  }

  async shutdown(): Promise<void> {
    for (const queued of this.queue.splice(0)) {
      await this.repository.setTextIndexJobStatus(queued.assetId, 'interrupted', 'SERVER_STOPPED');
    }
    if (this.active) {
      this.stopStatuses.set(this.active.assetId, 'interrupted');
      await this.repository.setTextIndexJobStatus(
        this.active.assetId,
        'interrupted',
        'SERVER_STOPPED',
      );
      this.active.controller.abort();
    }
    await this.pumpPromise;
  }

  async get(assetId: string): Promise<TextIndexJob | null> {
    const record = await this.repository.getTextIndexJob(assetId);
    return record ? this.view(record) : null;
  }

  async start(assetId: string, input: StartTextIndexInput): Promise<TextIndexJob> {
    return this.prepare(assetId, input.priorityPage, false);
  }

  async rebuild(assetId: string, input: StartTextIndexInput): Promise<TextIndexJob> {
    await this.stop(assetId, 'cancelled');
    return this.prepare(assetId, input.priorityPage, true);
  }

  async resume(assetId: string, input: StartTextIndexInput): Promise<TextIndexJob> {
    const existing = await this.repository.getTextIndexJob(assetId);
    if (!existing) {
      throw new ReaderError('READER_INDEX_NOT_FOUND', '这份 PDF 还没有正文索引任务', 404);
    }
    return this.prepare(assetId, input.priorityPage, false);
  }

  async pause(assetId: string): Promise<TextIndexJob> {
    return this.stopOrThrow(assetId, 'paused');
  }

  async cancel(assetId: string): Promise<TextIndexJob> {
    return this.stopOrThrow(assetId, 'cancelled');
  }

  async search(input: PageTextSearchQuery): Promise<PageTextSearchResult[]> {
    const query = pageTextSearchQuerySchema.parse(input);
    return (await this.repository.searchPageText(query)).map((result) =>
      pageTextSearchResultSchema.parse(result),
    );
  }

  private async prepare(
    assetId: string,
    priorityPage: number | null,
    rebuild: boolean,
  ): Promise<TextIndexJob> {
    const content = await this.contentSource.resolve(assetId);
    let job = await this.repository.getTextIndexJob(assetId);
    const invalidated =
      job !== null &&
      (job.assetHash !== content.contentHash || job.parserVersion !== this.parserVersion);
    if (!job || invalidated || rebuild) {
      job = await this.repository.resetTextIndexJob({
        assetId,
        assetHash: content.contentHash,
        parserVersion: this.parserVersion,
      });
    } else if (job.status === 'completed' || job.status === 'running') {
      return this.view(job);
    } else if (job.errorCode === 'OCR_RECOMMENDED') {
      return this.view(job);
    } else {
      job = (await this.repository.queueTextIndexJob(assetId)) ?? job;
    }
    const queued = {
      assetId,
      assetHash: content.contentHash,
      filePath: content.filePath,
      priorityPage,
    };
    const previous = this.queue.findIndex((candidate) => candidate.assetId === assetId);
    if (previous >= 0) this.queue[previous] = queued;
    else if (this.active?.assetId !== assetId) this.queue.push(queued);
    this.startPump();
    return this.view(job);
  }

  private async stopOrThrow(assetId: string, status: StopStatus): Promise<TextIndexJob> {
    const job = await this.repository.getTextIndexJob(assetId);
    if (!job) {
      throw new ReaderError('READER_INDEX_NOT_FOUND', '这份 PDF 还没有正文索引任务', 404);
    }
    await this.stop(assetId, status);
    const stopped = await this.repository.getTextIndexJob(assetId);
    if (!stopped) {
      throw new ReaderError('READER_INDEX_NOT_FOUND', '正文索引任务不存在', 404);
    }
    return this.view(stopped);
  }

  private async stop(assetId: string, status: StopStatus): Promise<void> {
    const queued = this.queue.findIndex((candidate) => candidate.assetId === assetId);
    if (queued >= 0) this.queue.splice(queued, 1);
    if (this.active?.assetId === assetId) {
      this.stopStatuses.set(assetId, status);
      this.active.controller.abort();
      while (this.active?.assetId === assetId) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    await this.repository.setTextIndexJobStatus(
      assetId,
      status,
      status === 'interrupted' ? 'SERVER_STOPPED' : null,
    );
  }

  private startPump(): void {
    if (this.pumpPromise) return;
    this.pumpPromise = this.pump().finally(() => {
      this.pumpPromise = null;
      if (this.queue.length > 0) this.startPump();
    });
  }

  private async pump(): Promise<void> {
    while (this.queue.length > 0) {
      const queued = this.queue.shift();
      if (!queued) return;
      const controller = new AbortController();
      this.active = { assetId: queued.assetId, controller };
      try {
        await this.run(queued, controller.signal);
      } finally {
        this.active = null;
        this.stopStatuses.delete(queued.assetId);
      }
    }
  }

  private async run(queued: QueuedExtraction, signal: AbortSignal): Promise<void> {
    const started = await this.repository.setTextIndexJobStatus(queued.assetId, 'running');
    if (!started) return;
    try {
      await this.extractor.extract({
        filePath: queued.filePath,
        startPage: started.nextPage,
        priorityPage: queued.priorityPage,
        signal,
        onMetadata: async (totalPages) => {
          await this.repository.setTextIndexTotalPages(queued.assetId, totalPages);
        },
        onPage: async (page, totalPages) => {
          await this.repository.commitPageText({
            assetId: queued.assetId,
            pageNumber: page.pageNumber,
            totalPages,
            source: 'pdf',
            contentHash: queued.assetHash,
            textContent: page.text,
            pageSize: page.pageSize,
            positions: page.positions,
            generator: 'pdfjs',
            generatorVersion: this.parserVersion,
          });
          if (this.yieldMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, this.yieldMs));
          }
        },
      });
      const job = await this.repository.getTextIndexJob(queued.assetId);
      const stats = await this.repository.getTextIndexStats(queued.assetId);
      const totalPages = job?.totalPages ?? 0;
      const sparse =
        stats.nonEmptyPages === 0 ||
        stats.textCharacters < Math.max(32, totalPages * 8) ||
        (totalPages >= 5 && stats.nonEmptyPages / totalPages < 0.2);
      if (sparse) {
        await this.repository.setTextIndexJobStatus(queued.assetId, 'paused', 'OCR_RECOMMENDED');
      } else {
        await this.repository.setTextIndexJobStatus(queued.assetId, 'completed');
      }
    } catch (error) {
      if (
        signal.aborted ||
        (error instanceof TextIndexExtractionError && error.code === 'TEXT_INDEX_ABORTED')
      ) {
        const status = this.stopStatuses.get(queued.assetId) ?? 'interrupted';
        await this.repository.setTextIndexJobStatus(
          queued.assetId,
          status,
          status === 'interrupted' ? 'PROCESS_INTERRUPTED' : null,
        );
        return;
      }
      await this.repository.setTextIndexJobStatus(
        queued.assetId,
        'failed',
        error instanceof TextIndexExtractionError ? error.code : 'TEXT_INDEX_UNKNOWN',
      );
    }
  }

  private async view(record: TextIndexJobRecord): Promise<TextIndexJob> {
    const stats = await this.repository.getTextIndexStats(record.assetId);
    return textIndexJobSchema.parse({
      ...record,
      status: record.errorCode === 'OCR_RECOMMENDED' ? 'ocr-recommended' : record.status,
      indexedPages: stats.indexedPages,
      textCharacters: stats.textCharacters,
    });
  }
}
