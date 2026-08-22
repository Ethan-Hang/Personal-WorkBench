import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BackupListItem, BackupConfigPatch } from '@workbench/sync/contract';
import {
  Button,
  Chip,
  Field,
  controlClass,
  Switch,
  IconAlertCircle,
  IconCheck,
  IconClock,
  IconCloud,
  IconDatabase,
  IconPlus,
  IconRefreshCw,
  IconShield,
  IconTrash,
  Modal,
  useTimezone,
} from '@workbench/ui';
import {
  confirmRestore,
  deleteBackup,
  fetchBackupConfig,
  fetchBackupList,
  runBackup,
  updateBackupConfig,
} from './backupApi.js';
import { RestoreDiffModal } from './RestoreDiffModal.js';
import { parseRetentionCount } from './backupForm.js';
import { invalidateFor } from './workspaceCache.js';

export function BackupPanel() {
  const queryClient = useQueryClient();
  const { formatUtcToLocal } = useTimezone();

  // 1. WebDAV 配置查询
  const { data: config } = useQuery({
    queryKey: ['backup-config'],
    queryFn: () => fetchBackupConfig(),
  });

  // 2. 云端备份列表查询
  const {
    data: backups = [],
    isLoading: isBackupsLoading,
    isError: isBackupsError,
    error: backupsError,
    refetch: refetchBackups,
  } = useQuery({
    queryKey: ['backup-list'],
    queryFn: () => fetchBackupList(),
  });

  // Toast 提示条
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }

  // 缓存刷新状态
  const [cacheCleared, setCacheCleared] = useState(false);
  function handleClearCache() {
    void invalidateFor(queryClient, 'manual-cache-clear');
    setCacheCleared(true);
    setTimeout(() => setCacheCleared(false), 2500);
  }

  // WebDAV 表单状态
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [formUrl, setFormUrl] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRetention, setFormRetention] = useState(10);
  const [formAutoEnabled, setFormAutoEnabled] = useState(false);
  const [configSaveError, setConfigSaveError] = useState<string | null>(null);

  function openConfigEditor() {
    setFormUrl(config?.url || 'https://dav.jianguoyun.com/dav/');
    setFormUsername(config?.username || '');
    setFormPassword('');
    setFormRetention(config?.retentionCount || 10);
    setFormAutoEnabled(config?.autoEnabled || false);
    setConfigSaveError(null);
    setIsEditingConfig(true);
  }

  // 保存配置 Mutation
  const configMutation = useMutation({
    mutationFn: (patch: BackupConfigPatch) => updateBackupConfig(patch),
    onSuccess: (res) => {
      void queryClient.setQueryData(['backup-config'], res);
      setIsEditingConfig(false);
      setConfigSaveError(null);
      showToast('WebDAV 备份配置已保存');
    },
    onError: (err: Error) => {
      setConfigSaveError(err.message);
    },
  });

  function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    // 留空才回退默认值；0 / 非数字一律报错而不是被静默改写（见 backupForm.ts）
    const retention = parseRetentionCount(formRetention, 10);
    if (!retention.ok) {
      setConfigSaveError(retention.error);
      return;
    }
    const patch: BackupConfigPatch = {
      url: formUrl.trim(),
      username: formUsername.trim(),
      autoEnabled: formAutoEnabled,
      retentionCount: retention.value,
    };
    if (formPassword.trim()) {
      patch.password = formPassword.trim();
    }
    configMutation.mutate(patch);
  }

  // 快捷切换自动备份 Mutation
  const toggleAutoMutation = useMutation({
    mutationFn: (autoEnabled: boolean) => updateBackupConfig({ autoEnabled }),
    onSuccess: (res) => {
      void queryClient.setQueryData(['backup-config'], res);
      showToast(res.autoEnabled ? '自动备份已启用' : '自动备份已关闭');
    },
    onError: (err: Error) => {
      showToast(`保存失败：${err.message}`);
    },
  });

  // 立即备份 Mutation
  const backupMutation = useMutation({
    mutationFn: () => runBackup(),
    onSuccess: () => {
      void refetchBackups();
      showToast('数据快照已成功上传至 WebDAV 云端');
    },
    onError: (err: Error) => {
      showToast(`备份失败：${err.message}`);
    },
  });

  // 删除备份状态
  const [deleteTarget, setDeleteTarget] = useState<BackupListItem | null>(null);
  const deleteMutation = useMutation({
    mutationFn: (name: string) => deleteBackup(name),
    onSuccess: () => {
      void refetchBackups();
      setDeleteTarget(null);
      showToast('已删除该云端备份');
    },
    onError: (err: Error) => {
      showToast(`删除失败：${err.message}`);
    },
  });

  // 恢复比对模态框状态
  const [diffTargetName, setDiffTargetName] = useState<string | null>(null);
  const restoreMutation = useMutation({
    mutationFn: (name: string) => confirmRestore(name),
    onSuccess: async () => {
      setDiffTargetName(null);
      // 恢复换掉了库文件
      await invalidateFor(queryClient, 'active-database-changed');
      showToast('数据恢复成功，工作区已更新');
    },
    onError: (err: Error) => {
      showToast(`恢复失败：${err.message}`);
    },
  });

  return (
    <div className="space-y-6 animate-slide-right-in">
      {/* Toast 提示条 */}
      {toastMessage && (
        <div className="rounded-panel border border-accent/30 bg-accent-soft px-4 py-2.5 text-xs font-semibold text-accent animate-fade-in flex items-center gap-2">
          <IconCheck size={14} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 模块 1：Windows 设置风格的 WebDAV 状态 Hero Banner */}
      {/* ========================================================================= */}
      <div className="rounded-panel border border-line bg-surface p-5 shadow-xs transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent shadow-2xs">
              <IconCloud size={30} />
            </div>

            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base font-bold text-ink truncate leading-tight">
                  WebDAV 云端快照与备份
                </h2>
                {config?.configured ? (
                  <Chip tone="good">已配置 WebDAV</Chip>
                ) : (
                  <Chip tone="neutral">未配置云存储</Chip>
                )}
                {config?.autoEnabled && <Chip tone="accent">自动备份已开启</Chip>}
              </div>
              <div className="text-xs text-secondary leading-tight">
                {config?.configured
                  ? `云端服务：${config.url || '已就绪'} · 保留最近 ${config.retentionCount} 份快照`
                  : '支持坚果云、Nextcloud 等标准 WebDAV 服务，保障业务数据多端流转与防灾。'}
              </div>
            </div>
          </div>

          {/* 右侧主快捷按钮 */}
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
            {config?.configured ? (
              <>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={backupMutation.isPending}
                  icon={
                    backupMutation.isPending ? (
                      <IconRefreshCw size={13} className="animate-spin" />
                    ) : (
                      <IconPlus size={14} />
                    )
                  }
                  onClick={() => backupMutation.mutate()}
                >
                  {backupMutation.isPending ? '正在创建快照...' : '立即备份'}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={openConfigEditor}>
                  配置
                </Button>
              </>
            ) : (
              <Button type="button" variant="primary" size="sm" onClick={openConfigEditor}>
                配置 WebDAV 服务
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 模块 2：本地 SQLite 数据库与缓存状态 */}
      {/* ========================================================================= */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-bold text-ink">本地数据库引擎与缓存</h3>
          <p className="text-xs text-secondary">
            当前工作区的本地 SQLite 物理文件、WAL 日志与内存状态
          </p>
        </div>

        <div className="rounded-panel border border-line bg-surface overflow-hidden divide-y divide-line text-xs shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 gap-2 hover:bg-surface-2/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-good-soft text-good">
                <IconDatabase size={18} />
              </div>
              <div>
                <div className="font-semibold text-ink">SQLite 物理存储与 WAL 事务</div>
                <div className="text-muted text-[11px] font-mono mt-0.5">
                  data/local/workbench.db (自动路由至当前激活账号库)
                </div>
              </div>
            </div>
            <Chip tone="good">正常运行 · 零延迟</Chip>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 gap-2 hover:bg-surface-2/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <IconClock size={18} />
              </div>
              <div>
                <div className="font-semibold text-ink">TanStack Query 前端内存缓存</div>
                <div className="text-muted text-[11px] mt-0.5">
                  多端请求状态与乐观更新高速内存容器
                </div>
              </div>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={handleClearCache}>
              {cacheCleared ? '✓ 已刷新缓存' : '强制刷新缓存'}
            </Button>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 模块 3：自动备份策略设置卡片 */}
      {/* ========================================================================= */}
      {config && config.configured && (
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-bold text-ink">自动备份策略</h3>
            <p className="text-xs text-secondary">
              在客户端启动时检测上次备份间隔，静默保障数据安全
            </p>
          </div>

          <div className="rounded-panel border border-line bg-surface p-4 text-xs shadow-2xs space-y-3">
            <div
              onClick={() => toggleAutoMutation.mutate(!config.autoEnabled)}
              className="flex items-center justify-between cursor-pointer select-none"
            >
              <div className="pr-4 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-ink text-[13px]">启动时自动同步云端备份</span>
                  {config.autoEnabled ? (
                    <Chip tone="good">已启用</Chip>
                  ) : (
                    <Chip tone="neutral">已关闭</Chip>
                  )}
                </div>
                <p className="text-muted text-[11px] leading-relaxed">
                  开启后，系统在每次工作台启动时若检测到距离上次备份超过 24
                  小时，将自动创建一致性快照上传至 WebDAV，并自动滚动清理超出保留上限的旧备份。
                </p>
              </div>
              <Switch
                checked={config.autoEnabled}
                onChange={() => toggleAutoMutation.mutate(!config.autoEnabled)}
                tone="good"
                label="启动时自动同步云端备份"
              />
            </div>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 模块 4：云端历史快照列表与行级差异恢复 */}
      {/* ========================================================================= */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-ink">云端备份历史与恢复</h3>
            <p className="text-xs text-secondary">
              点击「比对与恢复」可直观查看行级变动并执行安全热替换
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isBackupsLoading}
            icon={<IconRefreshCw size={13} className={isBackupsLoading ? 'animate-spin' : ''} />}
            onClick={() => void refetchBackups()}
          >
            刷新列表
          </Button>
        </div>

        <div className="rounded-panel border border-line bg-surface overflow-hidden divide-y divide-line text-xs shadow-2xs">
          {!config?.configured ? (
            <div className="py-10 text-center text-xs text-muted space-y-2">
              <IconCloud size={28} className="mx-auto text-secondary/60 mb-2" />
              <p>尚未配置 WebDAV 远程存储服务</p>
              <Button type="button" variant="primary" size="sm" onClick={openConfigEditor}>
                立即配置 WebDAV
              </Button>
            </div>
          ) : isBackupsLoading ? (
            <div className="py-8 text-center text-xs text-muted">
              <IconRefreshCw size={18} className="animate-spin mx-auto mb-2 text-secondary" />
              <span>正在从 WebDAV 读取备份清单与元数据...</span>
            </div>
          ) : isBackupsError ? (
            <div className="py-6 text-center text-xs text-critical space-y-2">
              <p>获取云端备份列表失败：{(backupsError as Error)?.message}</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => void refetchBackups()}>
                重试
              </Button>
            </div>
          ) : backups.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted space-y-2">
              <p>云端暂无数据备份</p>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={backupMutation.isPending}
                onClick={() => backupMutation.mutate()}
              >
                创建第一份云端备份
              </Button>
            </div>
          ) : (
            backups.map((item) => {
              const meta = item.meta;
              return (
                <div
                  key={item.name}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 gap-3 hover:bg-surface-2/30 transition-colors"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent font-bold">
                      <IconDatabase size={18} />
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-ink text-[13px] truncate">
                          {meta ? formatUtcToLocal(meta.createdAt).full : item.name}
                        </span>
                        {item.complete ? (
                          <Chip tone="good">完整快照</Chip>
                        ) : (
                          <Chip tone="warning">孤儿分片</Chip>
                        )}
                        {meta && (
                          <span className="text-[11px] text-muted font-mono">
                            {(meta.bytes / 1024).toFixed(1)} KB
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-muted flex items-center gap-3 flex-wrap">
                        <span>设备：{meta?.device || '未知设备'}</span>
                        <span>版本：{meta?.appVersion || '—'}</span>
                        {meta?.counts && (
                          <span>
                            数据量：{meta.counts.items ?? 0} 条事项
                            {Object.entries(meta.counts)
                              .filter(([k]) => k !== 'items')
                              .map(([k, v]) => ` · ${k} (${v})`)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 动作区 */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {item.complete ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        icon={<IconRefreshCw size={13} />}
                        onClick={() => setDiffTargetName(item.name)}
                      >
                        比对与恢复
                      </Button>
                    ) : (
                      <span className="text-[11px] text-warning px-2 py-1 bg-warning-soft rounded-control">
                        不可恢复
                      </span>
                    )}

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-critical hover:bg-critical/10 hover:border-critical/30"
                      title="删除此份云端备份"
                      onClick={() => setDeleteTarget(item)}
                    >
                      <IconTrash size={14} />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 弹窗 1：WebDAV 配置 Modal */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isEditingConfig}
        onClose={() => setIsEditingConfig(false)}
        title="WebDAV 存储配置"
        description="配置坚果云、Nextcloud 等标准 WebDAV 服务凭据"
      >
        <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
          <Field label="WebDAV 服务器 URL">
            <input
              type="url"
              required
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              placeholder="https://dav.jianguoyun.com/dav/"
              className={controlClass}
            />
          </Field>

          <Field label="用户名 / 账号邮箱">
            <input
              type="text"
              required
              value={formUsername}
              onChange={(e) => setFormUsername(e.target.value)}
              placeholder="user@example.com"
              className={controlClass}
            />
          </Field>

          <Field label={config?.configured ? '应用授权密码（留空表示不修改）' : '应用授权密码'}>
            <input
              type="password"
              value={formPassword}
              onChange={(e) => setFormPassword(e.target.value)}
              placeholder={config?.configured ? '••••••••' : '请输入 WebDAV 应用授权密码'}
              className={controlClass}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <Field label="云端最多保留快照份数">
              <input
                type="number"
                min={1}
                max={100}
                value={formRetention}
                onChange={(e) => setFormRetention(Number(e.target.value))}
                className={controlClass}
              />
            </Field>

            <div className="flex items-center justify-between p-3 rounded-control border border-line bg-surface-2 self-end">
              <span className="text-[11px] font-bold text-ink">自动同步开关</span>
              <Switch
                checked={formAutoEnabled}
                onChange={() => setFormAutoEnabled(!formAutoEnabled)}
                tone="good"
                label="自动备份"
              />
            </div>
          </div>

          {configSaveError && (
            <div className="flex items-center gap-1.5 text-xs text-critical">
              <IconAlertCircle size={14} />
              <span>{configSaveError}</span>
            </div>
          )}

          <div className="rounded-control bg-surface-2 p-3 text-[11px] text-muted space-y-1 border border-line">
            <div className="flex items-center gap-1.5 font-bold text-ink">
              <IconShield size={14} className="text-accent" />
              <span>安全零知识凭据保护：</span>
            </div>
            <div>
              WebDAV 密码只进不出，本地使用系统保管库保护；同步至 Gist 时经由本地口令派生与
              AES-256-GCM 强力加密，第三方及服务器均无法解密。
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => setIsEditingConfig(false)}
            >
              取消
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={configMutation.isPending || !formUrl.trim() || !formUsername.trim()}
            >
              {configMutation.isPending ? '正在保存...' : '保存配置'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* 弹窗 2：删除备份确认 Modal */}
      {/* ========================================================================= */}
      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="删除云端备份"
        description="此操作将从 WebDAV 远程服务器中永久删除该快照文件"
      >
        {deleteTarget && (
          <div className="space-y-4 text-xs">
            <div className="rounded-panel border border-warning/30 bg-warning/10 p-3.5 text-warning space-y-1">
              <div className="font-bold text-sm">确定要删除备份「{deleteTarget.name}」吗？</div>
              <p className="text-[11px] leading-relaxed">
                删除后将无法通过此快照比对或恢复历史数据。
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <Button type="button" variant="ghost" size="md" onClick={() => setDeleteTarget(null)}>
                取消
              </Button>
              <Button
                type="button"
                variant="danger"
                size="md"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleteTarget.name)}
              >
                {deleteMutation.isPending ? '正在删除...' : '确认删除'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* 弹窗 3：差异比对与恢复确认 Modal */}
      {/* ========================================================================= */}
      <RestoreDiffModal
        isOpen={diffTargetName !== null}
        onClose={() => setDiffTargetName(null)}
        backupName={diffTargetName}
        isRestoring={restoreMutation.isPending}
        onConfirmRestore={async (name) => {
          await restoreMutation.mutateAsync(name);
        }}
      />
    </div>
  );
}
