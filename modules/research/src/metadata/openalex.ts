import type { WorkType } from '../contract.js';
import { BoundedMetadataHttpClient } from './client.js';
import type { ExternalMetadataCandidate, FallbackMetadataQuery, ProviderResult } from './types.js';

const API = 'https://api.openalex.org/works';

function workType(value: unknown): WorkType {
  switch (value) {
    case 'article':
      return 'article';
    case 'preprint':
      return 'preprint';
    case 'book-chapter':
      return 'book-chapter';
    case 'dissertation':
      return 'thesis';
    case 'report':
      return 'report';
    case 'dataset':
      return 'dataset';
    default:
      return 'unknown';
  }
}

function candidate(
  raw: Record<string, unknown>,
  matchKind: 'exact' | 'candidate',
): ExternalMetadataCandidate {
  const authorships = Array.isArray(raw.authorships) ? raw.authorships : [];
  const doi = typeof raw.doi === 'string' ? raw.doi.replace(/^https?:\/\/doi\.org\//i, '') : null;
  const primaryLocation =
    typeof raw.primary_location === 'object' && raw.primary_location !== null
      ? (raw.primary_location as Record<string, unknown>)
      : null;
  const source =
    typeof primaryLocation?.source === 'object' && primaryLocation.source !== null
      ? (primaryLocation.source as Record<string, unknown>)
      : null;
  return {
    provider: 'openalex',
    matchKind,
    sourceLocator: typeof raw.id === 'string' ? raw.id : doi ? `https://doi.org/${doi}` : API,
    title: typeof raw.title === 'string' ? raw.title : null,
    authors: authorships
      .map((authorship) => {
        if (typeof authorship !== 'object' || authorship === null) return '';
        const author = (authorship as Record<string, unknown>).author;
        return typeof author === 'object' &&
          author !== null &&
          typeof (author as Record<string, unknown>).display_name === 'string'
          ? ((author as Record<string, unknown>).display_name as string)
          : '';
      })
      .filter(Boolean),
    year: typeof raw.publication_year === 'number' ? raw.publication_year : null,
    type: workType(raw.type),
    publicationTitle: typeof source?.display_name === 'string' ? source.display_name : null,
    publisher: null,
    abstract: null,
    identifiers: doi ? [{ scheme: 'doi', value: doi.toLowerCase() }] : [],
    raw,
  };
}

function result(
  response: Awaited<ReturnType<BoundedMetadataHttpClient['get']>>,
  url: string,
  candidates: ExternalMetadataCandidate[],
): ProviderResult {
  const transient = response.status === 429 || response.status >= 500;
  return {
    provider: 'openalex',
    status: transient
      ? 'transient-failure'
      : response.status === 404 || (response.status === 200 && candidates.length === 0)
        ? 'not-found'
        : response.status >= 400
          ? 'client-error'
          : 'success',
    candidates,
    sourceLocator: url,
    rawFormat: 'json',
    rawPayload: response.body,
    httpStatus: response.status,
    error: response.status >= 400 ? `HTTP ${response.status}` : null,
  };
}

export class OpenAlexProvider {
  constructor(private readonly http: BoundedMetadataHttpClient) {}

  async lookupDoi(doi: string, signal?: AbortSignal): Promise<ProviderResult> {
    const url = `${API}/${encodeURIComponent(`https://doi.org/${doi}`)}`;
    const response = await this.http.get(url, signal);
    let candidates: ExternalMetadataCandidate[] = [];
    if (response.status === 200) {
      const raw = JSON.parse(response.body) as unknown;
      if (typeof raw === 'object' && raw !== null) {
        candidates = [candidate(raw as Record<string, unknown>, 'exact')];
      }
    }
    return result(response, url, candidates);
  }

  async search(query: FallbackMetadataQuery, signal?: AbortSignal): Promise<ProviderResult> {
    const filters = [
      `title.search:${query.title}`,
      query.author ? `authorships.author.display_name.search:${query.author}` : '',
      query.year ? `publication_year:${query.year}` : '',
    ].filter(Boolean);
    const url = `${API}?filter=${encodeURIComponent(filters.join(','))}&per-page=5`;
    const response = await this.http.get(url, signal);
    let candidates: ExternalMetadataCandidate[] = [];
    if (response.status === 200) {
      const parsed = JSON.parse(response.body) as { results?: unknown };
      if (Array.isArray(parsed.results)) {
        candidates = parsed.results
          .filter(
            (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
          )
          .map((item) => candidate(item, 'candidate'));
      }
    }
    return result(response, url, candidates);
  }
}
