import type { DerivedJobStatus } from '../contract.js';

export interface AnnotatedExportJobRecord {
  id: string;
  assetId: string;
  status: DerivedJobStatus;
  optionsJson: string;
  targetPath: string;
  tempPath: string | null;
  completedAnnotations: number;
  totalAnnotations: number;
  reportJson: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface AnnotatedExportJobDraft {
  id: string;
  assetId: string;
  optionsJson: string;
  targetPath: string;
  tempPath: string;
  totalAnnotations: number;
}

export interface AnnotatedExportJobChanges {
  status?: DerivedJobStatus;
  optionsJson?: string;
  tempPath?: string | null;
  completedAnnotations?: number;
  totalAnnotations?: number;
  reportJson?: string | null;
  errorCode?: string | null;
  completedAt?: string | null;
}

export interface AnnotatedExportRepository {
  createAnnotatedExportJob(draft: AnnotatedExportJobDraft): Promise<AnnotatedExportJobRecord>;
  getAnnotatedExportJob(id: string): Promise<AnnotatedExportJobRecord | null>;
  getActiveAnnotatedExportJob(): Promise<AnnotatedExportJobRecord | null>;
  updateAnnotatedExportJob(
    id: string,
    changes: AnnotatedExportJobChanges,
  ): Promise<AnnotatedExportJobRecord | null>;
  markRecoverableAnnotatedExportJobsInterrupted(): Promise<AnnotatedExportJobRecord[]>;
}
