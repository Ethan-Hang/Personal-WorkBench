/**
 * 应用级设置（不属于任何模块）。
 *
 * 这里刻意只有**一张表**：类型、默认值、校验三者全从 SETTINGS_CODECS 推导。
 * 加一个设置项 = 加一行，不改数据库表、不写迁移——存储侧是 KV，schema 就在这里。
 *
 * 不引 zod：codec 的 parse 是手写纯函数，与 ITEM_KINDS / ITEM_STATUSES 的常量风格一致，
 * 也维持 core「零 IO、依赖极薄」。服务端校验入参与客户端校验响应共用这一份，
 * 因此不可能出现两边口径各改一半。
 */

export interface SettingCodec<T> {
  readonly default: T;
  /** 不合法返回 undefined，不抛。「怎么处理不合法」由调用方决定。 */
  parse(raw: unknown): T | undefined;
}

function oneOf<const T extends readonly string[]>(
  values: T,
  fallback: T[number],
): SettingCodec<T[number]> {
  return {
    default: fallback,
    parse: (raw) =>
      typeof raw === 'string' && (values as readonly string[]).includes(raw)
        ? (raw as T[number])
        : undefined,
  };
}

function bool(fallback: boolean): SettingCodec<boolean> {
  return {
    default: fallback,
    parse: (raw) => (typeof raw === 'boolean' ? raw : undefined),
  };
}

/**
 * 时区的合法值域是**真实 IANA id**，而不是 UI 那份 WORLD_TIMEZONES 展示列表——
 * 后者是选择器的取材范围，把它当值域会让手动设置的冷门时区被判为脏值。
 */
function timezone(fallback: string): SettingCodec<string> {
  return {
    default: fallback,
    parse: (raw) => {
      if (typeof raw !== 'string' || raw.length === 0) return undefined;
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: raw });
        return raw;
      } catch {
        return undefined;
      }
    },
  };
}

export const SETTINGS_CODECS = {
  'theme.mode': oneOf(['light', 'dark', 'system'] as const, 'system'),
  'theme.palette': oneOf(['warm', 'forest', 'ocean', 'amber', 'mono'] as const, 'warm'),
  'timezone.id': timezone('Asia/Shanghai'),
  'timezone.dstMode': oneOf(['auto', 'standard', 'daylight'] as const, 'auto'),
  'workbench.showGreeting': bool(true),
  'workbench.autoExpandOverdue': bool(false),
  'workbench.enableAnimations': bool(true),
  'workbench.showCompletedTasks': bool(true),
} satisfies Record<string, SettingCodec<unknown>>;

export type SettingKey = keyof typeof SETTINGS_CODECS;

export type AppSettings = {
  [K in SettingKey]: (typeof SETTINGS_CODECS)[K] extends SettingCodec<infer T> ? T : never;
};

export const SETTING_KEYS = Object.keys(SETTINGS_CODECS) as readonly SettingKey[];

export const DEFAULT_SETTINGS: Readonly<AppSettings> = Object.fromEntries(
  SETTING_KEYS.map((key) => [key, SETTINGS_CODECS[key].default]),
) as AppSettings;

export function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS_CODECS, key);
}

/**
 * 库里的原始值 → 完整设置。缺键补默认，脏值静默回落默认，未知键忽略。
 *
 * 读取路径**永不失败**：一条脏行不该让整个界面打不开。
 * 写入路径（parseSettingsPatch）相反，脏值直接 400——那是调用方的 bug，遮蔽只会更难查。
 */
export function resolveSettings(raw: Record<string, unknown>): AppSettings {
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const key of SETTING_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    const parsed = SETTINGS_CODECS[key].parse(raw[key]);
    if (parsed !== undefined) out[key] = parsed;
  }
  return out as AppSettings;
}

export type SettingsPatchResult =
  { ok: true; patch: Partial<AppSettings> } | { ok: false; error: string };

/** 写入路径的校验。服务端与客户端共用。 */
export function parseSettingsPatch(input: unknown): SettingsPatchResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: '设置补丁须为对象' };
  }
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!isSettingKey(key)) {
      return { ok: false, error: `未知设置项：${key}` };
    }
    const parsed = SETTINGS_CODECS[key].parse(value);
    if (parsed === undefined) {
      return { ok: false, error: `设置项 ${key} 的值不合法` };
    }
    patch[key] = parsed;
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: '设置补丁不能为空' };
  }
  return { ok: true, patch: patch as Partial<AppSettings> };
}

/**
 * core 定义抽象，data 提供实现（spec §9 DIP）。
 * getAll 返回**未解析**的原始值：data 只负责存取，
 * 「什么算合法设置」是领域知识，留在 resolveSettings。
 */
export interface SettingsRepository {
  getAll(): Promise<Record<string, unknown>>;
  /** upsert，单事务。空补丁是 no-op。 */
  setMany(patch: Partial<AppSettings>): Promise<void>;
}

/**
 * 设置端点的路径。服务端注册与客户端请求共用同一份，不可能各改一半。
 *
 * 模块把路径放在自己的 contract.ts 里；设置没有模块，它的 contract 天然属于 core。
 * 放这儿还有一个硬理由：packages/web 不能依赖 packages/server
 * （会把 Fastify 拉进浏览器产物），路径必须落在两边都能 import 的地方。
 */
export const SETTINGS_API = {
  root: () => '/api/settings',
} as const;
