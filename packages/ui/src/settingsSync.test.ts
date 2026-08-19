import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_SETTINGS, type AppSettings } from '@workbench/core';
import { SettingsSync, type SettingsStore } from './settingsSync.js';

/** 可控的假 store：patch 挂起在 deferred 上，用来精确制造并发。 */
function makeStore(overrides: Partial<SettingsStore> = {}) {
  const calls: Array<Partial<AppSettings>> = [];
  let server: AppSettings = { ...DEFAULT_SETTINGS };
  const store: SettingsStore = {
    readSnapshot: () => ({}),
    writeSnapshot: vi.fn(),
    load: async () => ({ settings: server, storedKeys: [] }),
    patch: async (p) => {
      calls.push(p);
      server = { ...server, ...p };
      return server;
    },
    ...overrides,
  };
  return { store, calls, getServer: () => server };
}

describe('SettingsSync 首屏', () => {
  it('构造时立即用快照填充，不等网络', () => {
    const { store } = makeStore({ readSnapshot: () => ({ 'theme.mode': 'dark' }) });
    const sync = new SettingsSync(store, vi.fn(), vi.fn());
    expect(sync.current['theme.mode']).toBe('dark');
    expect(sync.current['theme.palette']).toBe('warm');
  });

  it('快照里的脏值不会污染当前值', () => {
    const { store } = makeStore({
      readSnapshot: () => ({ 'theme.mode': 'chartreuse' }) as never,
    });
    const sync = new SettingsSync(store, vi.fn(), vi.fn());
    expect(sync.current['theme.mode']).toBe('system');
  });

  it('init 后用服务端值校正并回写快照', async () => {
    const { store } = makeStore({
      readSnapshot: () => ({ 'theme.mode': 'dark' }),
      load: async () => ({
        settings: { ...DEFAULT_SETTINGS, 'theme.mode': 'light' },
        storedKeys: ['theme.mode'],
      }),
    });
    const onChange = vi.fn();
    const sync = new SettingsSync(store, onChange, vi.fn());
    await sync.init();
    expect(sync.current['theme.mode']).toBe('light');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ 'theme.mode': 'light' }));
    expect(store.writeSnapshot).toHaveBeenCalled();
  });

  it('init 失败时保留快照值，不清空界面', async () => {
    const { store } = makeStore({
      readSnapshot: () => ({ 'theme.mode': 'dark' }),
      load: async () => {
        throw new Error('后端没起来');
      },
    });
    const onError = vi.fn();
    const sync = new SettingsSync(store, vi.fn(), onError);
    await sync.init();
    expect(sync.current['theme.mode']).toBe('dark');
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('后端没起来'));
  });
});

describe('SettingsSync 写入', () => {
  it('乐观更新：update 后立刻可见，不等请求回来', () => {
    const { store } = makeStore();
    const onChange = vi.fn();
    const sync = new SettingsSync(store, onChange, vi.fn());
    sync.update({ 'theme.mode': 'dark' });
    expect(sync.current['theme.mode']).toBe('dark');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ 'theme.mode': 'dark' }));
  });

  it('连续改动合并成一个后续请求，而不是各发一个', async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls: Array<Partial<AppSettings>> = [];
    let first = true;
    const store: SettingsStore = {
      readSnapshot: () => ({}),
      writeSnapshot: vi.fn(),
      load: async () => ({ settings: { ...DEFAULT_SETTINGS }, storedKeys: [] }),
      patch: async (p) => {
        calls.push(p);
        if (first) {
          first = false;
          await gate;
        }
        return { ...DEFAULT_SETTINGS, ...p };
      },
    };
    const sync = new SettingsSync(store, vi.fn(), vi.fn());

    sync.update({ 'theme.mode': 'dark' }); // 第一个请求，卡住
    sync.update({ 'theme.palette': 'ocean' }); // 入队
    sync.update({ 'timezone.id': 'Europe/Paris' }); // 与上一条合并
    release!();
    await sync.whenIdle();

    expect(calls).toEqual([
      { 'theme.mode': 'dark' },
      { 'theme.palette': 'ocean', 'timezone.id': 'Europe/Paris' },
    ]);
  });

  it('写失败时回滚到上一个服务端确认值并报错', async () => {
    const { store } = makeStore({
      patch: async () => {
        throw new Error('设置项 theme.mode 的值不合法（请求编号 req-7）');
      },
    });
    const onError = vi.fn();
    const sync = new SettingsSync(store, vi.fn(), onError);
    await sync.init();
    sync.update({ 'theme.mode': 'dark' });
    expect(sync.current['theme.mode']).toBe('dark'); // 乐观期间
    await sync.whenIdle();
    expect(sync.current['theme.mode']).toBe('system'); // 回滚
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('req-7'));
  });

  it('成功后清掉上一次的错误', async () => {
    let shouldFail = true;
    const { store } = makeStore({
      patch: async (p) => {
        if (shouldFail) {
          shouldFail = false;
          throw new Error('炸了');
        }
        return { ...DEFAULT_SETTINGS, ...p };
      },
    });
    const onError = vi.fn();
    const sync = new SettingsSync(store, vi.fn(), onError);
    await sync.init();
    sync.update({ 'theme.mode': 'dark' });
    await sync.whenIdle();
    sync.update({ 'theme.mode': 'light' });
    await sync.whenIdle();
    expect(onError).toHaveBeenLastCalledWith(null);
  });

  it('成功后把确认值写进快照', async () => {
    const { store } = makeStore();
    const sync = new SettingsSync(store, vi.fn(), vi.fn());
    await sync.init();
    sync.update({ 'theme.mode': 'dark' });
    await sync.whenIdle();
    expect(store.writeSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({ 'theme.mode': 'dark' }),
    );
  });

  it('空补丁不发请求', async () => {
    const { store, calls } = makeStore();
    const sync = new SettingsSync(store, vi.fn(), vi.fn());
    sync.update({});
    await sync.whenIdle();
    expect(calls).toEqual([]);
  });
});
