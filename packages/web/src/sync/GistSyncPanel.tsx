import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AccountView } from '@workbench/sync/contract';
import {
  Button,
  Chip,
  Field,
  controlClass,
  IconAlertCircle,
  IconCheck,
  IconClock,
  IconExternalLink,
  IconGithub,
  IconKey,
  IconLock,
  IconRefreshCw,
  IconShield,
  IconUpload,
  Modal,
  useTimezone,
} from '@workbench/ui';
import { fetchSyncStatus, pullSync, pushSync, unlockSync } from './syncApi.js';
import { invalidateFor } from './workspaceCache.js';

export interface GistSyncPanelProps {
  activeAccount?: AccountView;
  onStartGitHubAuth?: () => void;
}

export function GistSyncPanel({ activeAccount, onStartGitHubAuth }: GistSyncPanelProps) {
  const queryClient = useQueryClient();
  const { formatUtcToLocal } = useTimezone();

  // 1. 查询 Gist 同步状态
  const {
    data: syncStatus,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['sync-status'],
    queryFn: () => fetchSyncStatus(),
  });

  // Toast 提示
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }

  // 解锁口令 Modal 状态
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [rememberPassphrase, setRememberPassphrase] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  // 解决冲突 Modal 状态
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);

  // 解锁 Mutation
  const unlockMutation = useMutation({
    mutationFn: ({ pass, remember }: { pass: string; remember: boolean }) =>
      unlockSync({ passphrase: pass, remember }),
    onSuccess: async (res) => {
      void queryClient.setQueryData(['sync-status'], res);
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      setIsUnlockModalOpen(false);
      setPassphrase('');
      setUnlockError(null);
      showToast('同步口令验证成功，已解锁 Gist 同步');
    },
    onError: (err: Error) => {
      setUnlockError(err.message);
    },
  });

  // 推送 Mutation
  const pushMutation = useMutation({
    mutationFn: (force?: boolean) => pushSync({ force }),
    onSuccess: (res) => {
      void queryClient.setQueryData(['sync-status'], res);
      setIsConflictModalOpen(false);
      showToast('本地设置与凭据已加密推送至云端 Gist');
    },
    onError: (err: Error) => {
      if (err.message.includes('409') || syncStatus?.conflict) {
        setIsConflictModalOpen(true);
      } else {
        showToast(`推送失败：${err.message}`);
      }
    },
  });

  // 拉取 Mutation
  const pullMutation = useMutation({
    mutationFn: () => pullSync(),
    onSuccess: async (res) => {
      void queryClient.setQueryData(['sync-status'], res);
      await invalidateFor(queryClient, 'settings-pulled');
      setIsConflictModalOpen(false);
      showToast('已从云端拉取最新设置并覆写本地');
    },
    onError: (err: Error) => {
      showToast(`拉取失败：${err.message}`);
    },
  });

  function handleOpenUnlock() {
    setPassphrase('');
    // 只有在受保管库保护时才允许默认勾选记住
    setRememberPassphrase(Boolean(syncStatus?.protectedByOsVault));
    setUnlockError(null);
    setIsUnlockModalOpen(true);
  }

  function handleUnlockSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!passphrase.trim()) {
      setUnlockError('请输入同步口令');
      return;
    }
    setUnlockError(null);
    unlockMutation.mutate({
      pass: passphrase.trim(),
      remember: syncStatus?.protectedByOsVault ? rememberPassphrase : false,
    });
  }

  const isLinked = Boolean(syncStatus?.linked);
  const isProtected = syncStatus?.protectedByOsVault ?? true;
  const isUnlocked = Boolean(syncStatus?.unlocked);
  const hasConflict = Boolean(syncStatus?.conflict);

  return (
    <div className="space-y-4">
      {/* Toast 提示 */}
      {toastMessage && (
        <div className="rounded-panel border border-accent/30 bg-accent-soft px-4 py-2.5 text-xs font-semibold text-accent animate-fade-in flex items-center gap-2">
          <IconCheck size={14} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* OS 保管库降级致命/明确警示：当 protectedByOsVault 为 false 时必须明示 */}
      {syncStatus && !isProtected && (
        <div className="rounded-panel border-2 border-warning/60 bg-warning-soft/60 p-4 space-y-2 animate-fade-in shadow-xs">
          <div className="flex items-center gap-2 font-bold text-ink text-xs">
            <div className="flex size-6 items-center justify-center rounded-full bg-warning text-white shrink-0">
              <IconAlertCircle size={14} />
            </div>
            <span>本机凭据未受系统保管库保护</span>
            <Chip tone="warning">安全降级</Chip>
          </div>
          <p className="text-[11px] text-secondary leading-relaxed pl-8">
            未检测到系统密钥环（Windows Credential Manager / macOS Keychain）。本地 GitHub Token 与
            WebDAV 配置已降级为明文文件存储。出于零知识安全原则，
            <strong>同步口令禁止持久化保存</strong>，每次应用重启需手动输入口令解锁。
          </p>
        </div>
      )}

      {/* 版本冲突警告 Banner */}
      {hasConflict && (
        <div className="rounded-panel border-2 border-critical/50 bg-critical-soft/60 p-4 space-y-3 animate-fade-in shadow-xs">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 font-bold text-ink text-xs">
              <div className="flex size-6 items-center justify-center rounded-full bg-critical text-white shrink-0">
                <IconAlertCircle size={14} />
              </div>
              <span>检测到云端设置存在版本冲突</span>
              <Chip tone="critical">需手动解决</Chip>
            </div>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setIsConflictModalOpen(true)}
            >
              解决冲突
            </Button>
          </div>
          <p className="text-[11px] text-secondary leading-relaxed pl-8">
            云端设置已被设备「{syncStatus?.cloudDevice || '未知设备'}」于{' '}
            {syncStatus?.cloudUpdatedAt ? formatUtcToLocal(syncStatus.cloudUpdatedAt).full : '近期'}{' '}
            更新。为防止数据交叉覆盖，系统已暂停自动同步，请选择保留云端或本地版本。
          </p>
        </div>
      )}

      {/* 核心卡片：Gist 设置同步与零知识加密控制台 */}
      <div className="rounded-panel border border-line bg-surface p-4 flex flex-col justify-between shadow-2xs transition-all space-y-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-ink text-surface shrink-0">
                <IconGithub size={18} />
              </div>
              <div>
                <div className="font-bold text-ink text-sm flex items-center gap-2">
                  <span>GitHub Gist 偏好设置同步</span>
                  {isLinked ? (
                    isUnlocked ? (
                      <Chip tone="good" icon={<IconKey size={10} />}>
                        已解锁同步
                      </Chip>
                    ) : (
                      <Chip tone="warning" icon={<IconLock size={10} />}>
                        口令已锁定
                      </Chip>
                    )
                  ) : (
                    <Chip tone="neutral">未连接</Chip>
                  )}
                  {isProtected ? (
                    <Chip tone="neutral" icon={<IconShield size={10} />}>
                      系统保管库
                    </Chip>
                  ) : (
                    <Chip tone="warning" icon={<IconAlertCircle size={10} />}>
                      明文存储降级
                    </Chip>
                  )}
                </div>
                <div className="text-xs text-muted mt-0.5">
                  基于 AES-256-GCM 零知识端到端加密，工作台主题、时区与 WebDAV 凭据安全上云
                </div>
              </div>
            </div>

            {/* 右侧快速解锁/刷新状态 */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={<IconRefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />}
                onClick={() => void refetch()}
                title="刷新同步状态"
              >
                刷新
              </Button>
            </div>
          </div>

          {/* 状态与元数据详情网格 */}
          {isLinked && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 text-xs">
              <div className="p-2.5 rounded-control bg-surface-2/60 border border-line/60 space-y-1">
                <div className="text-[10px] text-muted uppercase font-bold tracking-wider">
                  云端 Gist
                </div>
                <div className="font-mono text-ink text-[11px] truncate flex items-center gap-1">
                  {syncStatus?.gistId ? (
                    <>
                      <span>{syncStatus.gistId.slice(0, 12)}...</span>
                      <a
                        href={`https://gist.github.com/${syncStatus.gistId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent hover:underline inline-flex items-center"
                        title="在 GitHub 查看 Secret Gist"
                      >
                        <IconExternalLink size={11} />
                      </a>
                    </>
                  ) : (
                    <span className="text-muted">首次推送时自动创建</span>
                  )}
                </div>
              </div>

              <div className="p-2.5 rounded-control bg-surface-2/60 border border-line/60 space-y-1">
                <div className="text-[10px] text-muted uppercase font-bold tracking-wider">
                  云端最后更新
                </div>
                <div className="text-ink text-[11px] truncate flex items-center gap-1">
                  <IconClock size={12} className="text-muted shrink-0" />
                  <span>
                    {syncStatus?.cloudUpdatedAt
                      ? formatUtcToLocal(syncStatus.cloudUpdatedAt).full
                      : '尚未有云端记录'}
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-control bg-surface-2/60 border border-line/60 space-y-1">
                <div className="text-[10px] text-muted uppercase font-bold tracking-wider">
                  最近操作设备
                </div>
                <div className="text-ink text-[11px] truncate">
                  {syncStatus?.cloudDevice ? syncStatus.cloudDevice : '—'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 底部操作区 */}
        <div className="pt-3 border-t border-line/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
          {!isLinked ? (
            <div className="flex items-center justify-between w-full flex-wrap gap-2">
              <span className="text-muted">
                {activeAccount?.kind === 'github'
                  ? 'GitHub 访问令牌已失效或尚未登录，请重新连接以启用 Gist 同步'
                  : '关联 GitHub 账户以启用 Gist 设置与凭据同步'}
              </span>
              {onStartGitHubAuth && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  icon={<IconGithub size={14} />}
                  onClick={onStartGitHubAuth}
                >
                  {activeAccount?.kind === 'github' ? '重新连接 GitHub' : '连接 GitHub'}
                </Button>
              )}
            </div>
          ) : !isUnlocked ? (
            <div className="flex items-center justify-between w-full flex-wrap gap-2">
              <div className="flex items-center gap-1.5 text-secondary text-xs">
                <IconLock size={14} className="text-warning" />
                <span>口令尚未解锁，输入同步口令即可恢复自动同步与数据上传</span>
              </div>
              <Button
                type="button"
                variant="primary"
                size="sm"
                icon={<IconKey size={14} />}
                onClick={handleOpenUnlock}
              >
                输入口令解锁
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full flex-wrap gap-2">
              <div className="text-muted text-[11px]">
                {hasConflict ? (
                  <span className="text-critical font-medium">版本冲突待处理</span>
                ) : (
                  <span>✓ 同步通道正常运行</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pullMutation.isPending}
                  onClick={() => pullMutation.mutate()}
                >
                  {pullMutation.isPending ? (
                    <span className="flex items-center gap-1.5">
                      <IconRefreshCw size={12} className="animate-spin" />
                      拉取中...
                    </span>
                  ) : (
                    '从 Gist 拉取设置'
                  )}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={<IconUpload size={13} />}
                  disabled={pushMutation.isPending}
                  onClick={() => pushMutation.mutate(false)}
                >
                  {pushMutation.isPending ? (
                    <span className="flex items-center gap-1.5">
                      <IconRefreshCw size={12} className="animate-spin" />
                      推送中...
                    </span>
                  ) : (
                    '立即推送设置'
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 弹窗 1：解锁同步口令 Modal */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isUnlockModalOpen}
        onClose={() => setIsUnlockModalOpen(false)}
        title="解锁 Gist 设置同步"
        description="请输入用于派生 AES-256-GCM 零知识加密密钥的同步口令"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleUnlockSubmit} className="space-y-4 text-xs">
          <Field label="同步口令 (Passphrase)">
            <input
              type="password"
              autoFocus
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="请输入同步口令"
              className={controlClass}
            />
          </Field>

          {/* 记住口令选项 */}
          <div className="rounded-panel border border-line bg-surface-2 p-3 space-y-2">
            <label
              className={`flex items-start gap-2.5 ${
                isProtected ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
              }`}
            >
              <input
                type="checkbox"
                checked={isProtected && rememberPassphrase}
                disabled={!isProtected}
                onChange={(e) => setRememberPassphrase(e.target.checked)}
                className="mt-0.5 text-accent focus:ring-accent rounded"
              />
              <div className="space-y-0.5">
                <div className="font-bold text-ink">在系统保管库中记住口令</div>
                <div className="text-[11px] text-muted leading-relaxed">
                  {isProtected
                    ? '口令将安全保存在本机操作系统凭据管理器中，下次启动无需重新输入。'
                    : '本机未检测到系统保管库，出于零知识安全要求，口令绝不写入本地明文文件。'}
                </div>
              </div>
            </label>
          </div>

          <div className="text-[11px] text-muted leading-relaxed">
            💡 <strong>零知识加密说明</strong>：云端 Gist
            中仅保存加密后的密文信封与公开头部。若遗忘口令，可重新设置口令并重新配置 WebDAV
            凭据，业务数据库数据不会丢失。
          </div>

          {unlockError && (
            <div className="flex items-center gap-1.5 text-xs text-critical">
              <IconAlertCircle size={14} />
              <span>{unlockError}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => setIsUnlockModalOpen(false)}
            >
              取消
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={unlockMutation.isPending || !passphrase.trim()}
            >
              {unlockMutation.isPending ? '正在验证...' : '确认解锁'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* 弹窗 2：版本冲突解决 Modal */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isConflictModalOpen}
        onClose={() => setIsConflictModalOpen(false)}
        title="解决云端设置同步冲突"
        description="检测到云端 Gist 设置与本地配置产生冲突，请明确选择保留哪一侧的偏好设置"
        maxWidth="max-w-md"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3.5 rounded-panel border border-warning/40 bg-warning-soft/40 space-y-1 text-secondary">
            <div className="font-bold text-ink flex items-center gap-1.5">
              <IconAlertCircle size={14} className="text-warning" />
              <span>冲突原因</span>
            </div>
            <p className="text-[11px] leading-relaxed text-muted">
              云端设置已被「{syncStatus?.cloudDevice || '其他设备'}」于{' '}
              {syncStatus?.cloudUpdatedAt
                ? formatUtcToLocal(syncStatus.cloudUpdatedAt).full
                : '近期'}{' '}
              更新。为防止混淆不同设备间的偏好组合，系统不进行自动字段合并。
            </p>
          </div>

          <div className="space-y-2.5">
            <div className="font-bold text-ink text-xs">请选择处理方式：</div>

            {/* 选项 1：云端覆写本地 */}
            <div className="p-3.5 rounded-panel border border-line bg-surface hover:bg-surface-2 transition-all space-y-2">
              <div className="font-bold text-ink flex items-center justify-between">
                <span>从云端拉取配置覆写本地</span>
                <Chip tone="accent">推荐</Chip>
              </div>
              <p className="text-[11px] text-muted leading-relaxed">
                使用云端 Gist 中保存的主题、时区与 WebDAV 凭据覆盖当前设备的本地设置。
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={pullMutation.isPending}
                onClick={() => pullMutation.mutate()}
                className="w-full mt-1"
              >
                {pullMutation.isPending ? '正在拉取...' : '确认从云端拉取覆写'}
              </Button>
            </div>

            {/* 选项 2：本地覆写云端 */}
            <div className="p-3.5 rounded-panel border border-line bg-surface hover:bg-surface-2 transition-all space-y-2">
              <div className="font-bold text-ink">以本地设置强制覆写云端 Gist</div>
              <p className="text-[11px] text-muted leading-relaxed">
                将当前设备上的本地偏好配置与 WebDAV 凭据强行上传，替换云端记录。
              </p>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={pushMutation.isPending}
                onClick={() => pushMutation.mutate(true)}
                className="w-full mt-1"
              >
                {pushMutation.isPending ? '正在强制推送...' : '确认以本地覆写云端 (Force Push)'}
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => setIsConflictModalOpen(false)}
            >
              暂不处理
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
