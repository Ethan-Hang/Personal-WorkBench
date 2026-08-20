import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AccountView, BindDirection, GitHubDeviceCode } from '@workbench/sync/contract';
import {
  Avatar,
  Button,
  Chip,
  Field,
  controlClass,
  IconAlertCircle,
  IconCheck,
  IconCloud,
  IconCopy,
  IconDatabase,
  IconEdit,
  IconExternalLink,
  IconGithub,
  IconPlus,
  IconRefreshCw,
  IconShield,
  IconTrash,
  IconUpload,
  Modal,
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
  updateAccount,
} from './accountsApi.js';

const PRESET_AVATARS: Array<{ id: string; label: string; url: string }> = [
  {
    id: 'aurora-violet',
    label: '极光紫',
    url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='%236366f1'/><stop offset='100%' stop-color='%23a855f7'/></linearGradient></defs><rect width='100' height='100' rx='50' fill='url(%23g)'/><circle cx='50' cy='38' r='16' fill='%23ffffff' opacity='0.9'/><path d='M26 80 C26 62 74 62 74 80' fill='%23ffffff' opacity='0.9'/></svg>",
  },
  {
    id: 'ocean-blue',
    label: '深海蓝',
    url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='%230284c7'/><stop offset='100%' stop-color='%232563eb'/></linearGradient></defs><rect width='100' height='100' rx='50' fill='url(%23g)'/><circle cx='50' cy='38' r='16' fill='%23ffffff' opacity='0.9'/><path d='M26 80 C26 62 74 62 74 80' fill='%23ffffff' opacity='0.9'/></svg>",
  },
  {
    id: 'emerald-green',
    label: '松石绿',
    url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='%23059669'/><stop offset='100%' stop-color='%2310b981'/></linearGradient></defs><rect width='100' height='100' rx='50' fill='url(%23g)'/><circle cx='50' cy='38' r='16' fill='%23ffffff' opacity='0.9'/><path d='M26 80 C26 62 74 62 74 80' fill='%23ffffff' opacity='0.9'/></svg>",
  },
  {
    id: 'sunset-amber',
    label: '落日金',
    url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='%23d97706'/><stop offset='100%' stop-color='%23ea580c'/></linearGradient></defs><rect width='100' height='100' rx='50' fill='url(%23g)'/><circle cx='50' cy='38' r='16' fill='%23ffffff' opacity='0.9'/><path d='M26 80 C26 62 74 62 74 80' fill='%23ffffff' opacity='0.9'/></svg>",
  },
  {
    id: 'rose-coral',
    label: '珊瑚粉',
    url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='%23e11d48'/><stop offset='100%' stop-color='%23f43f5e'/></linearGradient></defs><rect width='100' height='100' rx='50' fill='url(%23g)'/><circle cx='50' cy='38' r='16' fill='%23ffffff' opacity='0.9'/><path d='M26 80 C26 62 74 62 74 80' fill='%23ffffff' opacity='0.9'/></svg>",
  },
  {
    id: 'slate-charcoal',
    label: '曜石黑',
    url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='%23334155'/><stop offset='100%' stop-color='%230f172a'/></linearGradient></defs><rect width='100' height='100' rx='50' fill='url(%23g)'/><circle cx='50' cy='38' r='16' fill='%23ffffff' opacity='0.9'/><path d='M26 80 C26 62 74 62 74 80' fill='%23ffffff' opacity='0.9'/></svg>",
  },
  {
    id: 'cyber-cyan',
    label: '赛博青',
    url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='%2306b6d4'/><stop offset='100%' stop-color='%233b82f6'/></linearGradient></defs><rect width='100' height='100' rx='50' fill='url(%23g)'/><circle cx='50' cy='38' r='16' fill='%23ffffff' opacity='0.9'/><path d='M26 80 C26 62 74 62 74 80' fill='%23ffffff' opacity='0.9'/></svg>",
  },
  {
    id: 'warm-sand',
    label: '麦芒暖杏',
    url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='%23b45309'/><stop offset='100%' stop-color='%23d97706'/></linearGradient></defs><rect width='100' height='100' rx='50' fill='url(%23g)'/><circle cx='50' cy='38' r='16' fill='%23ffffff' opacity='0.9'/><path d='M26 80 C26 62 74 62 74 80' fill='%23ffffff' opacity='0.9'/></svg>",
  },
];

async function processImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择有效的图片文件（JPG, PNG, WebP, SVG 等）');
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取图片文件失败'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('图片加载解析失败'));
      img.onload = () => {
        try {
          const size = Math.min(img.width, img.height);
          const startX = (img.width - size) / 2;
          const startY = (img.height - size) / 2;
          const targetSize = 256;
          const canvas = document.createElement('canvas');
          canvas.width = targetSize;
          canvas.height = targetSize;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            return resolve(img.src);
          }
          ctx.drawImage(img, startX, startY, size, size, 0, 0, targetSize, targetSize);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          resolve(dataUrl);
        } catch {
          resolve(img.src);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

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

  // 编辑个人资料与头像弹窗状态
  const [editTarget, setEditTarget] = useState<AccountView | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editAvatar, setEditAvatar] = useState<string | null>(null);
  const [avatarTab, setAvatarTab] = useState<'presets' | 'upload' | 'url'>('presets');
  const [urlInput, setUrlInput] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
      github: { login: string; userId: number; avatarUrl?: string };
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

  // 6. 更新账号资料与头像 Mutation
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: { displayName?: string; avatar?: string | null };
    }) => updateAccount(id, patch),
    onSuccess: (res) => {
      void queryClient.setQueryData(['accounts'], res);
      setEditTarget(null);
      setEditError(null);
      showToast('账户资料与头像已更新');
    },
    onError: (err: Error) => {
      setEditError(err.message);
    },
  });

  function openEditModal(account: AccountView) {
    setEditTarget(account);
    setEditDisplayName(account.displayName);
    setEditAvatar(account.avatar ?? null);
    setUrlInput(account.avatar && !account.avatar.startsWith('data:') ? account.avatar : '');
    setEditError(null);
    setAvatarTab('presets');
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingImage(true);
      setEditError(null);
      const dataUrl = await processImageFile(file);
      setEditAvatar(dataUrl);
    } catch (err: unknown) {
      setEditError((err as Error).message);
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    const trimmedName = editDisplayName.trim();
    if (!trimmedName) {
      setEditError('账户名称不能为空');
      return;
    }
    setEditError(null);
    updateMutation.mutate({
      id: editTarget.id,
      patch: {
        displayName: trimmedName,
        avatar: editAvatar,
      },
    });
  }

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
      {/* Toast 提示条 */}
      {toastMessage && (
        <div className="rounded-panel border border-accent/30 bg-accent-soft px-4 py-2.5 text-xs font-semibold text-accent animate-fade-in flex items-center gap-2">
          <IconCheck size={14} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 模块 1：Windows 风格的账户主信息 Hero Banner */}
      {/* ========================================================================= */}
      {activeAccount && (
        <div className="rounded-panel border border-line bg-surface p-5 shadow-xs transition-colors">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
            {/* 左侧头像与用户资料 */}
            <div className="flex items-center gap-4">
              {/* 大圆形头像，支持悬停更换 */}
              <Avatar
                account={activeAccount}
                size="2xl"
                showStatus
                editable
                onEdit={() => openEditModal(activeAccount)}
                className="hover:scale-105 transition-transform"
              />

              {/* 账户名与信息 */}
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-lg font-bold text-ink truncate leading-tight">
                    {activeAccount.displayName}
                  </h2>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon={<IconEdit size={12} />}
                    className="h-6 px-2 text-[11px] text-muted hover:text-ink"
                    onClick={() => openEditModal(activeAccount)}
                    title="设置头像与账户资料"
                  >
                    设置头像
                  </Button>
                  {activeAccount.kind === 'github' && activeAccount.github ? (
                    <Chip tone="neutral" icon={<IconGithub size={11} />}>
                      @{activeAccount.github.login}
                    </Chip>
                  ) : (
                    <Chip tone="accent">本地工作区</Chip>
                  )}
                </div>
                <div className="text-xs text-secondary leading-tight">
                  {activeAccount.kind === 'github' && activeAccount.github
                    ? `GitHub 关联账户 · 主要工作区 · 数据文件独立`
                    : `本地独立账户 · 独立 SQLite 数据库`}
                </div>
                <div className="text-[11px] text-muted font-mono truncate">
                  {activeAccount.id} · 创建于 {formatUtcToLocal(activeAccount.createdAt).date}
                </div>
              </div>
            </div>

            {/* 右侧主快捷操作 */}
            <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
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
                  解除 GitHub 关联
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  icon={<IconGithub size={14} />}
                  onClick={handleStartGitHubAuth}
                >
                  绑定 GitHub 账户
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 模块 2：Windows 设置风格的「账户信息」卡片组 (Your info) */}
      {/* ========================================================================= */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-bold text-ink">账户与存储信息</h3>
          <p className="text-xs text-secondary">
            当前账户的物理存储文件、活跃记录与系统保管库保护状态
          </p>
        </div>

        <div className="rounded-panel border border-line bg-surface overflow-hidden divide-y divide-line text-xs shadow-2xs">
          {/* 数据存储路径 */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 gap-2 hover:bg-surface-2/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <IconDatabase size={18} />
              </div>
              <div>
                <div className="font-semibold text-ink">本地数据存储路径</div>
                <div className="text-muted text-[11px] font-mono mt-0.5">
                  data/local/accounts/{activeId}/workbench.db
                </div>
              </div>
            </div>
            <Chip tone="good">WAL 模式 · 物理隔离</Chip>
          </div>

          {/* 活跃记录与时间线 */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 gap-2 hover:bg-surface-2/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-secondary">
                <IconShield size={18} />
              </div>
              <div>
                <div className="font-semibold text-ink">凭据与安全保护</div>
                <div className="text-muted text-[11px] mt-0.5">
                  本地凭据经 OS 系统保管库保护，业务数据绝不外泄
                </div>
              </div>
            </div>
            <Chip tone="neutral">系统保管库优先</Chip>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 模块 3：Windows 设置风格的「其他账户与工作区」卡片组 (Other users & Workspaces) */}
      {/* ========================================================================= */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-ink">其他账户与工作区</h3>
            <p className="text-xs text-secondary">
              在不同的本地独立工作区之间秒级切换；每个工作区拥有专属数据
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={<IconPlus size={14} />}
            onClick={() => {
              setNewDisplayName('');
              setCreateError(null);
              setIsCreateModalOpen(true);
            }}
          >
            添加新账户
          </Button>
        </div>

        <div className="rounded-panel border border-line bg-surface overflow-hidden divide-y divide-line text-xs shadow-2xs">
          {isLoading ? (
            <div className="py-8 text-center text-xs text-muted">
              <IconRefreshCw size={18} className="animate-spin mx-auto mb-2 text-secondary" />
              <span>正在加载账户列表...</span>
            </div>
          ) : isError ? (
            <div className="py-6 text-center text-xs text-critical space-y-2">
              <p>加载账户列表失败：{(error as Error)?.message}</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => void refetch()}>
                重试
              </Button>
            </div>
          ) : (
            accounts.map((acc) => {
              const isActive = acc.id === activeId;
              const isSwitchingThis =
                switchMutation.isPending && switchMutation.variables === acc.id;

              return (
                <div
                  key={acc.id}
                  className={`flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 gap-3 transition-colors ${
                    isActive ? 'bg-surface-2/40' : 'hover:bg-surface-2/20'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <Avatar account={acc} size="md" editable onEdit={() => openEditModal(acc)} />

                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-ink text-[13px] truncate">
                          {acc.displayName}
                        </span>
                        {isActive && <Chip tone="accent">当前主要账户</Chip>}
                        {acc.kind === 'github' && acc.github && (
                          <Chip tone="neutral" icon={<IconGithub size={10} />}>
                            @{acc.github.login}
                          </Chip>
                        )}
                      </div>
                      <div className="text-[11px] text-muted truncate">
                        ID: {acc.id} · 最近使用：{formatUtcToLocal(acc.lastUsedAt).full || '—'}
                      </div>
                    </div>
                  </div>

                  {/* 动作按钮 */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon={<IconEdit size={13} />}
                      title="编辑头像与账户名称"
                      onClick={() => openEditModal(acc)}
                    >
                      编辑
                    </Button>
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
                              正在切换...
                            </span>
                          ) : (
                            '切换'
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-critical hover:bg-critical/10 hover:border-critical/30"
                          title="彻底删除此账户与其所有本地数据"
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
                      <span className="text-[11px] text-muted px-2.5 py-1 bg-surface-2 rounded-control font-medium">
                        当前使用中
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 模块 4：Windows 设置风格的「云端同步与备份」卡片组 (Cloud Sync & Backup) */}
      {/* ========================================================================= */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-bold text-ink">云端同步与备份</h3>
          <p className="text-xs text-secondary">
            关联 GitHub 开启 Gist 设置同步，或配置 WebDAV 远程数据快照
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* 卡片 1：GitHub 账户关联 */}
          <div className="rounded-panel border border-line bg-surface p-4 flex flex-col justify-between shadow-2xs hover:border-line transition-all">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex size-9 items-center justify-center rounded-xl bg-ink text-surface">
                  <IconGithub size={18} />
                </div>
                {activeAccount?.kind === 'github' ? (
                  <Chip tone="good">已关联 Gist</Chip>
                ) : (
                  <Chip tone="neutral">未连接</Chip>
                )}
              </div>
              <div>
                <div className="font-bold text-ink text-sm">GitHub 账户与设置同步</div>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  {activeAccount?.kind === 'github' && activeAccount.github
                    ? `已成功绑定 @${activeAccount.github.login}。系统偏好设置与 WebDAV 凭据（零知识加密）将自动同步至云端 Gist。`
                    : `连接 GitHub 后可通过 Secret Gist 安全同步工作台外观、时区与凭据，换设备自动恢复。`}
                </p>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-end">
              {activeAccount?.kind === 'github' ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setUnbindError(null);
                    setIsUnbindModalOpen(true);
                  }}
                >
                  管理或解除关联
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={<IconGithub size={14} />}
                  onClick={handleStartGitHubAuth}
                >
                  连接 GitHub
                </Button>
              )}
            </div>
          </div>

          {/* 卡片 2：WebDAV 数据备份 */}
          <div className="rounded-panel border border-line bg-surface p-4 flex flex-col justify-between shadow-2xs hover:border-line transition-all">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <IconCloud size={18} />
                </div>
                <Chip tone="accent">业务数据保障</Chip>
              </div>
              <div>
                <div className="font-bold text-ink text-sm">WebDAV 远程快照与恢复</div>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  使用坚果云 / Nextcloud 等 WebDAV 存储完整 SQLite
                  数据库快照。支持行级差异比对、安全回滚与断电续命。
                </p>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={<IconDatabase size={14} />}
                onClick={onNavigateToStorage}
              >
                前往数据与存储管理
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 弹窗 1：新建本地账号 Modal */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="新建本地工作区账户"
        description="创建一个全新的独立工作台账户，拥有独立的 SQLite 数据库文件与设置"
      >
        <form onSubmit={handleCreateAccount} className="space-y-4">
          <Field label="账户显示名称（1–40 个字符，例如「秋招求职」、「工作日常」）">
            <input
              type="text"
              autoFocus
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              placeholder="请输入账户名称"
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
              新账户将分配唯一
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
        title="彻底删除账户与数据"
        description="此操作极其危险且不可逆，请谨慎确认"
      >
        {deleteTarget && (
          <div className="space-y-4 text-xs">
            <div className="rounded-panel border border-critical/30 bg-critical/10 p-3.5 text-critical space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <IconAlertCircle size={18} />
                <span>您正在删除账户「{deleteTarget.displayName}」</span>
              </div>
              <p className="leading-relaxed">
                删除操作将<strong>彻底永久销毁</strong>该账户的所有本地数据文件（包括 SQLite
                主库文件 <code>accounts/{deleteTarget.id}/workbench.db</code> 以及所有相关 WAL
                日志），账户下的全部待办事项、日历排程与投递记录都将无法恢复！
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
                我已知晓该操作将永久销毁账户「{deleteTarget.displayName}」的所有本地数据且无法找回。
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
        title="解除 GitHub 关联"
        description="将当前工作区恢复为纯本地模式"
      >
        <div className="space-y-4 text-xs">
          <div className="rounded-panel border border-line bg-surface-2 p-3.5 space-y-2 text-secondary leading-relaxed">
            <div className="font-bold text-ink">解绑规则说明：</div>
            <ul className="list-disc pl-4 space-y-1">
              <li>解绑后，当前账户将恢复为纯本地账户，本地保存的 GitHub 访问凭据将被安全清理。</li>
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
              {unbindMutation.isPending ? '正在解绑...' : '确认解除关联'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* 弹窗 4：GitHub Device Flow 授权与绑定（高对比度精细化设计，告别中等灰色遮罩体验） */}
      {/* ========================================================================= */}
      <Modal
        isOpen={authStep !== 'idle'}
        onClose={() => {
          stopPolling();
          setAuthStep('idle');
        }}
        title={
          authStep === 'bind_direction'
            ? '选择设置同步策略'
            : authStep === 'bind_success_hint'
              ? 'GitHub 关联成功'
              : '连接你的 GitHub 账户'
        }
        description={
          authStep === 'bind_direction'
            ? '请确定本地偏好与云端 Gist 备份的初始化同步方向'
            : authStep === 'bind_success_hint'
              ? '工作台已成功关联 GitHub 身份'
              : '通过 GitHub Device Flow 官方协议完成快捷安全授权'
        }
        maxWidth="max-w-md"
      >
        {/* Step: Starting */}
        {authStep === 'starting' && (
          <div className="py-10 text-center space-y-3 text-xs text-muted">
            <IconRefreshCw size={28} className="animate-spin mx-auto text-accent" />
            <div className="font-medium text-ink">正在向 GitHub 发起安全授权会话...</div>
          </div>
        )}

        {/* Step: Authenticating (高质感 GitHub 授权卡片) */}
        {authStep === 'authenticating' && deviceCodeData && (
          <div className="space-y-4 text-xs">
            {/* 核心授权码展示卡片 */}
            <div className="rounded-panel border-2 border-accent/40 bg-surface-2 p-5 text-center space-y-3 shadow-xs">
              <div className="text-[11px] font-bold text-muted uppercase tracking-wider">
                设备授权验证码 (Device Code)
              </div>

              <div className="flex items-center justify-center gap-3">
                <div className="font-mono text-3xl sm:text-4xl font-extrabold tracking-[0.2em] text-accent select-all px-3 py-1 bg-surface rounded-control border border-line shadow-inner">
                  {deviceCodeData.userCode}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  icon={
                    copiedCode ? (
                      <IconCheck size={16} className="text-good" />
                    ) : (
                      <IconCopy size={16} />
                    )
                  }
                  onClick={() => handleCopyCode(deviceCodeData.userCode)}
                  title="复制授权码"
                >
                  {copiedCode ? '已复制' : '复制'}
                </Button>
              </div>

              {copiedCode && (
                <div className="text-[11px] font-semibold text-good animate-fade-in">
                  ✓ 授权码已自动复制到剪贴板
                </div>
              )}
            </div>

            {/* 打开验证页面主要按钮 */}
            <div className="space-y-2">
              <a
                href={deviceCodeData.verificationUri}
                target="_blank"
                rel="noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 rounded-control border border-ink bg-ink text-surface py-2.5 text-xs font-bold hover:opacity-90 transition-all shadow-xs"
              >
                <span>在浏览器中打开 GitHub 验证页</span>
                <IconExternalLink size={14} />
              </a>
            </div>

            {/* 步骤清单 */}
            <div className="rounded-control bg-surface-2/60 p-3.5 space-y-2 text-secondary border border-line/60">
              <div className="font-bold text-ink text-[11px]">快速操作指引：</div>
              <ol className="list-decimal pl-4 space-y-1 leading-relaxed text-[11px] text-muted">
                <li>
                  点击上方按钮前往 GitHub 验证页（<code>github.com/login/device</code>）。
                </li>
                <li>
                  粘贴授权码 <strong>{deviceCodeData.userCode}</strong> 并点击「Continue /
                  Authorize」。
                </li>
                <li>完成授权后，本窗口将自动完成连接。</li>
              </ol>
            </div>

            {/* 实时轮询等待状态 */}
            <div className="flex items-center justify-between rounded-control border border-line p-3 bg-surface text-muted">
              <div className="flex items-center gap-2 text-xs">
                <IconRefreshCw size={14} className="animate-spin text-accent" />
                <span>等待 GitHub 授权确认中...</span>
              </div>
              <span className="text-[11px] font-mono">第 {pollCount} 次轮询</span>
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
              <p className="text-muted">GitHub 授权超时，请点击下方按钮重新发起。</p>
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
              <div className="text-sm font-bold text-ink">授权已被取消</div>
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
            <div className="flex items-center gap-3 rounded-panel border border-line bg-surface-2 p-3.5">
              <div className="flex size-10 items-center justify-center rounded-xl bg-ink text-surface shrink-0">
                <IconGithub size={20} />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-ink text-sm flex items-center gap-1.5 truncate">
                  <span>@{authorizedUser.login}</span>
                  <Chip tone="good">授权成功</Chip>
                </div>
                <div className="text-[11px] text-muted">GitHub User ID: {authorizedUser.id}</div>
              </div>
            </div>

            {/* 同步方向单选卡片 */}
            <div className="space-y-2.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted">
                选择初始化配置同步策略
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
                      <span>从云端拉取配置覆写本地（推荐）</span>
                      <Chip tone="accent">换设备/恢复</Chip>
                    </div>
                    <p className="text-muted leading-relaxed text-[11px]">
                      从云端 Gist 同步已有主题、时区与 WebDAV 凭据，覆盖当前设备配置。
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
                    <div className="font-bold text-ink">将本地配置推送到云端 Gist</div>
                    <p className="text-muted leading-relaxed text-[11px]">
                      将当前设备的设置与 WebDAV 凭据加密上传至云端 Gist。适合初次上云。
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 数据库安全隔离声明 */}
            <div className="rounded-control bg-surface-2 p-3 text-[11px] text-muted space-y-1 border border-line">
              <div className="font-bold text-ink">⚠️ 数据安全声明：</div>
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
                <div className="font-bold text-ink text-sm">GitHub 账户绑定成功！</div>
                <div className="text-muted text-[11px]">
                  系统已成功将 GitHub 身份关联至当前工作区
                </div>
              </div>
            </div>

            <div className="rounded-panel border border-line bg-surface-2 p-4 space-y-2 text-secondary leading-relaxed">
              <div className="font-bold text-ink flex items-center gap-1.5">
                <IconDatabase size={15} className="text-accent" />
                <span>云端历史备份与恢复提示</span>
              </div>
              <p className="text-[11px] text-muted">
                若您的 WebDAV
                保管库中存有该账号的历史数据备份，您可前往「数据与存储」面板查看云端备份列表、比对与本地数据库的行级差异，并按需恢复。
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <Button type="button" variant="ghost" size="md" onClick={() => setAuthStep('idle')}>
                完成
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

      {/* ========================================================================= */}
      {/* 弹窗 5：编辑个人资料与设置头像 Modal */}
      {/* ========================================================================= */}
      <Modal
        isOpen={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title="设置头像与账户资料"
        description="自定义账户头像与显示名称，支持本地上传、精选预设与 GitHub 头像联动"
        maxWidth="max-w-lg"
      >
        {editTarget && (
          <form onSubmit={handleSaveProfile} className="space-y-5 text-xs">
            {/* 顶部大头像与当前生效指示 */}
            <div className="flex items-center gap-4 p-4 rounded-panel bg-surface-2/60 border border-line">
              <Avatar
                account={{
                  ...editTarget,
                  displayName: editDisplayName || editTarget.displayName,
                  avatar: editAvatar,
                }}
                size="2xl"
                showStatus
              />
              <div className="space-y-1 min-w-0 flex-1">
                <div className="font-bold text-ink text-sm truncate">
                  {editDisplayName.trim() || editTarget.displayName}
                </div>
                <div className="text-[11px] text-muted">
                  {editAvatar
                    ? editAvatar.startsWith('data:image/svg')
                      ? '当前预览：预设艺术头像'
                      : editAvatar.startsWith('data:')
                        ? '当前预览：自定义上传图片'
                        : '当前预览：远程图片 URL'
                    : editTarget.kind === 'github' || editTarget.github
                      ? '当前预览：GitHub 官方头像'
                      : '当前预览：系统默认经典头像'}
                </div>
                {/* 快速动作：恢复默认 / 使用 GitHub */}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  {(editTarget.kind === 'github' || editTarget.github) && (
                    <button
                      type="button"
                      onClick={() => setEditAvatar(null)}
                      className={`text-[11px] px-2 py-0.5 rounded border transition-colors flex items-center gap-1 ${
                        editAvatar === null
                          ? 'border-ink bg-ink text-surface font-semibold'
                          : 'border-line bg-surface hover:bg-surface-2 text-secondary'
                      }`}
                    >
                      <IconGithub size={11} />
                      <span>使用 GitHub 头像</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditAvatar(null)}
                    className="text-[11px] px-2 py-0.5 rounded border border-line bg-surface hover:bg-surface-2 text-secondary transition-colors"
                  >
                    恢复默认
                  </button>
                </div>
              </div>
            </div>

            {/* 账户显示名称 */}
            <Field label="账户显示名称（1–40 个字符）">
              <input
                type="text"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                placeholder="请输入账户显示名称"
                maxLength={40}
                className={controlClass}
              />
            </Field>

            {/* 头像来源分类 Tabs */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-line pb-2">
                <div className="font-bold text-ink text-xs">选择新头像</div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setAvatarTab('presets')}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                      avatarTab === 'presets'
                        ? 'bg-accent text-white font-bold'
                        : 'text-muted hover:text-ink hover:bg-surface-2'
                    }`}
                  >
                    精选预设
                  </button>
                  <button
                    type="button"
                    onClick={() => setAvatarTab('upload')}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                      avatarTab === 'upload'
                        ? 'bg-accent text-white font-bold'
                        : 'text-muted hover:text-ink hover:bg-surface-2'
                    }`}
                  >
                    本地上传
                  </button>
                  <button
                    type="button"
                    onClick={() => setAvatarTab('url')}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                      avatarTab === 'url'
                        ? 'bg-accent text-white font-bold'
                        : 'text-muted hover:text-ink hover:bg-surface-2'
                    }`}
                  >
                    图片链接
                  </button>
                </div>
              </div>

              {/* Tab 1: 预设精美头像 */}
              {avatarTab === 'presets' && (
                <div className="grid grid-cols-4 gap-2.5 py-1">
                  {PRESET_AVATARS.map((preset) => {
                    const isSelected = editAvatar === preset.url;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setEditAvatar(preset.url)}
                        className={`group relative flex flex-col items-center gap-1.5 p-2 rounded-panel border transition-all ${
                          isSelected
                            ? 'border-accent bg-accent-soft/40 ring-2 ring-accent shadow-xs'
                            : 'border-line bg-surface hover:bg-surface-2 hover:border-line'
                        }`}
                      >
                        <img
                          src={preset.url}
                          alt={preset.label}
                          className="size-11 rounded-full object-cover shadow-2xs"
                        />
                        <span className="text-[10px] text-muted group-hover:text-ink truncate max-w-full font-medium">
                          {preset.label}
                        </span>
                        {isSelected && (
                          <span className="absolute top-1 right-1 size-3.5 rounded-full bg-accent text-white flex items-center justify-center text-[9px]">
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Tab 2: 本地上传 */}
              {avatarTab === 'upload' && (
                <div className="space-y-3 py-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="cursor-pointer flex flex-col items-center justify-center p-6 border-2 border-dashed border-line hover:border-accent rounded-panel bg-surface hover:bg-surface-2/40 transition-all text-center space-y-2"
                  >
                    <div className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                      {uploadingImage ? (
                        <IconRefreshCw size={20} className="animate-spin" />
                      ) : (
                        <IconUpload size={20} />
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-ink text-xs">
                        {uploadingImage ? '正在处理图片...' : '点击选择或拖放图片至此处'}
                      </div>
                      <p className="text-[11px] text-muted mt-0.5">
                        支持 JPG、PNG、WebP、SVG，将自动智能居中裁剪
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: 图片链接 */}
              {avatarTab === 'url' && (
                <div className="space-y-3 py-1">
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="https://example.com/avatar.png"
                      className={controlClass}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="md"
                      disabled={!urlInput.trim()}
                      onClick={() => setEditAvatar(urlInput.trim())}
                    >
                      应用
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted">
                    填入公开可访问的 HTTPS 图片网络链接作为头像。
                  </p>
                </div>
              )}
            </div>

            {editError && (
              <div className="flex items-center gap-1.5 text-xs text-critical">
                <IconAlertCircle size={14} />
                <span>{editError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <Button type="button" variant="ghost" size="md" onClick={() => setEditTarget(null)}>
                取消
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={updateMutation.isPending || !editDisplayName.trim()}
              >
                {updateMutation.isPending ? '保存中...' : '保存更改'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
