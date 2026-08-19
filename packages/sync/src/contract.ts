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
