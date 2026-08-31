import type { DerivedJobStatus, OcrLanguage, PageTextPosition } from '../contract.js';

export interface OcrJobRecord {
  id: string;
  assetId: string;
  assetHash: string;
  status: DerivedJobStatus;
  languages: OcrLanguage[];
  engine: string;
  engineVersion: string;
  languagePackVersion: string;
  nextPage: number;
  totalPages: number;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface OcrJobDraft {
  id: string;
  assetId: string;
  assetHash: string;
  languages: OcrLanguage[];
  engine: string;
  engineVersion: string;
  languagePackVersion: string;
}

export interface OcrPageDraft {
  jobId: string;
  pageNumber: number;
  totalPages: number;
  textContent: string;
  pageSize: { width: number; height: number };
  positions: PageTextPosition[];
}

export interface OcrRepository {
  getLatestOcrJob(assetId: string): Promise<OcrJobRecord | null>;
  getOcrJob(jobId: string): Promise<OcrJobRecord | null>;
  getActiveOcrJob(): Promise<OcrJobRecord | null>;
  createOcrJob(draft: OcrJobDraft): Promise<OcrJobRecord>;
  setOcrJobStatus(
    jobId: string,
    status: DerivedJobStatus,
    errorCode?: string | null,
  ): Promise<OcrJobRecord | null>;
  setOcrTotalPages(jobId: string, totalPages: number): Promise<OcrJobRecord | null>;
  commitOcrPage(draft: OcrPageDraft): Promise<OcrJobRecord | null>;
  completeOcrJobFromCache(jobId: string): Promise<OcrJobRecord | null>;
  markRecoverableOcrJobsInterrupted(): Promise<string[]>;
}
