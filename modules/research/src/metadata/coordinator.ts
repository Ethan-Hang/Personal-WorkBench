import { randomUUID } from 'node:crypto';
import { normalizeArxivId, normalizeDoi } from '../ingest/identifiers.js';
import type {
  MetadataCacheDraft,
  MetadataCacheRecord,
  ResearchRepository,
} from '../server/repository.js';
import { MetadataHttpError } from './client.js';
import type { ArxivProvider } from './arxiv.js';
import type { CrossrefProvider } from './crossref.js';
import type { DataCiteProvider } from './datacite.js';
import type { OpenAlexProvider } from './openalex.js';
import type {
  ExternalMetadataCandidate,
  MetadataDiagnostic,
  MetadataLookupInput,
  MetadataLookupResult,
  MetadataProviderName,
  ProviderResult,
} from './types.js';

const SUCCESS_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const NOT_FOUND_TTL_MS = 24 * 60 * 60 * 1_000;
const TRANSIENT_TTL_MS = 5 * 60 * 1_000;

export interface MetadataCache {
  getMetadataCache(
    provider: string,
    lookupKey: string,
    at: string,
  ): Promise<MetadataCacheRecord | null>;
  putMetadataCache(draft: MetadataCacheDraft): Promise<MetadataCacheRecord>;
}

export interface MetadataCoordinatorProviders {
  crossref: CrossrefProvider;
  datacite: DataCiteProvider;
  arxiv: ArxivProvider;
  openalex: OpenAlexProvider;
}

function asCachedResult(record: MetadataCacheRecord): ProviderResult | null {
  if (record.value === null || typeof record.value !== 'object') return null;
  return record.value as ProviderResult;
}

function cacheStatus(result: ProviderResult): MetadataCacheRecord['status'] {
  if (result.status === 'success') return 'success';
  if (result.status === 'not-found' || result.status === 'client-error') return 'not-found';
  return 'transient-failure';
}

function cacheTtl(status: MetadataCacheRecord['status']): number {
  if (status === 'success') return SUCCESS_TTL_MS;
  if (status === 'not-found') return NOT_FOUND_TTL_MS;
  return TRANSIENT_TTL_MS;
}

function dedupe(candidates: ExternalMetadataCandidate[]): ExternalMetadataCandidate[] {
  const found = new Set<string>();
  return candidates.filter((candidate) => {
    const identifier = candidate.identifiers[0];
    const key = identifier
      ? `${candidate.provider}:${identifier.scheme}:${identifier.value.toLowerCase()}`
      : `${candidate.provider}:${candidate.title ?? ''}:${candidate.year ?? ''}`;
    if (found.has(key)) return false;
    found.add(key);
    return true;
  });
}

export class MetadataCoordinator {
  constructor(
    private readonly providers: MetadataCoordinatorProviders,
    private readonly cache: MetadataCache,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = randomUUID,
  ) {}

  private async lookup(
    provider: MetadataProviderName,
    lookupKey: string,
    operation: () => Promise<ProviderResult>,
    forceRefresh: boolean,
    diagnostics: MetadataDiagnostic[],
  ): Promise<ProviderResult | null> {
    const now = this.now();
    if (!forceRefresh) {
      const cached = await this.cache.getMetadataCache(provider, lookupKey, now.toISOString());
      if (cached) {
        diagnostics.push({ provider, status: 'cache-hit', message: cached.status });
        return asCachedResult(cached);
      }
    }
    let result: ProviderResult;
    try {
      result = await operation();
    } catch (error) {
      if (error instanceof MetadataHttpError && !error.retryable) throw error;
      result = {
        provider,
        status: 'transient-failure',
        candidates: [],
        sourceLocator: lookupKey,
        rawFormat: provider === 'arxiv' ? 'atom+xml' : 'json',
        rawPayload: '',
        httpStatus: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    const status = cacheStatus(result);
    await this.cache.putMetadataCache({
      id: this.createId(),
      provider,
      lookupKey,
      status,
      value: result,
      expiresAt: new Date(now.getTime() + cacheTtl(status)).toISOString(),
    });
    diagnostics.push({ provider, status: result.status, message: result.error });
    return result;
  }

  private async agency(
    doi: string,
    forceRefresh: boolean,
    signal: AbortSignal | undefined,
    diagnostics: MetadataDiagnostic[],
  ): Promise<'crossref' | 'datacite' | null> {
    const lookupKey = `agency:${doi}`;
    const now = this.now();
    if (!forceRefresh) {
      const cached = await this.cache.getMetadataCache('crossref', lookupKey, now.toISOString());
      if (cached) {
        diagnostics.push({ provider: 'crossref', status: 'cache-hit', message: 'agency' });
        return cached.value === 'crossref' || cached.value === 'datacite' ? cached.value : null;
      }
    }
    try {
      const agency = await this.providers.crossref.agency(doi, signal);
      const status = agency === null ? 'not-found' : 'success';
      await this.cache.putMetadataCache({
        id: this.createId(),
        provider: 'crossref',
        lookupKey,
        status,
        value: agency,
        expiresAt: new Date(now.getTime() + cacheTtl(status)).toISOString(),
      });
      return agency;
    } catch (error) {
      if (error instanceof MetadataHttpError && !error.retryable) throw error;
      await this.cache.putMetadataCache({
        id: this.createId(),
        provider: 'crossref',
        lookupKey,
        status: 'transient-failure',
        value: null,
        expiresAt: new Date(now.getTime() + TRANSIENT_TTL_MS).toISOString(),
      });
      diagnostics.push({
        provider: 'crossref',
        status: 'transient-failure',
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async resolve(input: MetadataLookupInput): Promise<MetadataLookupResult> {
    const diagnostics: MetadataDiagnostic[] = [];
    const sources: ProviderResult[] = [];
    const services: MetadataProviderName[] = [];
    const sentFields = new Set<MetadataLookupResult['disclosure']['sentFields'][number]>();
    const force = input.forceRefresh ?? false;

    const arxivId = input.arxivId ? normalizeArxivId(input.arxivId) : null;
    if (arxivId) {
      services.push('arxiv');
      sentFields.add('arxivId');
      const result = await this.lookup(
        'arxiv',
        `arxiv:${arxivId}`,
        () => this.providers.arxiv.lookupId(arxivId, input.signal),
        force,
        diagnostics,
      );
      if (result) sources.push(result);
    }

    const doi = input.doi ? normalizeDoi(input.doi) : null;
    if (doi) {
      sentFields.add('doi');
      const agency = await this.agency(doi, force, input.signal, diagnostics);
      const authoritative = agency === 'datacite' ? 'datacite' : 'crossref';
      services.push(authoritative, 'openalex');
      const exact = await this.lookup(
        authoritative,
        `doi:${doi}`,
        () =>
          authoritative === 'datacite'
            ? this.providers.datacite.lookupDoi(doi, input.signal)
            : this.providers.crossref.lookupDoi(doi, input.signal),
        force,
        diagnostics,
      );
      if (exact) sources.push(exact);
      const openalex = await this.lookup(
        'openalex',
        `doi:${doi}`,
        () => this.providers.openalex.lookupDoi(doi, input.signal),
        force,
        diagnostics,
      );
      if (openalex) sources.push(openalex);
    }

    if (!doi && !arxivId && input.fallback) {
      services.push('openalex', 'crossref');
      sentFields.add('title');
      if (input.fallback.author) sentFields.add('author');
      if (input.fallback.year !== undefined) sentFields.add('year');
      const key = `bibliographic:${JSON.stringify(input.fallback)}`;
      const [openalex, crossref] = await Promise.all([
        this.lookup(
          'openalex',
          key,
          () => this.providers.openalex.search(input.fallback!, input.signal),
          force,
          diagnostics,
        ),
        this.lookup(
          'crossref',
          key,
          () => this.providers.crossref.search(input.fallback!, input.signal),
          force,
          diagnostics,
        ),
      ]);
      if (openalex) sources.push(openalex);
      if (crossref) sources.push(crossref);
    }

    return {
      candidates: dedupe(sources.flatMap((source) => source.candidates)),
      sources,
      diagnostics,
      disclosure: {
        services: [...new Set(services)],
        sentFields: [...sentFields],
        sendsPdf: false,
      },
    };
  }
}

export function repositoryMetadataCache(repository: ResearchRepository): MetadataCache {
  return repository;
}
