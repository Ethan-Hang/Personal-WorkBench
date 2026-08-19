import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AccountView, BindDirection, GitHubDeviceCode } from '@workbench/sync/contract';
import {
  Button,
  Chip,
  Field,
  controlClass,
  IconAlertCircle,
  IconCheck,
  IconCopy,
  IconDatabase,
  IconExternalLink,
  IconGithub,
  IconPlus,
  IconRefreshCw,
  IconShield,
  IconTrash,
  IconUser,
  Modal,
  Panel,
  useTimezone,
} from '@workbench/ui';
import {
  bindGithubAccount,
  createAccount,
  deleteAccount,
  fetchAccounts,
  pollGithubDeviceFlow,
  startGithubDeviceFlow,
  switchAccount,
  unbindGithubAccount,
} from './accountsApi.js';

type AuthStep =
  | 'idle'
  | 'starting'
  | 'authenticating'
  | 'expired'
  | 'denied'
  | 'bind_direction'
  | 'bind_success_hint';

export function AccountsPanel({ onNavigateToStorage }: { onNavigateToStorage?: () => void }) {
  const queryClient = useQueryClient();
  const { formatUtcToLocal } = useTimezone();

  // 账号列表查询
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => fetchAccounts(),
  });

  const activeId = data?.activeId ?? 'local-default';
  const accounts = data?.accounts ?? [];
  const activeAccount = accounts.find((a) => a.id === activeId);

  // 状态反馈 toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }

  // 新建账号弹窗状态
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  // 删除账号弹窗状态
  const [deleteTarget, setDeleteTarget] = useState<AccountView | null>(null);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // 解绑 GitHub 弹窗状态
  const [isUnbindModalOpen, setIsUnbindModalOpen] = useState(false);
  const [unbindError, setUnbindError] = useState<string | null>(null);

  // GitHub Device Flow 认证与绑定状态
  const [authStep, setAuthStep] = useState<AuthStep>('idle');
  const [deviceCodeData, setDeviceCodeData] = useState<GitHubDeviceCode | null>(null);
  const [authorizedUser, setAuthorizedUser] = useState<{ login: string; id: number } | null>(null);
  const [bindDirection, setBindDirection] = useState<BindDirection>('cloud-to-local');
  const [authError, setAuthError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [pollCount, setPollCount] = useState(0);

  const pollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollActiveRef = useRef(false);

  // 清理轮询定时器
  function stopPolling() {
    pollActiveRef.current = false;
    if (pollingTimeoutRef.current !== null) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
  }

  useEffect(() => {
    return () => stopPolling();
  }, []);

  // 1. 新建账号 Mutation
  const createMutation = useMutation({
    mutationFn: (displayName: string) => createAccount(displayName),
    onSuccess: (res) => {
      void queryClient.setQueryData(['accounts'], res);
      setIsCreateModalOpen(false);
      setNewDisplayName('');
      setCreateError(null);
      showToast('新建本地账号成功');
    },
    onError: (err: Error) => {
      setCreateError(err.message);
    },
  });

  // 2. 切换账号 Mutation
  const switchMutation = useMutation({
    mutationFn: (id: string) => switchAccount(id),
    onSuccess: async (_res, targetId) => {
      // 关键铁律：切换账号后必须触发全量缓存失效，防止上一个账号的数据残留
      await queryClient.invalidateQueries();
      const targetAcc = accounts.find((a) => a.id === targetId);
      showToast(`已切换至账号「${targetAcc?.displayName ?? targetId}」`);
    },
    onError: (err: Error) => {
      showToast(`切换失败：${err.message}`);
    },
  });

  // 3. 删除账号 Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAccount(id),
    onSuccess: (res) => {
      void queryClient.setQueryData(['accounts'], res);
      setDeleteTarget(null);
      setDeleteConfirmed(false);
      setDeleteError(null);
      showToast('账号及本地数据已彻底删除');
    },
    onError: (err: Error) => {
      setDeleteError(err.message);
    },
  });

  // 4. 绑定 GitHub Mutation
  const bindMutation = useMutation({
    mutationFn: ({
      id,
      direction,
      github,
    }: {
      id: string;
      direction: BindDirection;
      github: { login: string; userId: number };
    }) => bindGithubAccount(id, { direction, github }),
    onSuccess: async (res) => {
      void queryClient.setQueryData(['accounts'], res);
      await queryClient.invalidateQueries();
      setAuthStep('bind_success_hint');
    },
    onError: (err: Error) => {
      setAuthError(`绑定失败：${err.message}`);
    },
  });

  // 5. 解绑 GitHub Mutation
  const unbindMutation = useMutation({
    mutationFn: (id: string) => unbindGithubAccount(id),
    onSuccess: async (res) => {
      void queryClient.setQueryData(['accounts'], res);
      await queryClient.invalidateQueries();
      setIsUnbindModalOpen(false);
      setUnbindError(null);
      showToast('已解除 GitHub 账号绑定');
    },
    onError: (err: Error) => {
      setUnbindError(err.message);
    },
  });

  // 发起 GitHub Device Flow 登录
  async function handleStartGitHubAuth() {
    setAuthError(null);
    setAuthStep('starting');
    setDeviceCodeData(null);
    setAuthorizedUser(null);
    setPollCount(0);
    setCopiedCode(false);

    // 规避浏览器弹窗拦截器：在用户手势点击链中同步先打开空白窗口
    const authWindow = typeof window !== 'undefined' ? window.open('about:blank', '_blank') : null;

    try {
      const codeData = await startGithubDeviceFlow();
      setDeviceCodeData(codeData);

      // 若窗口正常打开，将其导航到 GitHub 验证页
      if (authWindow) {
        authWindow.location.href = codeData.verificationUri;
      }

      // 自动尝试将 user_code 复制到剪贴板
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(codeData.userCode);
          setCopiedCode(true);
        } catch {
          // 复制失败不阻塞流程，UI 会提供显式手动复制按钮
        }
      }

      setAuthStep('authenticating');
      startDevicePolling(codeData.deviceCode, codeData.interval);
    } catch (err: unknown) {
      if (authWindow) authWindow.close();
      setAuthStep('idle');
      showToast(`发起 GitHub 登录失败：${(err as Error).message}`);
    }
  }

  // 启动轮询
  function startDevicePolling(deviceCode: string, initialInterval: number) {
    stopPolling();
    pollActiveRef.current = true;

    let currentInterval = initialInterval;

    async function poll() {
      if (!pollActiveRef.current) return;

      try {
        setPollCount((prev) => prev + 1);
        const res = await pollGithubDeviceFlow(deviceCode, currentInterval);

        if (!pollActiveRef.current) return;

        if (res.status === 'pending') {
          pollingTimeoutRef.current = setTimeout(poll, currentInterval * 1000);
        } else if (res.status === 'slow_down') {
          currentInterval = res.interval;
          pollingTimeoutRef.current = setTimeout(poll, currentInterval * 1000);
        } else if (res.status === 'expired') {
          stopPolling();
          setAuthStep('expired');
        } else if (res.status === 'denied') {
          stopPolling();
          setAuthStep('denied');
        } else if (res.status === 'authorized') {
          stopPolling();
          setAuthorizedUser(res.user);
          setAuthStep('bind_direction');
        }
      } catch (err: unknown) {
        if (!pollActiveRef.current) return;
        setAuthError((err as Error).message);
        // 遇到瞬时错误，稍后继续重试一次
        pollingTimeoutRef.current = setTimeout(poll, currentInterval * 1000);
      }
    }

    pollingTimeoutRef.current = setTimeout(poll, currentInterval * 1000);
  }

  // 手动复制授权码
  async function handleCopyCode(code: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(code);
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2500);
      } catch {
        // ignore
      }
    }
  }

  // 提交新建账号
  function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newDisplayName.trim();
    if (!trimmed) {
      setCreateError('账号名称不能为空');
      return;
    }
    if (trimmed.length > 40) {
      setCreateError('账号名称不能超过 40 个字符');
      return;
    }
    setCreateError(null);
    createMutation.mutate(trimmed);
  }

  // 提交绑定
  function handleConfirmBind() {
    if (!activeAccount || !authorizedUser) return;
    setAuthError(null);
    bindMutation.mutate({
      id: activeAccount.id,
      direction: bindDirection,
      github: {
        login: authorizedUser.login,
        userId: authorizedUser.id,
      },
    });
  }

  return (
    <div className="space-y-6 animate-slide-right-in">
      {/* 头部标题与描述 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-ink">账号与身份管理</h2>
          <p className="text-xs text-secondary">
            多账号数据独立存储于各专属 SQLite 数据库文件；绑定 GitHub
            实现设备间无缝流转与云端设置同步。
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          size="sm"
          icon={<IconPlus size={14} />}
          onClick={() => {
            setNewDisplayName('');
            setCreateError(null);
            setIsCreateModalOpen(true);
          }}
        >
          新建本地账号
        </Button>
      </div>

      {/* Toast 提示条 */}
      {toastMessage && (
        <div className="rounded-panel border border-accent/30 bg-accent-soft px-4 py-2.5 text-xs font-semibold text-accent animate-fade-in flex items-center gap-2">
          <IconCheck size={14} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 当前激活账号卡片 */}
      {activeAccount && (
        <Panel
          title="当前使用中的账号"
          hint="数据写入目标库"
          action={<Chip tone="accent">当前激活</Chip>}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between text-xs">
            <div className="flex items-center gap-3.5">
              <div
                className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${
                  activeAccount.kind === 'github'
                    ? 'bg-ink text-surface'
                    : 'bg-accent-soft text-accent'
                }`}
              >
                {activeAccount.kind === 'github' ? (
                  <IconGithub size={22} />
                ) : (
                  <IconUser size={22} />
                )}
              </div>
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-ink truncate">
                    {activeAccount.displayName}
                  </span>
                  {activeAccount.kind === 'github' && activeAccount.github ? (
                    <Chip tone="neutral" icon={<IconGithub size={11} />}>
                      @{activeAccount.github.login}
                    </Chip>
                  ) : (
                    <Chip tone="neutral" icon={<IconDatabase size={11} />}>
                      本地独立存储
                    </Chip>
                  )}
                </div>
                <div className="text-muted text-[11px] font-mono truncate">
                  ID: {activeAccount.id} · 创建于 {formatUtcToLocal(activeAccount.createdAt).date}
                </div>
              </div>
            </div>

            {/* 当前账号的操作按钮 */}
            <div className="flex items-center gap-2 shrink-0">
              {activeAccount.kind === 'github' ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setUnbindError(null);
                    setIsUnbindModalOpen(true);
                  }}
                >
                  解除 GitHub 绑定
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={<IconGithub size={14} />}
                  onClick={handleStartGitHubAuth}
                >
                  绑定 GitHub 账号
                </Button>
              )}
            </div>
          </div>
        </Panel>
      )}

      {/* 账号列表面板 */}
      <Panel title="所有本地账号列表" hint={`共 ${accounts.length} 个账号`}>
        {isLoading ? (
          <div className="py-8 text-center text-xs text-muted">
            <IconRefreshCw size={18} className="animate-spin mx-auto mb-2 text-secondary" />
            <span>正在加载账号注册表...</span>
          </div>
        ) : isError ? (
          <div className="py-6 text-center text-xs text-critical space-y-2">
            <p>加载账号列表失败：{(error as Error)?.message}</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => void refetch()}>
              重试
            </Button>
          </div>
        ) : accounts.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted">暂无账号数据</div>
        ) : (
          <div className="divide-y divide-line text-xs">
            {accounts.map((acc) => {
              const isActive = acc.id === activeId;
              const isSwitchingThis =
                switchMutation.isPending && switchMutation.variables === acc.id;

              return (
                <div
                  key={acc.id}
                  className={`flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between transition-colors ${
                    isActive ? 'bg-surface-2/30 -mx-4 px-4 rounded-panel' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`flex size-8 shrink-0 items-center justify-center rounded-xl ${
                        acc.kind === 'github'
                          ? 'bg-ink text-surface'
                          : 'bg-surface-2 text-secondary'
                      }`}
                    >
                      {acc.kind === 'github' ? <IconGithub size={16} /> : <IconUser size={16} />}
                    </div>

                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`font-semibold truncate ${isActive ? 'text-ink font-bold' : 'text-ink'}`}
                        >
                          {acc.displayName}
                        </span>
                        {isActive && <Chip tone="accent">使用中</Chip>}
                        {acc.kind === 'github' && acc.github && (
                          <span className="text-[11px] text-muted">@{acc.github.login}</span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted truncate">
                        最近使用：{formatUtcToLocal(acc.lastUsedAt).full || '—'}
                      </div>
                    </div>
                  </div>

                  {/* 操作区 */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {!isActive ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isSwitchingThis || switchMutation.isPending}
                          onClick={() => switchMutation.mutate(acc.id)}
                        >
                          {isSwitchingThis ? (
                            <span className="flex items-center gap-1.5">
                              <IconRefreshCw size={12} className="animate-spin" />
                              切换中...
                            </span>
                          ) : (
                            '切换到此账号'
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-critical hover:bg-critical/10 hover:border-critical/30"
                          title="彻底删除此账号与本地数据库文件"
                          onClick={() => {
                            setDeleteTarget(acc);
                            setDeleteConfirmed(false);
                            setDeleteError(null);
                          }}
                        >
                          <IconTrash size={14} />
                        </Button>
                      </>
                    ) : (
                      <span className="text-[11px] text-muted px-2 py-1 bg-surface-2 rounded-control">
                        当前活跃库
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* 架构安全与隔离说明卡片 */}
      <Panel title="本地优先架构与账号隔离说明">
        <div className="space-y-2.5 text-xs text-muted leading-relaxed">
          <div className="flex items-start gap-2 text-ink">
            <IconShield size={16} className="text-accent shrink-0 mt-0.5" />
            <span className="font-semibold">文件边界隔离 · 零跨号泄露</span>
          </div>
          <p>
            每一个本地账号对应独立的文件目录（
            <code>data/local/accounts/&lt;账号 ID&gt;/workbench.db</code>
            ）。不同账号之间的待办事项、日历日程与秋招投递数据在物理文件层面完全隔离，切换账号时即时换连并清空内存缓存。
          </p>
          <p>
            绑定 GitHub 后，系统将通过 GitHub Device Flow 获取专属 Token 并存储于系统保管库。GitHub
            仅用于同步工作台偏好设置与 WebDAV 凭据（零知识加密），绝不上传本地业务数据。
          </p>
        </div>
      </Panel>

      {/* ========================================================================= */}
      {/* 弹窗 1：新建本地账号 Modal */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="新建本地账号"
        description="创建一个全新的独立工作台账号，拥有独立的 SQLite 数据库文件与设置"
      >
        <form onSubmit={handleCreateAccount} className="space-y-4">
          <Field label="账号显示名称（1–40 个字符，例如「秋招求职」、「工作日常」）">
            <input
              type="text"
              autoFocus
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              placeholder="请输入账号名称"
              maxLength={40}
              className={controlClass}
            />
          </Field>

          {createError && (
            <div className="flex items-center gap-1.5 text-xs text-critical">
              <IconAlertCircle size={14} />
              <span>{createError}</span>
            </div>
          )}

          <div className="rounded-control bg-surface-2 p-3 text-[11px] text-muted space-y-1">
            <div className="font-bold text-ink">独立存储说明：</div>
            <div>
              新账号将分配唯一
              ID，并在首次切换使用时自动初始化全新的数据库文件，与现有数据互不干扰。
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => setIsCreateModalOpen(false)}
            >
              取消
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={createMutation.isPending || !newDisplayName.trim()}
            >
              {createMutation.isPending ? '创建中...' : '确认创建'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* 弹窗 2：删除账号二次确认 Modal */}
      {/* ========================================================================= */}
      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="彻底删除账号与数据"
        description="此操作极其危险且不可逆，请谨慎确认"
      >
        {deleteTarget && (
          <div className="space-y-4 text-xs">
            <div className="rounded-panel border border-critical/30 bg-critical/10 p-3.5 text-critical space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <IconAlertCircle size={18} />
                <span>您正在删除账号「{deleteTarget.displayName}」</span>
              </div>
              <p className="leading-relaxed">
                删除操作将<strong>彻底永久销毁</strong>该账号的所有本地数据文件（包括 SQLite
                主库文件 <code>accounts/{deleteTarget.id}/workbench.db</code> 以及所有相关 WAL
                日志），账号下的全部待办事项、日历排程与投递记录都将无法恢复！
              </p>
            </div>

            {deleteError && (
              <div className="flex items-center gap-1.5 text-xs text-critical">
                <IconAlertCircle size={14} />
                <span>{deleteError}</span>
              </div>
            )}

            <label className="flex items-start gap-2 cursor-pointer select-none pt-1">
              <input
                type="checkbox"
                checked={deleteConfirmed}
                onChange={(e) => setDeleteConfirmed(e.target.checked)}
                className="mt-0.5 rounded border-line text-critical focus:ring-critical"
              />
              <span className="text-secondary">
                我已知晓该操作将永久销毁账号「{deleteTarget.displayName}」的所有本地数据且无法找回。
              </span>
            </label>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <Button type="button" variant="ghost" size="md" onClick={() => setDeleteTarget(null)}>
                取消
              </Button>
              <Button
                type="button"
                variant="danger"
                size="md"
                disabled={!deleteConfirmed || deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
              >
                {deleteMutation.isPending ? '正在销毁...' : '确认彻底删除'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* 弹窗 3：解绑 GitHub 确认 Modal */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isUnbindModalOpen}
        onClose={() => setIsUnbindModalOpen(false)}
        title="解除 GitHub 绑定"
        description="将当前账号转回本地独立账号模式"
      >
        <div className="space-y-4 text-xs">
          <div className="rounded-panel border border-line bg-surface-2 p-3.5 space-y-2 text-secondary leading-relaxed">
            <div className="font-bold text-ink">解绑规则说明：</div>
            <ul className="list-disc pl-4 space-y-1">
              <li>解绑后，当前账号将恢复为纯本地账号，本地保存的 GitHub 访问凭据将被清理。</li>
              <li>
                <strong>不会删除云端 Gist</strong>：GitHub 上的设置备份文件依然保留在您的 Gist
                中，不会被自动清空。
              </li>
              <li>
                若需彻底删除云端 Gist 设置，请访问{' '}
                <a
                  href="https://gist.github.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent underline inline-flex items-center gap-0.5"
                >
                  gist.github.com
                  <IconExternalLink size={11} />
                </a>{' '}
                手动删除。
              </li>
            </ul>
          </div>

          {unbindError && (
            <div className="flex items-center gap-1.5 text-xs text-critical">
              <IconAlertCircle size={14} />
              <span>{unbindError}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => setIsUnbindModalOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="danger"
              size="md"
              disabled={unbindMutation.isPending}
              onClick={() => activeAccount && unbindMutation.mutate(activeAccount.id)}
            >
              {unbindMutation.isPending ? '正在解绑...' : '确认解除绑定'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* 弹窗 4：GitHub Device Flow 授权与绑定 Modal */}
      {/* ========================================================================= */}
      <Modal
        isOpen={authStep !== 'idle'}
        onClose={() => {
          stopPolling();
          setAuthStep('idle');
        }}
        title={
          authStep === 'bind_direction'
            ? '选择设置同步方向'
            : authStep === 'bind_success_hint'
              ? 'GitHub 绑定成功'
              : 'GitHub 登录与授权'
        }
        description={
          authStep === 'bind_direction'
            ? '请确定本地设置与云端 Gist 配置的合并同步策略'
            : authStep === 'bind_success_hint'
              ? '您的工作台账号已成功关联 GitHub 身份'
              : '使用 GitHub Device Flow 无需输入密码，安全快捷完成授权'
        }
      >
        {/* Step: Starting */}
        {authStep === 'starting' && (
          <div className="py-8 text-center space-y-3 text-xs text-muted">
            <IconRefreshCw size={24} className="animate-spin mx-auto text-accent" />
            <div>正在向 GitHub 请求 Device Flow 授权凭证...</div>
          </div>
        )}

        {/* Step: Authenticating (展示 user_code 与轮询等待) */}
        {authStep === 'authenticating' && deviceCodeData && (
          <div className="space-y-4 text-xs">
            {/* 核心授权码展示 */}
            <div className="rounded-panel border border-accent/40 bg-accent-soft/30 p-4 text-center space-y-2">
              <div className="text-[11px] font-bold text-muted uppercase tracking-wider">
                您的 GitHub 8 位授权码
              </div>
              <div className="flex items-center justify-center gap-3">
                <span className="font-mono text-3xl font-extrabold tracking-widest text-accent select-all">
                  {deviceCodeData.userCode}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  icon={
                    copiedCode ? (
                      <IconCheck size={14} className="text-good" />
                    ) : (
                      <IconCopy size={14} />
                    )
                  }
                  onClick={() => handleCopyCode(deviceCodeData.userCode)}
                >
                  {copiedCode ? '已复制' : '复制'}
                </Button>
              </div>
              {copiedCode && (
                <div className="text-[11px] font-medium text-good">
                  ✓ 授权码已复制到剪贴板，请直接粘贴到 GitHub 页面
                </div>
              )}
            </div>

            {/* 操作步骤指引 */}
            <div className="rounded-control bg-surface-2 p-3.5 space-y-2 text-secondary">
              <div className="font-bold text-ink flex items-center justify-between">
                <span>操作步骤：</span>
                <a
                  href={deviceCodeData.verificationUri}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline inline-flex items-center gap-1 font-normal text-[11px]"
                >
                  在浏览器中打开验证页
                  <IconExternalLink size={12} />
                </a>
              </div>
              <ol className="list-decimal pl-4 space-y-1.5 leading-relaxed text-[11px]">
                <li>GitHub 验证页面已在浏览器新窗口打开（若未打开请点击右上角链接）。</li>
                <li>
                  在页面中粘贴上方 8 位授权码 <strong>{deviceCodeData.userCode}</strong>{' '}
                  并确认授权。
                </li>
                <li>完成授权后，本工作台将自动感应并进入下一步绑定确认。</li>
              </ol>
            </div>

            {/* 轮询进度状态 */}
            <div className="flex items-center justify-between rounded-control border border-line p-3 bg-surface text-muted">
              <div className="flex items-center gap-2">
                <IconRefreshCw size={14} className="animate-spin text-accent" />
                <span>等待 GitHub 授权确认中...</span>
              </div>
              <span className="text-[11px] font-mono">已轮询 {pollCount} 次</span>
            </div>

            {authError && (
              <div className="flex items-center gap-1.5 text-xs text-critical">
                <IconAlertCircle size={14} />
                <span>{authError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={() => {
                  stopPolling();
                  setAuthStep('idle');
                }}
              >
                取消
              </Button>
            </div>
          </div>
        )}

        {/* Step: Expired */}
        {authStep === 'expired' && (
          <div className="space-y-4 text-xs text-center py-4">
            <div className="flex size-12 items-center justify-center rounded-full bg-critical/10 text-critical mx-auto">
              <IconAlertCircle size={24} />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-bold text-ink">授权码已过期</div>
              <p className="text-muted">GitHub 授权超时，请点击下方按钮重新获取授权码。</p>
            </div>
            <div className="flex justify-center gap-2 pt-2">
              <Button type="button" variant="ghost" size="md" onClick={() => setAuthStep('idle')}>
                关闭
              </Button>
              <Button type="button" variant="primary" size="md" onClick={handleStartGitHubAuth}>
                重新发起授权
              </Button>
            </div>
          </div>
        )}

        {/* Step: Denied */}
        {authStep === 'denied' && (
          <div className="space-y-4 text-xs text-center py-4">
            <div className="flex size-12 items-center justify-center rounded-full bg-critical/10 text-critical mx-auto">
              <IconAlertCircle size={24} />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-bold text-ink">授权已被拒绝</div>
              <p className="text-muted">您在 GitHub 页面取消或拒绝了授权请求。</p>
            </div>
            <div className="flex justify-center gap-2 pt-2">
              <Button type="button" variant="ghost" size="md" onClick={() => setAuthStep('idle')}>
                关闭
              </Button>
              <Button type="button" variant="primary" size="md" onClick={handleStartGitHubAuth}>
                重新尝试
              </Button>
            </div>
          </div>
        )}

        {/* Step: Bind Direction (选择绑定方向) */}
        {authStep === 'bind_direction' && authorizedUser && (
          <div className="space-y-4 text-xs">
            {/* GitHub 身份卡片 */}
            <div className="flex items-center gap-3 rounded-panel border border-line bg-surface-2 p-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-ink text-surface">
                <IconGithub size={18} />
              </div>
              <div>
                <div className="font-bold text-ink flex items-center gap-1.5">
                  <span>@{authorizedUser.login}</span>
                  <Chip tone="good">授权成功</Chip>
                </div>
                <div className="text-[11px] text-muted">GitHub User ID: {authorizedUser.id}</div>
              </div>
            </div>

            {/* 同步方向单选卡片 */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted">
                选择设置初始化同步方向
              </label>

              {/* 选项 1：云端覆写本地 */}
              <div
                onClick={() => setBindDirection('cloud-to-local')}
                className={`cursor-pointer rounded-panel border p-3.5 transition-all ${
                  bindDirection === 'cloud-to-local'
                    ? 'border-accent bg-accent-soft/40 shadow-xs ring-1 ring-accent/30'
                    : 'border-line bg-surface hover:bg-surface-2'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="radio"
                    name="bindDirection"
                    checked={bindDirection === 'cloud-to-local'}
                    onChange={() => setBindDirection('cloud-to-local')}
                    className="mt-0.5 text-accent focus:ring-accent"
                  />
                  <div className="space-y-1">
                    <div className="font-bold text-ink flex items-center gap-2">
                      <span>从云端拉取并覆写本地（推荐）</span>
                      <Chip tone="accent">换机/多端</Chip>
                    </div>
                    <p className="text-muted leading-relaxed text-[11px]">
                      从云端 Gist 同步已有的主题、时区与 WebDAV
                      凭据，覆盖当前设备配置。适合新设备接入。
                    </p>
                  </div>
                </div>
              </div>

              {/* 选项 2：本地覆写云端 */}
              <div
                onClick={() => setBindDirection('local-to-cloud')}
                className={`cursor-pointer rounded-panel border p-3.5 transition-all ${
                  bindDirection === 'local-to-cloud'
                    ? 'border-accent bg-accent-soft/40 shadow-xs ring-1 ring-accent/30'
                    : 'border-line bg-surface hover:bg-surface-2'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="radio"
                    name="bindDirection"
                    checked={bindDirection === 'local-to-cloud'}
                    onChange={() => setBindDirection('local-to-cloud')}
                    className="mt-0.5 text-accent focus:ring-accent"
                  />
                  <div className="space-y-1">
                    <div className="font-bold text-ink">以本地配置覆写云端</div>
                    <p className="text-muted leading-relaxed text-[11px]">
                      将当前设备的本地设置与 WebDAV 凭据加密推送到云端
                      Gist。适合初次上云或以当前设备为准。
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 数据库安全隔离警示 */}
            <div className="rounded-control bg-surface-2 p-3 text-[11px] text-muted space-y-1 border border-line">
              <div className="font-bold text-ink">⚠️ 业务数据安全声明：</div>
              <div>
                绑定与同步<strong>仅作用于设置偏好与凭据</strong>，绝不动本地 SQLite
                数据库中的任何待办、日历排程或秋招投递数据。
              </div>
            </div>

            {authError && (
              <div className="flex items-center gap-1.5 text-xs text-critical">
                <IconAlertCircle size={14} />
                <span>{authError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <Button type="button" variant="ghost" size="md" onClick={() => setAuthStep('idle')}>
                取消
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                disabled={bindMutation.isPending}
                onClick={handleConfirmBind}
              >
                {bindMutation.isPending ? '正在绑定...' : '确认绑定'}
              </Button>
            </div>
          </div>
        )}

        {/* Step: Bind Success Hint (引导查看备份与恢复) */}
        {authStep === 'bind_success_hint' && (
          <div className="space-y-4 text-xs py-2">
            <div className="flex items-center gap-3 rounded-panel border border-good/30 bg-good-soft p-4">
              <div className="flex size-10 items-center justify-center rounded-xl bg-good text-white font-bold shrink-0">
                <IconCheck size={20} />
              </div>
              <div className="space-y-0.5">
                <div className="font-bold text-ink text-sm">GitHub 账号绑定成功！</div>
                <div className="text-muted text-[11px]">
                  系统已成功将 GitHub 身份关联至「{activeAccount?.displayName}」
                </div>
              </div>
            </div>

            <div className="rounded-panel border border-line bg-surface-2 p-4 space-y-2 text-secondary leading-relaxed">
              <div className="font-bold text-ink flex items-center gap-1.5">
                <IconDatabase size={15} className="text-accent" />
                <span>检测云端历史备份与恢复提示</span>
              </div>
              <p className="text-[11px] text-muted">
                如果您的云端 WebDAV
                保管库中已有历史备份文件，您可以前往「数据与存储」面板查看云端备份列表、比对与当前本地数据库的行级差异，并按需发起数据恢复。
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <Button type="button" variant="ghost" size="md" onClick={() => setAuthStep('idle')}>
                完成并留在本页
              </Button>
              {onNavigateToStorage && (
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={() => {
                    setAuthStep('idle');
                    onNavigateToStorage();
                  }}
                >
                  前往数据与存储面板
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
