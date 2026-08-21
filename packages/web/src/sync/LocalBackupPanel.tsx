import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BackupListItem, LocalBackupConfigPatch } from '@workbench/sync/contract';
import {
  Button,
  Chip,
  Field,
  controlClass,
  Switch,
  IconAlertCircle,
  IconCheck,
  IconClock,
  IconDatabase,
  IconFolder,
  IconPlus,
  IconRefreshCw,
  IconTrash,
  IconUpload,
  Modal,
  useTimezone,
} from '@workbench/ui';
import {
  deleteLocalBackup,
  fetchLocalBackupConfig,
  fetchLocalBackupList,
  runLocalBackup,
  updateLocalBackupConfig,
} from './localBackupApi.js';
import { LocalImportModal, joinBackupFilePath } from './LocalImportModal.js';

export function LocalBackupPanel() {
  const queryClient = useQueryClient();
  const { formatUtcToLocal } = useTimezone();

  // 1. 本地备份配置查询
  const { data: config } = useQuery({
    queryKey: ['local-backup-config'],
    queryFn: () => fetchLocalBackupConfig(),
  });

  // 2. 本地备份列表查询
  const {
    data: backups = [],
    isLoading: isBackupsLoading,
    isError: isBackupsError,
    error: backupsError,
    refetch: refetchBackups,
  } = useQuery({
    queryKey: ['local-backup-list'],
    queryFn: () => fetchLocalBackupList(),
  });

  // Toast 提示条
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }

  // 本地导入向导状态
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFilePath, setImportFilePath] = useState('');
  const [importDirection, setImportDirection] = useState<'overwrite' | 'new-account'>('overwrite');

  // 本地配置表单状态
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [formTargetDir, setFormTargetDir] = useState('');
  const [formRetention, setFormRetention] = useState(5);
  const [formAutoEnabled, setFormAutoEnabled] = useState(false);
  const [configSaveError, setConfigSaveError] = useState<string | null>(null);

  function openConfigEditor() {
    setFormTargetDir(config?.targetDir ?? '');
    setFormRetention(config?.retentionCount ?? 5);
    setFormAutoEnabled(config?.autoEnabled ?? false);
    setConfigSaveError(null);
    setIsEditingConfig(true);
  }

  // 保存配置 Mutation
  const configMutation = useMutation({
    mutationFn: (patch: LocalBackupConfigPatch) => updateLocalBackupConfig(patch),
    onSuccess: (res) => {
      void queryClient.setQueryData(['local-backup-config'], res);
      setIsEditingConfig(false);
      setConfigSaveError(null);
      showToast('本地备份配置已保存');
    },
    onError: (err: Error) => {
      setConfigSaveError(err.message);
    },
  });

  function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    const patch: LocalBackupConfigPatch = {
      targetDir: formTargetDir.trim(),
      autoEnabled: formAutoEnabled,
      retentionCount: Number(formRetention) || 5,
    };
    configMutation.mutate(patch);
  }

  // 快捷切换自动备份 Mutation
  const toggleAutoMutation = useMutation({
    mutationFn: (autoEnabled: boolean) => updateLocalBackupConfig({ autoEnabled }),
    onSuccess: (res) => {
      void queryClient.setQueryData(['local-backup-config'], res);
      showToast(res.autoEnabled ? '自动快照已开启' : '自动快照已关闭');
    },
    onError: (err: Error) => {
      showToast(`保存失败：${err.message}`);
    },
  });

  // 立即创建本地快照 Mutation
  const backupMutation = useMutation({
    mutationFn: () => runLocalBackup(),
    onSuccess: () => {
      void refetchBackups();
      showToast('已成功创建本地一致性快照');
    },
    onError: (err: Error) => {
      showToast(`快照创建失败：${err.message}`);
    },
  });

  // 删除备份状态与 Mutation
  const [deleteTarget, setDeleteTarget] = useState<BackupListItem | null>(null);
  const deleteMutation = useMutation({
    mutationFn: (name: string) => deleteLocalBackup(name),
    onSuccess: () => {
      void refetchBackups();
      setDeleteTarget(null);
      showToast('已删除该本地快照');
    },
    onError: (err: Error) => {
      showToast(`删除失败：${err.message}`);
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
      {/* 模块 1：本地备份与快照 Hero Banner */}
      {/* ========================================================================= */}
      <div className="rounded-panel border border-line bg-surface p-5 shadow-xs transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent shadow-2xs">
              <IconDatabase size={30} />
            </div>

            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base font-bold text-ink truncate leading-tight">
                  本地数据快照与备份
                </h2>
                {config?.targetDir ? (
                  <Chip tone="accent">自定义目录</Chip>
                ) : (
                  <Chip tone="neutral">默认存储目录</Chip>
                )}
                {config?.autoEnabled && <Chip tone="good">自动快照已开启</Chip>}
              </div>
              <div className="text-xs text-secondary leading-tight">
                存储位置：
                <span className="font-mono text-ink font-medium">
                  {config?.resolvedDir || 'data/local/backups'}
                </span>
                {config ? ` · 保留最近 ${config.retentionCount} 份快照` : ''}
              </div>
              <div className="text-[11px] text-muted leading-tight">
                本地一致性快照包含主数据库及所有 WAL 事务日志，支持一键导出与防灾恢复。
              </div>
            </div>
          </div>

          {/* 右侧主快捷按钮 */}
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-center flex-wrap">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<IconUpload size={14} />}
              onClick={() => {
                setImportFilePath('');
                setImportDirection('overwrite');
                setIsImportModalOpen(true);
              }}
            >
              从文件导入
            </Button>
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
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 模块 2：自动快照策略开关 */}
      {/* ========================================================================= */}
      {config && (
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-bold text-ink">自动快照策略</h3>
            <p className="text-xs text-secondary">
              在客户端启动与关键变更节点自动守护本地数据，防范意外丢失
            </p>
          </div>

          <div className="rounded-panel border border-line bg-surface p-4 text-xs shadow-2xs space-y-3">
            <div
              onClick={() => toggleAutoMutation.mutate(!config.autoEnabled)}
              className="flex items-center justify-between cursor-pointer select-none"
            >
              <div className="pr-4 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-ink text-[13px]">启动时自动创建本地快照</span>
                  {config.autoEnabled ? (
                    <Chip tone="good">已启用</Chip>
                  ) : (
                    <Chip tone="neutral">已关闭</Chip>
                  )}
                </div>
                <p className="text-muted text-[11px] leading-relaxed">
                  开启后，系统在每次工作台启动时若检测到距离上次完整快照超过 24
                  小时，将自动创建一致性快照，并自动滚动清理超出保留上限（当前设为{' '}
                  {config.retentionCount} 份）的旧备份。
                </p>
              </div>
              <Switch
                checked={config.autoEnabled}
                onChange={() => toggleAutoMutation.mutate(!config.autoEnabled)}
                tone="good"
                label="启动时自动创建本地快照"
              />
            </div>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 模块 3：本地历史快照列表与孤儿分片管理 */}
      {/* ========================================================================= */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-ink">本地快照历史与管理</h3>
            <p className="text-xs text-secondary">
              查看本地磁盘已存储的数据库快照文件、版本信息与数据量统计
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
          {isBackupsLoading ? (
            <div className="py-8 text-center text-xs text-muted">
              <IconRefreshCw size={18} className="animate-spin mx-auto mb-2 text-secondary" />
              <span>正在读取本地备份清单与元数据...</span>
            </div>
          ) : isBackupsError ? (
            <div className="py-6 text-center text-xs text-critical space-y-2">
              <p>获取本地备份列表失败：{(backupsError as Error)?.message}</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => void refetchBackups()}>
                重试
              </Button>
            </div>
          ) : backups.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted space-y-2">
              <IconFolder size={28} className="mx-auto text-secondary/60 mb-2" />
              <p>本地暂无数据快照</p>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={backupMutation.isPending}
                onClick={() => backupMutation.mutate()}
              >
                创建第一份本地快照
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
                    <div
                      className={`flex size-10 shrink-0 items-center justify-center rounded-xl font-bold ${
                        item.complete
                          ? 'bg-accent-soft text-accent'
                          : 'bg-warning-soft text-warning'
                      }`}
                    >
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
                        {meta?.reason && <Chip tone="accent">{meta.reason}</Chip>}
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
                        {!item.complete && (
                          <span className="text-warning">
                            缺少元数据文件，可能是写入中断留下的碎片
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
                        icon={<IconUpload size={13} />}
                        onClick={() => {
                          const fullPath = joinBackupFilePath(config?.resolvedDir, item.name);
                          setImportFilePath(fullPath);
                          setImportDirection('overwrite');
                          setIsImportModalOpen(true);
                        }}
                      >
                        导入
                      </Button>
                    ) : (
                      <span className="text-[11px] text-warning px-2 py-1 bg-warning-soft rounded-control font-medium">
                        不可恢复
                      </span>
                    )}

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-critical hover:bg-critical/10 hover:border-critical/30"
                      title={item.complete ? '删除此份本地快照' : '清理此孤儿分片'}
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
      {/* 弹窗 1：本地备份配置 Modal */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isEditingConfig}
        onClose={() => setIsEditingConfig(false)}
        title="本地备份存储配置"
        description="配置本地快照输出目录与自动保留份数"
      >
        <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
          <Field label="目标存储目录（留空表示使用默认账号备份目录）">
            <input
              type="text"
              value={formTargetDir}
              onChange={(e) => setFormTargetDir(e.target.value)}
              placeholder="留空默认：data/local/backups"
              className={controlClass}
            />
          </Field>

          {config?.resolvedDir && (
            <div className="p-2.5 rounded-control bg-surface-2 border border-line text-[11px] space-y-1">
              <div className="font-semibold text-ink flex items-center gap-1.5">
                <IconClock size={13} className="text-muted" />
                <span>实际生效解析路径：</span>
              </div>
              <div className="font-mono text-secondary break-all">{config.resolvedDir}</div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <Field label="本地最多保留快照份数">
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
              <span className="text-[11px] font-bold text-ink">自动快照开关</span>
              <Switch
                checked={formAutoEnabled}
                onChange={() => setFormAutoEnabled(!formAutoEnabled)}
                tone="good"
                label="自动快照"
              />
            </div>
          </div>

          {configSaveError && (
            <div className="flex items-center gap-1.5 text-xs text-critical">
              <IconAlertCircle size={14} />
              <span>{configSaveError}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => setIsEditingConfig(false)}
            >
              取消
            </Button>
            <Button type="submit" variant="primary" size="md" disabled={configMutation.isPending}>
              {configMutation.isPending ? '正在保存...' : '保存配置'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* 弹窗 2：删除本地快照确认 Modal */}
      {/* ========================================================================= */}
      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={deleteTarget?.complete ? '删除本地快照' : '清理孤儿分片'}
        description="此操作将从本地磁盘中永久删除该文件"
      >
        {deleteTarget && (
          <div className="space-y-4 text-xs">
            <div className="rounded-panel border border-warning/30 bg-warning/10 p-3.5 text-warning space-y-1">
              <div className="font-bold text-sm">确定要删除「{deleteTarget.name}」吗？</div>
              <p className="text-[11px] leading-relaxed">
                {deleteTarget.complete
                  ? '删除后该快照数据将永久移出本地磁盘，无法再用于恢复。'
                  : '该分片缺少元数据，删除可释放磁盘空间。'}
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
      {/* 弹窗 3：本地备份文件导入向导 Modal */}
      {/* ========================================================================= */}
      <LocalImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        initialFilePath={importFilePath}
        initialDirection={importDirection}
        knownBackups={backups}
        resolvedDir={config?.resolvedDir}
        onSuccess={(res) => {
          void refetchBackups();
          if (res.direction === 'overwrite') {
            showToast('已提交覆盖导入请求，系统正在恢复数据...');
          } else {
            showToast(`新账号「${res.displayName || ''}」已成功创建并导入数据`);
          }
        }}
      />
    </div>
  );
}
