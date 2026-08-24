import type { ResearchRepository } from '../server/repository.js';
import { ArxivProvider } from './arxiv.js';
import {
  BoundedMetadataHttpClient,
  PROVIDER_MIN_INTERVAL_MS,
  type MetadataFetch,
} from './client.js';
import { MetadataCoordinator } from './coordinator.js';
import { CrossrefProvider } from './crossref.js';
import { DataCiteProvider } from './datacite.js';
import { OpenAlexProvider } from './openalex.js';

export interface CreateMetadataCoordinatorOptions {
  repository: ResearchRepository;
  fetch?: MetadataFetch;
  now?: () => Date;
  createId?: () => string;
}

export function createMetadataCoordinator(
  options: CreateMetadataCoordinatorOptions,
): MetadataCoordinator {
  const client = (provider: 'crossref' | 'datacite' | 'arxiv' | 'openalex') =>
    new BoundedMetadataHttpClient({
      provider,
      minIntervalMs: PROVIDER_MIN_INTERVAL_MS[provider],
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  return new MetadataCoordinator(
    {
      crossref: new CrossrefProvider(client('crossref')),
      datacite: new DataCiteProvider(client('datacite')),
      arxiv: new ArxivProvider(client('arxiv')),
      openalex: new OpenAlexProvider(client('openalex')),
    },
    options.repository,
    options.now,
    options.createId,
  );
}

export type {
  ExternalMetadataCandidate,
  MetadataLookupInput,
  MetadataLookupResult,
  MetadataProviderName,
  ProviderResult,
} from './types.js';
