import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { makeResearchDatabase } from '../testing/harness.js';
import { ArxivProvider } from './arxiv.js';
import { BoundedMetadataHttpClient, type MetadataFetch } from './client.js';
import { MetadataCoordinator } from './coordinator.js';
import { CrossrefProvider } from './crossref.js';
import { DataCiteProvider } from './datacite.js';
import { OpenAlexProvider } from './openalex.js';

const NOW = new Date('2026-08-23T12:00:00.000Z');

async function fixtures() {
  const read = (name: string) =>
    readFile(new URL(`../testing/fixtures/${name}`, import.meta.url), 'utf8');
  return {
    crossref: await read('crossref-work.json'),
    datacite: await read('datacite-work.json'),
    openalex: await read('openalex-work.json'),
    arxiv: await read('arxiv-entry.xml'),
  };
}

async function coordinatorFixture(route?: MetadataFetch) {
  const bodies = await fixtures();
  const calls: string[] = [];
  const fetch: MetadataFetch = async (url, init) => {
    calls.push(url);
    if (route) return route(url, init);
    if (url.includes('/agency')) {
      return new Response(JSON.stringify({ message: { agency: { id: 'crossref' } } }), {
        status: 200,
      });
    }
    if (url.includes('api.crossref.org/works/')) return new Response(bodies.crossref);
    if (url.includes('api.datacite.org')) return new Response(bodies.datacite);
    if (url.includes('api.openalex.org')) return new Response(bodies.openalex);
    if (url.includes('export.arxiv.org')) {
      return new Response(bodies.arxiv, { headers: { 'Content-Type': 'application/atom+xml' } });
    }
    return new Response('not found', { status: 404 });
  };
  const makeClient = (provider: 'crossref' | 'datacite' | 'arxiv' | 'openalex') =>
    new BoundedMetadataHttpClient({ provider, minIntervalMs: 0, fetch });
  const { repo } = makeResearchDatabase(() => NOW.toISOString());
  let ids = 0;
  const coordinator = new MetadataCoordinator(
    {
      crossref: new CrossrefProvider(makeClient('crossref')),
      datacite: new DataCiteProvider(makeClient('datacite')),
      arxiv: new ArxivProvider(makeClient('arxiv')),
      openalex: new OpenAlexProvider(makeClient('openalex')),
    },
    repo,
    () => NOW,
    () => `cache-${ids++}`,
  );
  return { coordinator, calls, repo };
}

describe('外部元数据协调', () => {
  it('DOI 先判 agency，再查权威服务，OpenAlex 只保留为补充候选', async () => {
    const { coordinator, calls } = await coordinatorFixture();
    const result = await coordinator.resolve({ doi: 'https://doi.org/10.1000/EXAMPLE' });

    expect(calls).toHaveLength(3);
    expect(calls[0]).toContain('/agency');
    expect(calls[1]).toContain('api.crossref.org/works/');
    expect(calls[2]).toContain('api.openalex.org');
    expect(result.candidates.map((candidate) => candidate.provider)).toEqual([
      'crossref',
      'openalex',
    ]);
    expect(result.disclosure).toEqual({
      services: ['crossref', 'openalex'],
      sentFields: ['doi'],
      sendsPdf: false,
    });
  });

  it('DataCite agency 走 DataCite 精确接口', async () => {
    const bodies = await fixtures();
    const { coordinator, calls } = await coordinatorFixture(async (url) => {
      if (url.includes('/agency')) {
        return new Response(JSON.stringify({ message: { agency: { id: 'datacite' } } }));
      }
      if (url.includes('api.datacite.org')) return new Response(bodies.datacite);
      if (url.includes('api.openalex.org')) return new Response(bodies.openalex);
      return new Response('not found', { status: 404 });
    });

    const result = await coordinator.resolve({ doi: '10.5438/example' });

    expect(calls.some((url) => url.includes('api.datacite.org'))).toBe(true);
    expect(result.candidates[0]?.provider).toBe('datacite');
  });

  it('精确成功和 agency 都持久缓存，重复请求不再访问网络', async () => {
    const { coordinator, calls } = await coordinatorFixture();
    await coordinator.resolve({ doi: '10.1000/example' });
    expect(calls).toHaveLength(3);

    const cached = await coordinator.resolve({ doi: '10.1000/example' });

    expect(calls).toHaveLength(3);
    expect(cached.diagnostics.every((item) => item.status === 'cache-hit')).toBe(true);
  });

  it('not-found 缓存 24h，transient failure 缓存 5min', async () => {
    const notFoundFixture = await coordinatorFixture(async () => new Response('', { status: 404 }));
    await notFoundFixture.coordinator.resolve({ arxivId: '2401.12345' });
    const notFound = await notFoundFixture.repo.getMetadataCache(
      'arxiv',
      'arxiv:2401.12345',
      NOW.toISOString(),
    );
    expect(Date.parse(notFound!.expiresAt) - NOW.getTime()).toBe(24 * 60 * 60 * 1_000);

    const transientFixture = await coordinatorFixture(async () => {
      throw new Error('offline');
    });
    await transientFixture.coordinator.resolve({ arxivId: '2401.12345' });
    const transient = await transientFixture.repo.getMetadataCache(
      'arxiv',
      'arxiv:2401.12345',
      NOW.toISOString(),
    );
    expect(Date.parse(transient!.expiresAt) - NOW.getTime()).toBe(5 * 60 * 1_000);
  });

  it('没有可靠 ID 时两个标题检索只产生 candidate', async () => {
    const bodies = await fixtures();
    const { coordinator } = await coordinatorFixture(async (url) => {
      if (url.includes('openalex')) {
        return new Response(JSON.stringify({ results: [JSON.parse(bodies.openalex)] }));
      }
      if (url.includes('crossref')) {
        const work = JSON.parse(bodies.crossref) as { message: unknown };
        return new Response(JSON.stringify({ message: { items: [work.message] } }));
      }
      return new Response('', { status: 404 });
    });

    const result = await coordinator.resolve({
      fallback: { title: 'A Trustworthy Research Library', author: 'Ada Lovelace', year: 2026 },
    });

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.every((candidate) => candidate.matchKind === 'candidate')).toBe(true);
    expect(result.disclosure.sentFields).toEqual(['title', 'author', 'year']);
  });

  it('离线或超时返回可重试诊断，不阻断本地导入', async () => {
    const { coordinator } = await coordinatorFixture(async () => {
      throw new Error('offline');
    });

    await expect(coordinator.resolve({ arxivId: '2401.12345' })).resolves.toMatchObject({
      candidates: [],
      diagnostics: [
        {
          provider: 'arxiv',
          status: 'transient-failure',
          message: expect.stringContaining('网络请求失败'),
        },
      ],
    });
  });
});
