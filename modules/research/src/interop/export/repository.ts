import type {
  InteropExportJobStatus,
  InteropExportScope,
  InteropFormat,
  InteropFrozenEntity,
  InteropLossItem,
} from '../../contract.js';
import type { ExportRecordProjection } from './model.js';

export interface CitationKeyPreferenceRecord {
  workId: string;
  editionId: string | null;
  preferredKey: string;
  source: 'generated' | 'imported' | 'user';
  revision: number;
}

export interface InteropExportJobRecord {
  id: string;
  requestId: string;
  status: InteropExportJobStatus;
  format: InteropFormat;
  scope: InteropExportScope;
  editionPolicy: 'preferred' | 'all';
  frozenEntities: InteropFrozenEntity[];
  previewToken: string | null;
  targetPath: string | null;
  losses: InteropLossItem[];
  result: {
    targetPath: string;
    bytes: number;
    sha256: string;
    recordCount: number;
    overwritten: boolean;
  } | null;
  errorCode: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface CreateInteropExportPreviewDraft {
  id: string;
  requestId: string;
  format: InteropFormat;
  scope: InteropExportScope;
  editionPolicy: 'preferred' | 'all';
  frozenEntities: InteropFrozenEntity[];
  previewToken: string;
  losses: InteropLossItem[];
}

export interface InteropExportChanges {
  status?: InteropExportJobStatus;
  targetPath?: string | null;
  losses?: InteropLossItem[];
  result?: InteropExportJobRecord['result'];
  errorCode?: string | null;
  completedAt?: string | null;
}

export interface InteropExportRepository {
  projectExportRecords(
    scope: InteropExportScope,
    editionPolicy: 'preferred' | 'all',
  ): Array<Omit<ExportRecordProjection, 'citationKey'>>;
  listCitationKeyPreferences(workIds: string[]): CitationKeyPreferenceRecord[];
  saveCitationKeyPreference(input: {
    id: string;
    workId: string;
    editionId: string | null;
    preferredKey: string;
    expectedRevision: number;
  }): CitationKeyPreferenceRecord;
  createOrGetExportPreview(draft: CreateInteropExportPreviewDraft): InteropExportJobRecord;
  getExport(id: string): InteropExportJobRecord | null;
  updateExport(
    id: string,
    expectedRevision: number,
    changes: InteropExportChanges,
  ): InteropExportJobRecord;
  frozenEntitiesCurrent(entities: InteropFrozenEntity[]): boolean;
}
