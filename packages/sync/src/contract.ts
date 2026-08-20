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
  /**
   * 这份备份为什么存在（「恢复前」「导入前」…）。**可选**：旧的 meta 没有这个字段，
   * 加成必填会让所有既有备份一夜之间变成「不完整」。手动备份不带它。
   */
  reason: z.string().optional(),
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

/**
 * 本地备份的前后端接缝（TASK-044）。与 `SYNC_API` 并列而不是并入：本地与云端的
 * 配置模型不同（目录 vs 凭据），共用一组端点会得到一个装不下任何一方的形状。
 * 列表项复用 `backupListItemSchema`——产物本来就完全同形。
 */
export const LOCAL_BACKUP_API = {
  config: () => '/api/local-backup/config',
  run: () => '/api/local-backup/run',
  list: () => '/api/local-backup/list',
  item: (name: string) =>
    name === NAME_PARAM
      ? `/api/local-backup/${NAME_PARAM}`
      : `/api/local-backup/${encodeURIComponent(name)}`,
} as const;

export const localBackupConfigSchema = z.object({
  /** 用户设的落点。空串 = 用默认目录。 */
  targetDir: z.string(),
  /** 实际落点的绝对路径。界面必须显示它——否则用户无从知道备份到底在哪。 */
  resolvedDir: z.string(),
  autoEnabled: z.boolean(),
  retentionCount: z.number().int().min(1).max(100),
});
export type LocalBackupConfig = z.infer<typeof localBackupConfigSchema>;

export const localBackupConfigPatchSchema = z.object({
  targetDir: z.string().optional(),
  autoEnabled: z.boolean().optional(),
  retentionCount: z.number().int().min(1).max(100).optional(),
});
export type LocalBackupConfigPatch = z.infer<typeof localBackupConfigPatchSchema>;

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

export const githubCredentialSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.string().min(1),
  scope: z.string(),
  refreshToken: z.string().min(1).optional(),
  expiresIn: z.number().int().positive().optional(),
  refreshTokenExpiresIn: z.number().int().positive().optional(),
});

const githubAuthorizedSchema = z.object({
  status: z.literal('authorized'),
  credential: githubCredentialSchema,
  user: z.object({
    login: z.string().min(1),
    id: z.number().int().nonnegative(),
    avatarUrl: z.string().optional(),
  }),
});

export const githubDevicePollResponseSchema = z.discriminatedUnion('status', [
  githubPendingSchema,
  githubSlowDownSchema,
  githubExpiredSchema,
  githubDeniedSchema,
  githubAuthorizedSchema,
]);

export type GitHubCredential = z.infer<typeof githubCredentialSchema>;
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
  avatarUrl: z.string().optional(),
});

/**
 * 账号的对外形状。**刻意不含 `dbDir`**：那是服务端的文件布局细节，
 * 界面用不到，露出去只会让人以为它可以改。
 */
export const accountSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['local', 'github']),
  displayName: z.string().min(1),
  avatar: z.string().optional(),
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

export const updateAccountBodySchema = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  avatar: z.string().nullable().optional(),
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
  credential: githubCredentialSchema.optional(),
});

export type GitHubBinding = z.infer<typeof githubBindingSchema>;
export type AccountView = z.infer<typeof accountSchema>;
export type AccountsResponse = z.infer<typeof accountsResponseSchema>;
export type CreateAccountBody = z.infer<typeof createAccountBodySchema>;
export type UpdateAccountBody = z.infer<typeof updateAccountBodySchema>;
export type SwitchAccountBody = z.infer<typeof switchAccountBodySchema>;
export type BindDirection = (typeof BIND_DIRECTIONS)[number];
export type BindGithubBody = z.infer<typeof bindGithubBodySchema>;

/**
 * 恢复流程与状态机契约（设计 §6 与 §9）。
 */
export const RESTORE_API = {
  preflight: () => '/api/restore/preflight',
  confirm: () => '/api/restore/confirm',
  rollback: () => '/api/restore/rollback',
  state: () => '/api/restore/state',
} as const;

export const restoreDiffItemSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
});

export const restoreModifiedItemSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  localTitle: z.string().optional(),
});

export const restoreModuleTableDiffSchema = z.object({
  table: z.string().min(1),
  moduleId: z.string().min(1),
  moduleName: z.string().optional(),
  localCount: z.number().int().nonnegative(),
  remoteCount: z.number().int().nonnegative(),
});

export const restoreDiffSchema = z.object({
  core: z.object({
    added: z.array(restoreDiffItemSchema),
    removed: z.array(restoreDiffItemSchema),
    modified: z.array(restoreModifiedItemSchema),
  }),
  modules: z.array(restoreModuleTableDiffSchema),
});

export const restorePreflightBodySchema = z.object({
  name: z.string().min(1),
});

export const restorePreflightResponseSchema = z.object({
  name: z.string().min(1),
  compatible: z.boolean(),
  reason: z.string().optional(),
  meta: backupMetaSchema,
  diff: restoreDiffSchema,
});

export const restoreConfirmBodySchema = z.object({
  name: z.string().min(1),
});

export const restoreStateSchema = z.object({
  state: z.enum(['idle', 'restoring', 'switching', 'error']),
  step: z.string().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
  canRollback: z.boolean().optional(),
  generation: z.number().int().nonnegative().optional(),
});

export type RestoreDiffItem = z.infer<typeof restoreDiffItemSchema>;
export type RestoreModifiedItem = z.infer<typeof restoreModifiedItemSchema>;
export type RestoreModuleTableDiff = z.infer<typeof restoreModuleTableDiffSchema>;
export type RestoreDiff = z.infer<typeof restoreDiffSchema>;
export type RestorePreflightBody = z.infer<typeof restorePreflightBodySchema>;
export type RestorePreflightResponse = z.infer<typeof restorePreflightResponseSchema>;
export type RestoreConfirmBody = z.infer<typeof restoreConfirmBodySchema>;
export type RestoreState = z.infer<typeof restoreStateSchema>;

/**
 * 本地文件导入的前后端接缝（TASK-046）。与 `RESTORE_API` 分开是因为入参不同：
 * 云端认的是备份**名字**，本地认的是一个**文件路径**——用户可能从 U 盘里挑一份
 * 从没出现在任何列表里的备份。
 */
export const LOCAL_IMPORT_API = {
  preflight: () => '/api/local-import/preflight',
  confirm: () => '/api/local-import/confirm',
} as const;

export const localImportPreflightBodySchema = z.object({
  filePath: z.string().min(1),
});
export type LocalImportPreflightBody = z.infer<typeof localImportPreflightBodySchema>;

/** 确认导入。`filePath` 必须与刚才预检的那一个相同，否则 409。 */
export const localImportConfirmBodySchema = z.object({
  filePath: z.string().min(1),
});
export type LocalImportConfirmBody = z.infer<typeof localImportConfirmBodySchema>;

export const localImportPreflightResponseSchema = z.object({
  /** 这里的 name 是文件的绝对路径——confirm 用它认领刚才那次预检。 */
  name: z.string().min(1),
  compatible: z.boolean(),
  reason: z.string().optional(),
  /**
   * **可空**，这是与云端预检最大的不同：旁挂的 `.meta.json` 可能根本不存在
   * （用户只拷了 `.db.gz`）。兼容性判断因此不依赖它，改为读库里的真实水位。
   */
  meta: backupMetaSchema.nullable(),
  diff: restoreDiffSchema,
});
export type LocalImportPreflightResponse = z.infer<typeof localImportPreflightResponseSchema>;

/**
 * Gist 设置同步的前后端接缝（设计 §8）。
 *
 * Gist 里只有**设置与 WebDAV 凭据**，且是加密后的信封。
 * **GitHub token 永远只在本地，绝不进 Gist**；业务数据同样不进（单文件 1MB 上限）。
 */
export const GIST_SYNC_API = {
  status: () => '/api/sync/status',
  unlock: () => '/api/sync/unlock',
  push: () => '/api/sync/push',
  pull: () => '/api/sync/pull',
} as const;

export const syncStatusSchema = z.object({
  /** 当前账号绑了 GitHub 且本地有可用 token。 */
  linked: z.boolean(),
  /**
   * 本机凭据是否受系统保管库保护。为 false 时设置页**必须明示**
   * 「本机凭据未受系统保管库保护」——这是降级不是等价选项，不得静默发生。
   */
  protectedByOsVault: z.boolean(),
  /** 本进程是否已拿到同步口令。口令不落盘（除非有保管库且用户选了记住）。 */
  unlocked: z.boolean(),
  gistId: z.string().nullable(),
  /** 云端信封的 header，**不解密就能读**。 */
  cloudUpdatedAt: z.string().nullable(),
  cloudDevice: z.string().nullable(),
  /** 本端上次见到的云端版本。与 cloudUpdatedAt 不等即为冲突。 */
  lastSeenUpdatedAt: z.string().nullable(),
  /** 云端被另一台设备改过。**刻意不自动合并**，等用户选方向。 */
  conflict: z.boolean(),
  /** 绑定时选了方向但当时还没解锁，将在下次解锁后执行。 */
  pendingDirection: z.enum(BIND_DIRECTIONS).nullable(),
});

export const syncUnlockBodySchema = z.object({
  passphrase: z.string().min(1),
  /** 记住口令。**没有系统保管库时服务端会拒绝**——口令绝不写进明文文件。 */
  remember: z.boolean().optional(),
});

/** 推送时若云端更新，必须显式带上方向才会覆盖。 */
export const syncPushBodySchema = z.object({ force: z.boolean().optional() });

export type SyncStatus = z.infer<typeof syncStatusSchema>;
export type SyncUnlockBody = z.infer<typeof syncUnlockBodySchema>;
export type SyncPushBody = z.infer<typeof syncPushBodySchema>;
