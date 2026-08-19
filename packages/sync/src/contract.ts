import { z } from 'zod';

/** 备份文件名在路径里的占位符。传它得到 Fastify 注册模式，传真实名字得到请求路径。 */
export const NAME_PARAM = ':name';

export const SYNC_API = {
  backupConfig: () => '/api/backup/config',
  backupRun: () => '/api/backup/run',
  backupList: () => '/api/backup/list',
  backupItem: (name: string) =>
    name === NAME_PARAM ? `/api/backup/${NAME_PARAM}` : `/api/backup/${encodeURIComponent(name)}`,
} as const;

/**
 * 旁挂的备份元数据。不内嵌进快照：列表页要判断「这份能不能恢复到当前代码」，
 * 不该为此下载所有数据库。
 */
export const backupMetaSchema = z.object({
  v: z.literal(1),
  createdAt: z.string(),
  accountId: z.string(),
  device: z.string(),
  appVersion: z.string(),
  /** 每条迁移谱系各记一个水位。 */
  migrations: z.record(z.string(), z.number()),
  counts: z.record(z.string(), z.number()),
  bytes: z.number().int().nonnegative(),
  sha256: z.string(),
});
export type BackupMeta = z.infer<typeof backupMetaSchema>;

export const backupListItemSchema = z.object({
  name: z.string(),
  /** meta 缺失 = 上传中断留下的孤儿，不可恢复，可清理。 */
  complete: z.boolean(),
  meta: backupMetaSchema.nullable(),
});
export type BackupListItem = z.infer<typeof backupListItemSchema>;

export const backupConfigSchema = z.object({
  configured: z.boolean(),
  url: z.string().nullable(),
  username: z.string().nullable(),
  autoEnabled: z.boolean(),
  retentionCount: z.number().int().min(1).max(100),
});
export type BackupConfig = z.infer<typeof backupConfigSchema>;

/** 写配置。password 只进不出——读接口永远不回传它。 */
export const backupConfigPatchSchema = z.object({
  url: z.url().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  autoEnabled: z.boolean().optional(),
  retentionCount: z.number().int().min(1).max(100).optional(),
});
export type BackupConfigPatch = z.infer<typeof backupConfigPatchSchema>;

export const GITHUB_AUTH_API = {
  device: '/api/auth/github/device',
  poll: '/api/auth/github/device/poll',
} as const;

export const githubDeviceCodeSchema = z.object({
  deviceCode: z.string().min(1),
  userCode: z.string().min(1),
  verificationUri: z.url(),
  expiresIn: z.number().int().positive(),
  interval: z.number().int().positive(),
});

export const githubDevicePollBodySchema = z.object({
  deviceCode: z.string().min(1),
  interval: z.number().int().positive(),
});

const githubPendingSchema = z.object({
  status: z.literal('pending'),
  interval: z.number().int().positive(),
});

const githubSlowDownSchema = z.object({
  status: z.literal('slow_down'),
  interval: z.number().int().positive(),
});

const githubExpiredSchema = z.object({ status: z.literal('expired') });
const githubDeniedSchema = z.object({ status: z.literal('denied') });

const githubAuthorizedSchema = z.object({
  status: z.literal('authorized'),
  credential: z.object({
    accessToken: z.string().min(1),
    tokenType: z.string().min(1),
    scope: z.string(),
    refreshToken: z.string().min(1).optional(),
    expiresIn: z.number().int().positive().optional(),
    refreshTokenExpiresIn: z.number().int().positive().optional(),
  }),
  user: z.object({
    login: z.string().min(1),
    id: z.number().int().nonnegative(),
  }),
});

export const githubDevicePollResponseSchema = z.discriminatedUnion('status', [
  githubPendingSchema,
  githubSlowDownSchema,
  githubExpiredSchema,
  githubDeniedSchema,
  githubAuthorizedSchema,
]);

export type GitHubDeviceCode = z.infer<typeof githubDeviceCodeSchema>;
export type GitHubDevicePollBody = z.infer<typeof githubDevicePollBodySchema>;
export type GitHubDevicePollResponse = z.infer<typeof githubDevicePollResponseSchema>;

/**
 * 账号体系的前后端接缝（设计 §9）。
 *
 * 路径参数占位符：把 `ACCOUNT_ID_PARAM` 传给构造函数得到 Fastify 注册模式，
 * 传真实 id 得到转义后的请求路径。与模块 contract.ts 的 `ID_PARAM` 同形。
 */
export const ACCOUNT_ID_PARAM = ':id';

function accountSegment(value: string): string {
  return value === ACCOUNT_ID_PARAM ? value : encodeURIComponent(value);
}

export const ACCOUNTS_API = {
  root: () => '/api/accounts',
  active: () => '/api/accounts/active',
  byId: (id: string) => `/api/accounts/${accountSegment(id)}`,
  bindGithub: (id: string) => `/api/accounts/${accountSegment(id)}/github/bind`,
  github: (id: string) => `/api/accounts/${accountSegment(id)}/github`,
} as const;

export const githubBindingSchema = z.object({
  login: z.string().min(1),
  userId: z.number().int().nonnegative(),
  gistId: z.string().min(1).optional(),
});

/**
 * 账号的对外形状。**刻意不含 `dbDir`**：那是服务端的文件布局细节，
 * 界面用不到，露出去只会让人以为它可以改。
 */
export const accountSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['local', 'github']),
  displayName: z.string().min(1),
  createdAt: z.string().min(1),
  lastUsedAt: z.string().min(1),
  github: githubBindingSchema.optional(),
});

export const accountsResponseSchema = z.object({
  activeId: z.string().min(1),
  accounts: z.array(accountSchema),
});

export const createAccountBodySchema = z.object({
  displayName: z.string().trim().min(1).max(40),
});

export const switchAccountBodySchema = z.object({ id: z.string().min(1) });

/**
 * 绑定方向。**只作用于设置与凭据，不动数据库**——想拉云端数据要走恢复流程
 * （差异 → 确认 → 可回退），否则一次绑定就会静默干掉本地库。
 */
export const BIND_DIRECTIONS = ['cloud-to-local', 'local-to-cloud'] as const;

export const bindGithubBodySchema = z.object({
  direction: z.enum(BIND_DIRECTIONS),
  github: githubBindingSchema,
});

export type GitHubBinding = z.infer<typeof githubBindingSchema>;
export type AccountView = z.infer<typeof accountSchema>;
export type AccountsResponse = z.infer<typeof accountsResponseSchema>;
export type CreateAccountBody = z.infer<typeof createAccountBodySchema>;
export type SwitchAccountBody = z.infer<typeof switchAccountBodySchema>;
export type BindDirection = (typeof BIND_DIRECTIONS)[number];
export type BindGithubBody = z.infer<typeof bindGithubBodySchema>;
