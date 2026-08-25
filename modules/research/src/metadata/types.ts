import type { IdentifierScheme, WorkType } from '../contract.js';

export type MetadataProviderName = 'crossref' | 'datacite' | 'arxiv' | 'openalex';

export interface MetadataIdentifier {
  scheme: IdentifierScheme;
  value: string;
}

export interface ExternalMetadataCandidate {
  provider: MetadataProviderName;
  matchKind: 'exact' | 'candidate';
  sourceLocator: string;
  title: string | null;
  authors: string[];
  year: number | null;
  type: WorkType;
  publicationTitle: string | null;
  publisher: string | null;
  abstract: string | null;
  identifiers: MetadataIdentifier[];
  raw: unknown;
}

export interface ProviderResult {
  provider: MetadataProviderName;
  status: 'success' | 'not-found' | 'transient-failure' | 'client-error';
  candidates: ExternalMetadataCandidate[];
  sourceLocator: string;
  rawFormat: 'json' | 'atom+xml';
  rawPayload: string;
  httpStatus: number | null;
  error: string | null;
}

export interface FallbackMetadataQuery {
  title: string;
  author?: string;
  year?: number;
}

export interface MetadataLookupInput {
  doi?: string;
  arxivId?: string;
  fallback?: FallbackMetadataQuery;
  forceRefresh?: boolean;
  signal?: AbortSignal;
}

export interface MetadataDiagnostic {
  provider: MetadataProviderName;
  status: ProviderResult['status'] | 'cache-hit';
  message: string | null;
}

export interface MetadataLookupResult {
  candidates: ExternalMetadataCandidate[];
  sources: ProviderResult[];
  diagnostics: MetadataDiagnostic[];
  disclosure: {
    services: MetadataProviderName[];
    sentFields: Array<'doi' | 'arxivId' | 'title' | 'author' | 'year'>;
    sendsPdf: false;
  };
}
