import {
  DEFAULT_SETTINGS,
  resolveSettings,
  type AppSettings,
  type SettingKey,
} from '@workbench/core';

export interface SettingsSnapshot {
  settings: AppSettings;
  storedKeys: SettingKey[];
}

/**
 * 设置的读写端口。ui 只声明它，不实现——实现在 packages/web，
 * 这样 packages/ui 保持零网络调用，也不会出现硬编码的 /api/ 字面量。
 */
export interface SettingsStore {
  /** 同步。首屏立即可用，可能过期或不完整。 */
  readSnapshot(): Partial<AppSettings>;
  writeSnapshot(settings: AppSettings): void;
  load(): Promise<SettingsSnapshot>;
  patch(patch: Partial<AppSettings>): Promise<AppSettings>;
}

/**
 * 设置的同步器：乐观更新 + 合并串行 + 失败回滚。
 *
 * 刻意与 React 无关，因为这里是唯一有分支逻辑的地方，而 Vitest 不收集 .tsx。
 * SettingsContext.tsx 只是它的一层薄壳。
 */
export class SettingsSync {
  private settings: AppSettings;
  /** 上一个服务端确认过的值。写失败时回滚到它。 */
  private confirmed: AppSettings;
  private pending: Partial<AppSettings> | null = null;
  private flushing: Promise<void> | null = null;

  constructor(
    private readonly store: SettingsStore,
    private readonly onChange: (settings: AppSettings) => void,
    private readonly onError: (message: string | null) => void,
  ) {
    // 快照过一遍 resolveSettings：脏快照（手改过、版本更迭遗留）不该污染界面。
    this.settings = resolveSettings(this.store.readSnapshot() as Record<string, unknown>);
    this.confirmed = { ...DEFAULT_SETTINGS };
  }

  get current(): AppSettings {
    return this.settings;
  }

  async init(): Promise<void> {
    try {
      const snapshot = await this.store.load();
      this.confirmed = snapshot.settings;
      this.settings = snapshot.settings;
      this.store.writeSnapshot(snapshot.settings);
      this.onChange(snapshot.settings);
      this.onError(null);
    } catch (err) {
      // 拉不到就继续用快照：后端没起来时界面不该退回默认主题。
      this.onError(err instanceof Error ? err.message : String(err));
    }
  }

  update(patch: Partial<AppSettings>): void {
    if (Object.keys(patch).length === 0) return;
    this.settings = { ...this.settings, ...patch };
    this.onChange(this.settings);
    this.pending = { ...(this.pending ?? {}), ...patch };
    void this.flush();
  }

  /** 测试与卸载用：等到队列排空。 */
  async whenIdle(): Promise<void> {
    while (this.flushing !== null) {
      await this.flushing;
    }
  }

  private async flush(): Promise<void> {
    if (this.flushing !== null || this.pending === null) return;
    const batch = this.pending;
    this.pending = null;
    this.flushing = this.send(batch).finally(() => {
      this.flushing = null;
    });
    await this.flushing;
    if (this.pending !== null) await this.flush();
  }

  private async send(batch: Partial<AppSettings>): Promise<void> {
    try {
      const confirmed = await this.store.patch(batch);
      this.confirmed = confirmed;
      // 队列里还有后续改动时不要把界面拽回服务端值，否则连续操作会闪。
      if (this.pending === null) {
        this.settings = confirmed;
        this.onChange(confirmed);
      }
      this.store.writeSnapshot(confirmed);
      this.onError(null);
    } catch (err) {
      // 「界面已改、库里没改」正是这次要消灭的不一致，所以失败就回滚。
      this.pending = null;
      this.settings = this.confirmed;
      this.onChange(this.confirmed);
      this.onError(err instanceof Error ? err.message : String(err));
    }
  }
}
