import { describe, expect, it } from 'vitest';
import { BoundedMetadataHttpClient } from './client.js';

describe('有界元数据 HTTP 客户端', () => {
  it('串行请求并遵守最小间隔', async () => {
    let now = 0;
    let active = 0;
    let maxActive = 0;
    const starts: number[] = [];
    const client = new BoundedMetadataHttpClient({
      provider: 'crossref',
      minIntervalMs: 250,
      now: () => now,
      sleep: async (milliseconds) => {
        now += milliseconds;
      },
      fetch: async () => {
        starts.push(now);
        active += 1;
        maxActive = Math.max(maxActive, active);
        active -= 1;
        return new Response('{}', { status: 200 });
      },
    });

    await Promise.all([client.get('https://example.test/1'), client.get('https://example.test/2')]);

    expect(starts).toEqual([0, 250]);
    expect(maxActive).toBe(1);
  });

  it('网络错误、429 和 5xx 最多重试两次，并遵守 Retry-After', async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const client = new BoundedMetadataHttpClient({
      provider: 'openalex',
      minIntervalMs: 0,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
      fetch: async () => {
        calls += 1;
        if (calls === 1) throw new Error('offline');
        if (calls === 2) {
          return new Response('rate limited', {
            status: 429,
            headers: { 'Retry-After': '2' },
          });
        }
        return new Response('{}', { status: 200 });
      },
    });

    await expect(client.get('https://example.test')).resolves.toMatchObject({ status: 200 });
    expect(calls).toBe(3);
    expect(sleeps).toContain(2_000);
  });

  it('普通 4xx 不重试', async () => {
    let calls = 0;
    const client = new BoundedMetadataHttpClient({
      provider: 'datacite',
      minIntervalMs: 0,
      fetch: async () => {
        calls += 1;
        return new Response('not found', { status: 404 });
      },
    });

    await expect(client.get('https://example.test')).resolves.toMatchObject({ status: 404 });
    expect(calls).toBe(1);
  });

  it('请求超过 deadline 时按网络失败重试，最终返回稳定错误', async () => {
    let calls = 0;
    const client = new BoundedMetadataHttpClient({
      provider: 'arxiv',
      minIntervalMs: 0,
      timeoutMs: 10,
      fetch: async (_url, init) => {
        calls += 1;
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        });
      },
    });

    await expect(client.get('https://example.test')).rejects.toMatchObject({
      name: 'MetadataHttpError',
      provider: 'arxiv',
      retryable: true,
    });
    expect(calls).toBe(3);
  });
});
