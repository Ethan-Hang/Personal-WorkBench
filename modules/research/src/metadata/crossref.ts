import type { WorkType } from '../contract.js';
import { BoundedMetadataHttpClient } from './client.js';
import type { ExternalMetadataCandidate, FallbackMetadataQuery, ProviderResult } from './types.js';

const API = 'https://api.crossref.org';

function yearFromParts(value: unknown): number | null {
  if (!Array.isArray(value) || !Array.isArray(value[0]) || typeof value[0][0] !== 'number') {
    return null;
  }
  return value[0][0];
}

function workType(value: unknown): WorkType {
  switch (value) {
    case 'journal-article':
      return 'article';
    case 'proceedings-article':
      return 'conference-paper';
    case 'book-chapter':
      return 'book-chapter';
    case 'report':
      return 'report';
    case 'standard':
      return 'standard';
    case 'dissertation':
      return 'thesis';
    default:
      return 'unknown';
  }
}

function firstString(value: unknown): string | null {
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : null;
}

function candidate(
  raw: Record<string, unknown>,
  matchKind: 'exact' | 'candidate',
): ExternalMetadataCandidate {
  const authors = Array.isArray(raw.author)
    ? raw.author
        .map((author) => {
          if (typeof author !== 'object' || author === null) return '';
          const record = author as Record<string, unknown>;
          return [record.given, record.family]
            .filter((value) => typeof value === 'string')
            .join(' ');
        })
        .filter(Boolean)
    : [];
  const doi = typeof raw.DOI === 'string' ? raw.DOI.toLowerCase() : null;
  return {
    provider: 'crossref',
    matchKind,
    sourceLocator: doi ? `https://doi.org/${doi}` : `${API}/works`,
    title: firstString(raw.title),
    authors,
    year:
      yearFromParts((raw.published as Record<string, unknown> | undefined)?.['date-parts']) ??
      yearFromParts((raw.issued as Record<string, unknown> | undefined)?.['date-parts']),
    type: workType(raw.type),
    publicationTitle: firstString(raw['container-title']),
    publisher: typeof raw.publisher === 'string' ? raw.publisher : null,
    abstract: typeof raw.abstract === 'string' ? raw.abstract : null,
    identifiers: doi ? [{ scheme: 'doi', value: doi }] : [],
    raw,
  };
}

function result(
  response: Awaited<ReturnType<BoundedMetadataHttpClient['get']>>,
  sourceLocator: string,
  candidates: ExternalMetadataCandidate[],
): ProviderResult {
  const transient = response.status === 429 || response.status >= 500;
  const notFound = response.status === 404 || (response.status === 200 && candidates.length === 0);
  return {
    provider: 'crossref',
    status: transient
      ? 'transient-failure'
      : notFound
        ? 'not-found'
        : response.status >= 400
          ? 'client-error'
          : 'success',
    candidates,
    sourceLocator,
    rawFormat: 'json',
    rawPayload: response.body,
    httpStatus: response.status,
    error: response.status >= 400 ? `HTTP ${response.status}` : null,
  };
}

export class CrossrefProvider {
  constructor(private readonly http: BoundedMetadataHttpClient) {}

  async agency(doi: string, signal?: AbortSignal): Promise<'crossref' | 'datacite' | null> {
    const url = `${API}/works/${encodeURIComponent(doi)}/agency`;
    const response = await this.http.get(url, signal);
    if (response.status !== 200) return null;
    const parsed = JSON.parse(response.body) as {
      message?: { agency?: { id?: unknown; label?: unknown } };
    };
    const id = parsed.message?.agency?.id;
    const label = parsed.message?.agency?.label;
    const value = `${typeof id === 'string' ? id : ''} ${typeof label === 'string' ? label : ''}`;
    if (/datacite/i.test(value)) return 'datacite';
    if (/crossref/i.test(value)) return 'crossref';
    return null;
  }

  async lookupDoi(doi: string, signal?: AbortSignal): Promise<ProviderResult> {
    const url = `${API}/works/${encodeURIComponent(doi)}`;
    const response = await this.http.get(url, signal);
    let candidates: ExternalMetadataCandidate[] = [];
    if (response.status === 200) {
      const parsed = JSON.parse(response.body) as { message?: unknown };
      if (typeof parsed.message === 'object' && parsed.message !== null) {
        candidates = [candidate(parsed.message as Record<string, unknown>, 'exact')];
      }
    }
    return result(response, url, candidates);
  }

  async search(query: FallbackMetadataQuery, signal?: AbortSignal): Promise<ProviderResult> {
    const terms = [query.title, query.author, query.year?.toString()].filter(Boolean).join(' ');
    const url = `${API}/works?query.bibliographic=${encodeURIComponent(terms)}&rows=5`;
    const response = await this.http.get(url, signal);
    let candidates: ExternalMetadataCandidate[] = [];
    if (response.status === 200) {
      const parsed = JSON.parse(response.body) as { message?: { items?: unknown } };
      if (Array.isArray(parsed.message?.items)) {
        candidates = parsed.message.items
          .filter(
            (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
          )
          .map((item) => candidate(item, 'candidate'));
      }
    }
    return result(response, url, candidates);
  }
}
