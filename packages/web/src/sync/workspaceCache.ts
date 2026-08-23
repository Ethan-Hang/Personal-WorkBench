/**
 * 工作区缓存失效策略——「什么时候该清空 React Query 缓存」这条跨切面规则的唯一出处。
 *
 * 收敛前，`queryClient.invalidateQueries()`（不带 filters，即全量清空）以裸调用形式
 * 出现在 **11 处**，散在 5 个文件里：AccountsPanel 3 处、LocalImportModal 3 处、
 * RestoreOverlay 2 处、BackupPanel 2 处、GistSyncPanel 1 处。每一处都各自判断
 * 「这里要不要清」，规则只存在于人的记忆里。
 *
 * 漏一处的症状是 CLAUDE.md 说的「数据串了」：上一个账号的数据残留在界面上，
 * 且因为有乐观更新，它会以很难复现的方式间歇出现——这是本仓库里最难查的一类 bug。
 *
 * 收敛后每个调用点必须说明**它属于哪一种变化**，策略集中在下面这张表里。
 *
 * 这 11 处其实代表两类不同的事件，此前混在一起：
 *
 * - **底层库换了**（切账号、恢复、导入覆盖、回退到快照）：缓存里每一条都属于
 *   另一个库文件了，全量失效是唯一正确的做法。
 * - **只有元数据变了**（绑定 / 解绑 GitHub、拉取云端设置）：按 ADR-0019，
 *   绑定与解绑**一个库文件都不动**。这里目前**仍然全量失效**，是刻意保守——
 *   收窄成只失效 `['accounts']` 需要先确认没有派生查询依赖账号元数据，
 *   那是一次单独的、需要验证的改动，不该混在这次收敛里悄悄发生。
 *   策略写在表里而不是散在各处，正是为了让将来那次收窄成为一处可见的改动。
 */

/** React Query `QueryClient` 里本模块用得到的那一点点。结构类型，便于测试。 */
export interface InvalidatingClient {
  invalidateQueries(...args: never[]): Promise<void>;
}

/** 触发缓存失效的四种变化。**新增一种时必须在下面的策略表里补齐**，否则编译不过。 */
export type WorkspaceChange =
  /** 当前账号指向的库文件换了：切账号、恢复备份、覆盖导入、回退到快照。 */
  | 'active-database-changed'
  /** 账号的元数据变了：绑定 / 解绑 GitHub、改名、改头像。库文件不动。 */
  | 'account-metadata-changed'
  /** 从云端拉取设置并覆写了本地。 */
  | 'settings-pulled'
  /** 用户在设置页显式点了「清缓存」。 */
  | 'manual-cache-clear';

/** `all` = 不带 filters 的全量失效。目前四种变化都是 `all`，理由见文件抬头。 */
export const WORKSPACE_CHANGE_POLICY: Record<WorkspaceChange, 'all'> = {
  'active-database-changed': 'all',
  'account-metadata-changed': 'all',
  'settings-pulled': 'all',
  'manual-cache-clear': 'all',
};

/**
 * 按变化种类失效缓存。
 *
 * **返回的 promise 要 await。** 切账号后若不等失效完成就继续渲染，
 * 会闪一下上一个账号的数据。
 */
export async function invalidateFor(
  client: InvalidatingClient,
  change: WorkspaceChange,
): Promise<void> {
  const policy = WORKSPACE_CHANGE_POLICY[change];
  if (policy === 'all') {
    await client.invalidateQueries();
    return;
  }
  // 目前只有 'all' 一种策略；将来加窄策略时，这里不要留宽松的 default，
  // 让 TypeScript 在漏掉分支时直接报错。
  const exhaustive: never = policy;
  return exhaustive;
}
