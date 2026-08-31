import type {
  DerivedJobStatus,
  PageTextPosition,
  PageTextSearchQuery,
  PageTextSearchResult,
} from '../contract.js';

export interface TextIndexJobRecord {
  assetId: string;
  status: DerivedJobStatus;
  nextPage: number;
  totalPages: number;
  assetHash: string;
  parserVersion: string;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface TextIndexJobDraft {
  assetId: string;
  assetHash: string;
  parserVersion: string;
}

export interface PageTextDraft {
  assetId: string;
  pageNumber: number;
  totalPages: number;
  source: 'pdf' | 'ocr';
  contentHash: string;
  textContent: string;
  pageSize: { width: number; height: number };
  positions: PageTextPosition[];
  generator: string;
  generatorVersion: string;
}

export interface TextIndexStats {
  indexedPages: number;
  textCharacters: number;
  nonEmptyPages: number;
}

export interface TextIndexRepository {
  getTextIndexJob(assetId: string): Promise<TextIndexJobRecord | null>;
  resetTextIndexJob(draft: TextIndexJobDraft): Promise<TextIndexJobRecord>;
  queueTextIndexJob(assetId: string): Promise<TextIndexJobRecord | null>;
  setTextIndexJobStatus(
    assetId: string,
    status: DerivedJobStatus,
    errorCode?: string | null,
  ): Promise<TextIndexJobRecord | null>;
  setTextIndexTotalPages(assetId: string, totalPages: number): Promise<TextIndexJobRecord | null>;
  commitPageText(draft: PageTextDraft): Promise<TextIndexJobRecord | null>;
  getTextIndexStats(assetId: string): Promise<TextIndexStats>;
  clearPageText(assetId: string): Promise<void>;
  markRunningTextIndexJobsInterrupted(): Promise<string[]>;
  searchPageText(query: PageTextSearchQuery): Promise<PageTextSearchResult[]>;
}
