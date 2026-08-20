import {
  SETTINGS_API,
  SETTINGS_CODECS,
  isSettingKey,
  resolveSettings,
  type AppSettings,
  type SettingKey,
} from '@workbench/core';
import type { SettingsSnapshot, SettingsStore } from '@workbench/ui';

export const SNAPSHOT_KEY = 'workbench_settings';
export const MIGRATED_FLAG = 'workbench_settings_migrated';

/** 旧的散键 → core 的设置键。迁移完就删。 */
const LEGACY_SCALAR_KEYS: ReadonlyArray<[string, SettingKey]> = [
  ['workbench_theme_mode', 'theme.mode'],
  ['workbench_theme_palette', 'theme.palette'],
  ['workbench_timezone', 'timezone.id'],
  ['workbench_dst_mode', 'timezone.dstMode'],
];

/** 旧的偏好是一个 JSON blob，里面四个驼峰键。 */
const LEGACY_PREFERENCES_KEY = 'workbench_preferences';
const LEGACY_PREFERENCE_FIELDS: ReadonlyArray<[string, SettingKey]> = [
  ['showGreeting', 'workbench.showGreeting'],
  ['autoExpandOverdue', 'workbench.autoExpandOverdue'],
  ['enableAnimations', 'workbench.enableAnimations'],
  ['showCompletedTasks', 'workbench.showCompletedTasks'],
];

function defaultStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isSettingsResponse(body: unknown): body is SettingsSnapshot {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { settings?: unknown }).settings === 'object' &&
    (body as { settings?: unknown }).settings !== null &&
    Array.isArray((body as { storedKeys?: unknown }).storedKeys)
  );
}

export function createHttpSettingsStore(
  deps: { fetchFn?: typeof fetch; storage?: Storage | null } = {},
): SettingsStore {
  const doFetch = deps.fetchFn ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;

  function read(key: string): string | null {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  function write(key: string, value: string): void {
    try {
      storage?.setItem(key, value);
    } catch {
      // 隐身模式或配额超限：静默降级。快照丢了只是首屏会闪一下，不是错误。
    }
  }

  function remove(key: string): void {
    try {
      storage?.removeItem(key);
    } catch {
      // 同上
    }
  }

  async function request(init: RequestInit): Promise<SettingsSnapshot> {
    const res = await doFetch(SETTINGS_API.root(), init);
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const err = body as { error?: string; requestId?: string } | null;
      const suffix = err?.requestId ? `（请求编号 ${err.requestId}）` : '';
      throw new Error(`${err?.error ?? `设置请求失败：HTTP ${res.status}`}${suffix}`);
    }
    if (!isSettingsResponse(body)) {
      throw new Error('设置响应形状不符合契约');
    }
    // 服务端返回的也过一遍 codec：接缝上大声失败，好过页面静默变空。
    return {
      settings: resolveSettings(body.settings as unknown as Record<string, unknown>),
      storedKeys: body.storedKeys.filter((k): k is SettingKey => isSettingKey(k)),
    };
  }

  /** 读旧的 localStorage，逐项过 codec，脏值丢掉。 */
  function readLegacy(): Partial<AppSettings> {
    const out: Record<string, unknown> = {};
    for (const [legacyKey, settingKey] of LEGACY_SCALAR_KEYS) {
      const raw = read(legacyKey);
      if (raw === null) continue;
      const parsed = SETTINGS_CODECS[settingKey].parse(raw);
      if (parsed !== undefined) out[settingKey] = parsed;
    }
    const prefsRaw = read(LEGACY_PREFERENCES_KEY);
    if (prefsRaw !== null) {
      try {
        const prefs = JSON.parse(prefsRaw) as Record<string, unknown>;
        for (const [field, settingKey] of LEGACY_PREFERENCE_FIELDS) {
          const parsed = SETTINGS_CODECS[settingKey].parse(prefs[field]);
          if (parsed !== undefined) out[settingKey] = parsed;
        }
      } catch {
        // 坏的偏好 blob 直接跳过
      }
    }
    return out as Partial<AppSettings>;
  }

  function clearLegacy(): void {
    for (const [legacyKey] of LEGACY_SCALAR_KEYS) remove(legacyKey);
    remove(LEGACY_PREFERENCES_KEY);
    write(MIGRATED_FLAG, '1');
  }

  return {
    readSnapshot() {
      const raw = read(SNAPSHOT_KEY);
      if (raw === null) return {};
      try {
        return JSON.parse(raw) as Partial<AppSettings>;
      } catch {
        return {};
      }
    },

    writeSnapshot(settings) {
      write(SNAPSHOT_KEY, JSON.stringify(settings));
    },

    async load() {
      const snapshot = await request({ method: 'GET' });
      if (read(MIGRATED_FLAG) !== null) return snapshot;

      // 一次性迁移：只补库里**没有**的键，绝不覆盖已落库的值。
      const legacy = readLegacy();
      const missing = Object.fromEntries(
        Object.entries(legacy).filter(([key]) => !snapshot.storedKeys.includes(key as SettingKey)),
      ) as Partial<AppSettings>;

      if (Object.keys(missing).length === 0) {
        clearLegacy();
        return snapshot;
      }

      // 失败就不落标记、不删旧键——下次启动还能再来一遍。
      try {
        const merged = await request({
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ settings: missing }),
        });
        clearLegacy();
        return merged;
      } catch {
        return snapshot;
      }
    },

    async patch(patch) {
      const result = await request({
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ settings: patch }),
      });
      return result.settings;
    },
  };
}
