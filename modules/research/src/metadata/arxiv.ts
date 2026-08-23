import { XMLParser } from 'fast-xml-parser';
import { BoundedMetadataHttpClient } from './client.js';
import type { ExternalMetadataCandidate, ProviderResult } from './types.js';

const API = 'https://export.arxiv.org/api/query';

function array<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized || null;
}

export class ArxivProvider {
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    processEntities: false,
    trimValues: true,
  });

  constructor(private readonly http: BoundedMetadataHttpClient) {}

  async lookupId(arxivId: string, signal?: AbortSignal): Promise<ProviderResult> {
    const url = `${API}?id_list=${encodeURIComponent(arxivId)}`;
    const response = await this.http.get(url, signal);
    let candidates: ExternalMetadataCandidate[] = [];
    let parseError: string | null = null;
    if (response.status === 200) {
      try {
        const parsed = this.parser.parse(response.body) as {
          feed?: { entry?: unknown };
        };
        const entries = array(parsed.feed?.entry).filter(
          (entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null,
        );
        candidates = entries.map((entry) => {
          const authors = array(entry.author)
            .map((author) =>
              typeof author === 'object' && author !== null
                ? text((author as Record<string, unknown>).name)
                : null,
            )
            .filter((value): value is string => value !== null);
          const id = text(entry.id)?.replace(/^https?:\/\/arxiv\.org\/abs\//i, '') ?? arxivId;
          const published = text(entry.published);
          return {
            provider: 'arxiv',
            matchKind: 'exact',
            sourceLocator: `https://arxiv.org/abs/${id}`,
            title: text(entry.title),
            authors,
            year: published ? Number.parseInt(published.slice(0, 4), 10) : null,
            type: 'preprint',
            publicationTitle: 'arXiv',
            publisher: null,
            abstract: text(entry.summary),
            identifiers: [{ scheme: 'arxiv', value: id }],
            raw: entry,
          } satisfies ExternalMetadataCandidate;
        });
      } catch (error) {
        parseError = error instanceof Error ? error.message : String(error);
      }
    }
    const transient = response.status === 429 || response.status >= 500 || parseError !== null;
    return {
      provider: 'arxiv',
      status: transient
        ? 'transient-failure'
        : response.status === 404 || (response.status === 200 && candidates.length === 0)
          ? 'not-found'
          : response.status >= 400
            ? 'client-error'
            : 'success',
      candidates,
      sourceLocator: url,
      rawFormat: 'atom+xml',
      rawPayload: response.body,
      httpStatus: response.status,
      error: parseError ?? (response.status >= 400 ? `HTTP ${response.status}` : null),
    };
  }
}
