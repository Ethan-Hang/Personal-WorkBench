import { describe, expect, it, vi } from 'vitest';
import { PageResourceCache } from './page-cache.js';

async function loadPage(
  cache: PageResourceCache<string>,
  documentId: string,
  pageNumber: number,
  dispose = vi.fn(),
) {
  return cache.acquire(documentId, pageNumber, async () => `${documentId}:${pageNumber}`, dispose);
}

describe('page resource cache', () => {
  it('同一文档最多保留八页并按 LRU 驱逐', async () => {
    const cache = new PageResourceCache<string>();
    const dispose = vi.fn();
    for (let page = 1; page <= 9; page += 1) {
      const lease = await loadPage(cache, 'document-a', page, dispose);
      lease.release();
    }

    expect(cache.stats()).toMatchObject({ total: 8, byDocument: { 'document-a': 8 } });
    expect(dispose).toHaveBeenCalledWith('document-a:1');
  });

  it('跨文档最多保留十六页', async () => {
    const cache = new PageResourceCache<string>();
    for (let document = 1; document <= 3; document += 1) {
      for (let page = 1; page <= 8; page += 1) {
        const lease = await loadPage(cache, `document-${document}`, page);
        lease.release();
      }
    }

    expect(cache.stats().total).toBe(16);
    expect(cache.stats().byDocument['document-3']).toBe(8);
  });

  it('不会驱逐正在渲染的页面，也不会临时突破上限', async () => {
    const cache = new PageResourceCache<string>(2, 2);
    const first = await loadPage(cache, 'document-a', 1);
    const second = await loadPage(cache, 'document-a', 2);

    await expect(loadPage(cache, 'document-a', 3)).rejects.toThrow('READER_PAGE_CACHE_CAPACITY');
    expect(cache.stats()).toMatchObject({ total: 2, pinned: 2 });
    first.release();
    const third = await loadPage(cache, 'document-a', 3);
    expect(cache.stats()).toMatchObject({ total: 2, pinned: 2 });
    second.release();
    third.release();
  });

  it('并发请求同一页只加载一次', async () => {
    const cache = new PageResourceCache<string>();
    const load = vi.fn(async () => 'shared-page');
    const [first, second] = await Promise.all([
      cache.acquire('document-a', 1, load, () => undefined),
      cache.acquire('document-a', 1, load, () => undefined),
    ]);

    expect(load).toHaveBeenCalledTimes(1);
    expect(cache.stats().pinned).toBe(1);
    first.release();
    expect(cache.stats().pinned).toBe(1);
    second.release();
    expect(cache.stats().pinned).toBe(0);
  });

  it('文档在页面加载途中休眠时丢弃迟到资源', async () => {
    const cache = new PageResourceCache<string>();
    const dispose = vi.fn();
    let resolveLoad: ((value: string) => void) | undefined;
    const acquiring = cache.acquire(
      'document-a',
      1,
      () =>
        new Promise<string>((resolve) => {
          resolveLoad = resolve;
        }),
      dispose,
    );

    cache.clearDocument('document-a');
    resolveLoad?.('late-page');

    await expect(acquiring).rejects.toThrow('READER_PAGE_CACHE_RETIRED');
    expect(dispose).toHaveBeenCalledWith('late-page');
    expect(cache.stats().total).toBe(0);
  });
});
