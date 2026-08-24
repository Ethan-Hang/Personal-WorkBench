import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { ArxivProvider } from './arxiv.js';
import { BoundedMetadataHttpClient } from './client.js';
import { CrossrefProvider } from './crossref.js';
import { DataCiteProvider } from './datacite.js';
import { OpenAlexProvider } from './openalex.js';

async function fixture(name: string): Promise<string> {
  return readFile(new URL(`../testing/fixtures/${name}`, import.meta.url), 'utf8');
}

function client(provider: 'crossref' | 'datacite' | 'arxiv' | 'openalex', response: Response) {
  return new BoundedMetadataHttpClient({
    provider,
    minIntervalMs: 0,
    fetch: async () => response.clone(),
  });
}

describe('提供方响应映射', () => {
  it('Crossref DOI 精确结果保留作者、载体和 raw', async () => {
    const body = await fixture('crossref-work.json');
    const result = await new CrossrefProvider(
      client('crossref', new Response(body, { status: 200 })),
    ).lookupDoi('10.1000/example');

    expect(result).toMatchObject({
      status: 'success',
      rawPayload: body,
      candidates: [
        {
          provider: 'crossref',
          matchKind: 'exact',
          title: 'A Trustworthy Research Library',
          authors: ['Ada Lovelace', 'Alan Turing'],
          year: 2026,
          type: 'article',
          publicationTitle: 'Workbench Journal',
          identifiers: [{ scheme: 'doi', value: '10.1000/example' }],
        },
      ],
    });
  });

  it('Crossref agency 识别 DataCite 登记机构', async () => {
    const provider = new CrossrefProvider(
      client(
        'crossref',
        new Response(JSON.stringify({ message: { agency: { id: 'datacite' } } }), {
          status: 200,
        }),
      ),
    );
    await expect(provider.agency('10.5438/example')).resolves.toBe('datacite');
  });

  it('DataCite DOI 精确结果映射为候选', async () => {
    const body = await fixture('datacite-work.json');
    const result = await new DataCiteProvider(
      client('datacite', new Response(body, { status: 200 })),
    ).lookupDoi('10.5438/example');
    expect(result.candidates[0]).toMatchObject({
      provider: 'datacite',
      title: 'A DataCite Research Object',
      authors: ['Lovelace, Ada'],
      year: 2025,
    });
  });

  it('OpenAlex 精确结果只标记为自身来源', async () => {
    const body = await fixture('openalex-work.json');
    const result = await new OpenAlexProvider(
      client('openalex', new Response(body, { status: 200 })),
    ).lookupDoi('10.1000/example');
    expect(result.candidates[0]).toMatchObject({
      provider: 'openalex',
      matchKind: 'exact',
      title: 'A Trustworthy Research Library',
      authors: ['Ada Lovelace'],
    });
  });

  it('arXiv Atom 关闭实体展开并映射条目', async () => {
    const body = await fixture('arxiv-entry.xml');
    const result = await new ArxivProvider(
      client('arxiv', new Response(body, { status: 200 })),
    ).lookupId('2401.12345v2');
    expect(result).toMatchObject({
      status: 'success',
      rawFormat: 'atom+xml',
      candidates: [
        {
          provider: 'arxiv',
          matchKind: 'exact',
          title: 'A Trustworthy Research Library',
          authors: ['Ada Lovelace', 'Alan Turing'],
          year: 2026,
          type: 'preprint',
          identifiers: [{ scheme: 'arxiv', value: '2401.12345v2' }],
        },
      ],
    });

    const entityXml = `<?xml version="1.0"?><!DOCTYPE feed [<!ENTITY xxe "EXPANDED">]>
      <feed><entry><id>https://arxiv.org/abs/2401.12345</id><title>&xxe;</title></entry></feed>`;
    const entityResult = await new ArxivProvider(
      client('arxiv', new Response(entityXml, { status: 200 })),
    ).lookupId('2401.12345');
    expect(entityResult.candidates[0]?.title).not.toBe('EXPANDED');
  });

  it.each([429, 500, 503])('HTTP %s 标成 transient-failure', async (status) => {
    const result = await new OpenAlexProvider(
      client('openalex', new Response('unavailable', { status })),
    ).lookupDoi('10.1000/example');
    expect(result.status).toBe('transient-failure');
  });
});
