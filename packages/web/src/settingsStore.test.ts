import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@workbench/core';
import { createHttpSettingsStore, SNAPSHOT_KEY, MIGRATED_FLAG } from './settingsStore.js';

/** 测试环境是 node，没有 localStorage——用一个 Map 顶上。 */
function makeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('readSnapshot / writeSnapshot', () => {
  it('没有快照时返回空对象', () => {
    const store = createHttpSettingsStore({ storage: makeStorage(), fetchFn: vi.fn() });
    expect(store.readSnapshot()).toEqual({});
  });

  it('快照坏掉时返回空对象而不是抛', () => {
    const storage = makeStorage({ [SNAPSHOT_KEY]: '{not json' });
    const store = createHttpSettingsStore({ storage, fetchFn: vi.fn() });
    expect(store.readSnapshot()).toEqual({});
  });

  it('writeSnapshot 写进单个键，不再是五个散键', () => {
    const storage = makeStorage();
    const store = createHttpSettingsStore({ storage, fetchFn: vi.fn() });
    store.writeSnapshot({ ...DEFAULT_SETTINGS, 'theme.mode': 'dark' });
    expect(JSON.parse(storage.getItem(SNAPSHOT_KEY)!)['theme.mode']).toBe('dark');
  });

  it('storage 不可用（隐身模式）时静默降级，不抛', () => {
    const store = createHttpSettingsStore({ storage: null, fetchFn: vi.fn() });
    expect(store.readSnapshot()).toEqual({});
    expect(() => store.writeSnapshot(DEFAULT_SETTINGS)).not.toThrow();
  });
});

describe('patch 的请求形状', () => {
  it('带 content-type: application/json，方法是 PATCH，body 包在 settings 里', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ settings: DEFAULT_SETTINGS, storedKeys: [] }));
    const store = createHttpSettingsStore({ storage: makeStorage(), fetchFn });
    await store.patch({ 'theme.mode': 'dark' });

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('/api/settings');
    expect(init.method).toBe('PATCH');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ settings: { 'theme.mode': 'dark' } });
  });

  it('4xx 时抛出服务端的错误信息与请求编号', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: '未知设置项：x', requestId: 'req-9' }, 400));
    const store = createHttpSettingsStore({ storage: makeStorage(), fetchFn });
    await expect(store.patch({ 'theme.mode': 'dark' })).rejects.toThrow(/未知设置项：x.*req-9/);
  });

  it('响应形状不对时抛，而不是把脏数据喂给界面', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ nope: 1 }));
    const store = createHttpSettingsStore({ storage: makeStorage(), fetchFn });
    await expect(store.patch({ 'theme.mode': 'dark' })).rejects.toThrow();
  });
});

describe('load 与一次性迁移', () => {
  it('没有旧键时只发一个 GET', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ settings: DEFAULT_SETTINGS, storedKeys: [] }));
    const store = createHttpSettingsStore({ storage: makeStorage(), fetchFn });
    const snapshot = await store.load();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(snapshot.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('把旧的五个 localStorage 键搬上去，然后删掉它们', async () => {
    const storage = makeStorage({
      workbench_theme_mode: 'dark',
      workbench_theme_palette: 'ocean',
      workbench_timezone: 'Europe/Paris',
      workbench_dst_mode: 'standard',
      workbench_preferences: JSON.stringify({ showGreeting: false, enableAnimations: false }),
    });
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ settings: DEFAULT_SETTINGS, storedKeys: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          settings: { ...DEFAULT_SETTINGS, 'theme.mode': 'dark' },
          storedKeys: ['theme.mode'],
        }),
      );
    const store = createHttpSettingsStore({ storage, fetchFn });
    await store.load();

    const patchBody = JSON.parse(fetchFn.mock.calls[1]![1]!.body as string);
    expect(patchBody.settings).toEqual({
      'theme.mode': 'dark',
      'theme.palette': 'ocean',
      'timezone.id': 'Europe/Paris',
      'timezone.dstMode': 'standard',
      'workbench.showGreeting': false,
      'workbench.enableAnimations': false,
    });
    expect(storage.getItem('workbench_theme_mode')).toBeNull();
    expect(storage.getItem('workbench_preferences')).toBeNull();
    expect(storage.getItem(MIGRATED_FLAG)).toBe('1');
  });

  it('库里已有的键不被旧值覆盖', async () => {
    const storage = makeStorage({
      workbench_theme_mode: 'dark',
      workbench_timezone: 'Europe/Paris',
    });
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          settings: { ...DEFAULT_SETTINGS, 'theme.mode': 'light' },
          storedKeys: ['theme.mode'],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ settings: DEFAULT_SETTINGS, storedKeys: ['theme.mode', 'timezone.id'] }),
      );
    const store = createHttpSettingsStore({ storage, fetchFn });
    await store.load();
    expect(JSON.parse(fetchFn.mock.calls[1]![1]!.body as string).settings).toEqual({
      'timezone.id': 'Europe/Paris',
    });
  });

  it('旧值里的脏数据被丢掉，不发上去', async () => {
    const storage = makeStorage({
      workbench_theme_mode: 'chartreuse',
      workbench_timezone: 'Europe/Paris',
    });
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ settings: DEFAULT_SETTINGS, storedKeys: [] }))
      .mockResolvedValueOnce(
        jsonResponse({ settings: DEFAULT_SETTINGS, storedKeys: ['timezone.id'] }),
      );
    const store = createHttpSettingsStore({ storage, fetchFn });
    await store.load();
    expect(JSON.parse(fetchFn.mock.calls[1]![1]!.body as string).settings).toEqual({
      'timezone.id': 'Europe/Paris',
    });
  });

  it('已经迁移过就不再迁移，哪怕旧键又冒出来', async () => {
    const storage = makeStorage({ [MIGRATED_FLAG]: '1', workbench_theme_mode: 'dark' });
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ settings: DEFAULT_SETTINGS, storedKeys: [] }));
    const store = createHttpSettingsStore({ storage, fetchFn });
    await store.load();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('迁移的 PATCH 失败时不删旧键、不落标记，下次还能再来一遍', async () => {
    const storage = makeStorage({ workbench_theme_mode: 'dark' });
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ settings: DEFAULT_SETTINGS, storedKeys: [] }))
      .mockResolvedValueOnce(jsonResponse({ error: '炸了', requestId: 'req-1' }, 500));
    const store = createHttpSettingsStore({ storage, fetchFn });
    await store.load();
    expect(storage.getItem('workbench_theme_mode')).toBe('dark');
    expect(storage.getItem(MIGRATED_FLAG)).toBeNull();
  });

  it('GET 失败时抛，让 SettingsSync 保留快照', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: '炸了' }, 500));
    const store = createHttpSettingsStore({ storage: makeStorage(), fetchFn });
    await expect(store.load()).rejects.toThrow();
  });
});
