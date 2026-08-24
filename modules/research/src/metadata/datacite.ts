import { BoundedMetadataHttpClient } from './client.js';
import type { ExternalMetadataCandidate, ProviderResult } from './types.js';

const API = 'https://api.datacite.org/dois';

function candidate(raw: Record<string, unknown>): ExternalMetadataCandidate {
  const attributes = (raw.attributes ?? {}) as Record<string, unknown>;
  const titles = Array.isArray(attributes.titles) ? attributes.titles : [];
  const creators = Array.isArray(attributes.creators) ? attributes.creators : [];
  const doi = typeof attributes.doi === 'string' ? attributes.doi.toLowerCase() : null;
  return {
    provider: 'datacite',
    matchKind: 'exact',
    sourceLocator: doi ? `https://doi.org/${doi}` : API,
    title:
      typeof (titles[0] as Record<string, unknown> | undefined)?.title === 'string'
        ? ((titles[0] as Record<string, unknown>).title as string)
        : null,
    authors: creators
      .map((creator) =>
        typeof creator === 'object' && creator !== null && typeof creator.name === 'string'
          ? creator.name
          : '',
      )
      .filter(Boolean),
    year: typeof attributes.publicationYear === 'number' ? attributes.publicationYear : null,
    type: 'unknown',
    publicationTitle:
      typeof attributes.container === 'object' &&
      attributes.container !== null &&
      typeof (attributes.container as Record<string, unknown>).title === 'string'
        ? ((attributes.container as Record<string, unknown>).title as string)
        : null,
    publisher: typeof attributes.publisher === 'string' ? attributes.publisher : null,
    abstract:
      Array.isArray(attributes.descriptions) &&
      typeof (attributes.descriptions[0] as Record<string, unknown> | undefined)?.description ===
        'string'
        ? ((attributes.descriptions[0] as Record<string, unknown>).description as string)
        : null,
    identifiers: doi ? [{ scheme: 'doi', value: doi }] : [],
    raw,
  };
}

export class DataCiteProvider {
  constructor(private readonly http: BoundedMetadataHttpClient) {}

  async lookupDoi(doi: string, signal?: AbortSignal): Promise<ProviderResult> {
    const url = `${API}/${encodeURIComponent(doi)}`;
    const response = await this.http.get(url, signal);
    let candidates: ExternalMetadataCandidate[] = [];
    if (response.status === 200) {
      const parsed = JSON.parse(response.body) as { data?: unknown };
      if (typeof parsed.data === 'object' && parsed.data !== null) {
        candidates = [candidate(parsed.data as Record<string, unknown>)];
      }
    }
    const transient = response.status === 429 || response.status >= 500;
    return {
      provider: 'datacite',
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
}
