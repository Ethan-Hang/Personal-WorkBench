import { describe, expect, it } from 'vitest';
import { ArxivProvider } from './arxiv.js';
import { BoundedMetadataHttpClient, PROVIDER_MIN_INTERVAL_MS } from './client.js';
import { CrossrefProvider } from './crossref.js';
import { DataCiteProvider } from './datacite.js';
import { OpenAlexProvider } from './openalex.js';

const enabled = process.env.RUN_RESEARCH_LIVE_METADATA === '1';
const run = enabled ? describe : describe.skip;

function client(provider: 'crossref' | 'datacite' | 'arxiv' | 'openalex') {
  return new BoundedMetadataHttpClient({
    provider,
    minIntervalMs: PROVIDER_MIN_INTERVAL_MS[provider],
  });
}

run('外部元数据服务 live 验证', () => {
  it('只发送公开标识符并解析四个服务', async () => {
    const [crossref, datacite, arxiv, openalex] = await Promise.all([
      new CrossrefProvider(client('crossref')).lookupDoi('10.1038/s41586-020-2649-2'),
      new DataCiteProvider(client('datacite')).lookupDoi('10.5438/0012'),
      new ArxivProvider(client('arxiv')).lookupId('1706.03762'),
      new OpenAlexProvider(client('openalex')).lookupDoi('10.1038/s41586-020-2649-2'),
    ]);

    expect(crossref.status).toBe('success');
    expect(datacite.status).toBe('success');
    expect(arxiv.status).toBe('success');
    expect(openalex.status).toBe('success');
    expect(
      [crossref, datacite, arxiv, openalex].every((result) => result.candidates.length > 0),
    ).toBe(true);
  }, 60_000);
});
