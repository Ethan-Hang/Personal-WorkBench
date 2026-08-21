import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BackupListItem } from '@workbench/sync/contract';
import {
  Button,
  Chip,
  Field,
  controlClass,
  IconAlertCircle,
  IconCheck,
  IconClock,
  IconDatabase,
  IconFileText,
  IconFolder,
  IconRefreshCw,
  IconShield,
  IconUser,
  Modal,
  useTimezone,
} from '@workbench/ui';
import { switchAccount } from '../accounts/accountsApi.js';
import {
  confirmLocalImport,
  importAsNewAccount,
  pickLocalFile,
  preflightLocalImport,
  uploadLocalBackupFile,
} from './localImportApi.js';

type ImportDirection = 'overwrite' | 'new-account';

export function joinBackupFilePath(dir?: string, name?: string): string {
  if (!name) return '';
  if (!dir) return name;
  const cleanDir = dir.trim().replace(/[/\\]+$/, '');
  const separator = cleanDir.includes('\\') ? '\\' : '/';
  return `${cleanDir}${separator}${name}`;
}

export function AutoScrollPath({
  text,
  prefix,
  className = '',
}: {
  text?: string;
  prefix?: React.ReactNode;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflowDistance, setOverflowDistance] = useState(0);

  useEffect(() => {
    function updateOverflow() {
      if (!containerRef.current || !textRef.current) return;
      const containerWidth = containerRef.current.clientWidth;
      const textWidth = textRef.current.scrollWidth;
      if (textWidth > containerWidth) {
        setOverflowDistance(textWidth - containerWidth);
      } else {
        setOverflowDistance(0);
      }
    }

    updateOverflow();
    const timer = setTimeout(updateOverflow, 60);
    window.addEventListener('resize', updateOverflow);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateOverflow);
    };
  }, [text]);

  if (!text) return null;

  const duration = Math.max(4, overflowDistance / 30 + 3);
  const animKey = `scroll_${text.replace(/[^a-zA-Z0-9]/g, '_').slice(-24)}_${overflowDistance}`;

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden whitespace-nowrap select-all ${className}`}
      title={text}
    >
      <div
        style={
          overflowDistance > 0
            ? {
                animation: `${animKey} ${duration}s ease-in-out 1.2s infinite alternate`,
                willChange: 'transform',
              }
            : undefined
        }
        className="inline-block hover:[animation-play-state:paused]"
      >
        {prefix}
        <span ref={textRef} className="font-mono inline-block text-[11px] text-muted">
          {text}
        </span>
      </div>

      {overflowDistance > 0 && (
        <style>{`
          @keyframes ${animKey} {
            0%, 15% {
              transform: translateX(0);
            }
            85%, 100% {
              transform: translateX(-${overflowDistance}px);
            }
          }
        `}</style>
      )}
    </div>
  );
}

export interface LocalImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFilePath?: string;
  initialDirection?: ImportDirection;
  knownBackups?: BackupListItem[];
  resolvedDir?: string;
  onSuccess?: (result: {
    direction: ImportDirection;
    accountId?: string;
    displayName?: string;
  }) => void;
}

export function LocalImportModal({
  isOpen,
  onClose,
  initialFilePath = '',
  initialDirection = 'overwrite',
  knownBackups = [],
  resolvedDir,
  onSuccess,
}: LocalImportModalProps) {
  const queryClient = useQueryClient();
  const { formatUtcToLocal } = useTimezone();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. 表单状态
  const [filePath, setFilePath] = useState(initialFilePath);
  const [direction, setDirection] = useState<ImportDirection>(initialDirection);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [diffTab, setDiffTab] = useState<'core' | 'modules'>('core');
  const [createdAccount, setCreatedAccount] = useState<{ id: string; displayName: string } | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPickingFile, setIsPickingFile] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  async function handlePickFile() {
    setIsPickingFile(true);
    setActionError(null);
    try {
      const res = await pickLocalFile(resolvedDir);
      if (res.filePath && !res.cancelled) {
        setFilePath(res.filePath);
        return;
      }
      if (res.cancelled) {
        return;
      }
      // 若系统原生对话框不可用（无头环境/远程/未安装组件），无缝唤起网页端文件选择器
      fileInputRef.current?.click();
    } catch {
      fileInputRef.current?.click();
    } finally {
      setIsPickingFile(false);
    }
  }

  async function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingFile(true);
    setActionError(null);
    try {
      const res = await uploadLocalBackupFile(file);
      setFilePath(res.filePath);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '上传备份文件失败');
    } finally {
      setIsUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // 当外部初始入参变化时同步重置
  useEffect(() => {
    if (isOpen) {
      setFilePath(initialFilePath);
      setDirection(initialDirection);
      setCreatedAccount(null);
      setActionError(null);
      setDiffTab('core');

      // 生成新账号默认名称建议
      const defaultName = initialFilePath
        ? `导入账号 (${
            initialFilePath
              .split(/[/\\]/)
              .pop()
              ?.replace(/\.db(\.gz)?$/, '') || '快照'
          })`
        : `导入工作区 (${new Date().toISOString().slice(0, 10)})`;
      setNewDisplayName(defaultName);
    }
  }, [isOpen, initialFilePath, initialDirection]);

  // 2. 预检查询（仅在方向一：覆盖当前账号且有 filePath 时触发）
  const trimmedFilePath = filePath.trim();
  const shouldPreflight = isOpen && direction === 'overwrite' && Boolean(trimmedFilePath);

  const {
    data: preflight,
    isLoading: isPreflightLoading,
    isError: isPreflightError,
    error: preflightError,
    refetch: refetchPreflight,
  } = useQuery({
    queryKey: ['local-import-preflight', trimmedFilePath],
    queryFn: () => preflightLocalImport(trimmedFilePath),
    enabled: shouldPreflight,
    retry: false,
  });

  // 3. Mutation 1：方向一 确认覆盖导入
  const confirmMutation = useMutation({
    mutationFn: (path: string) => confirmLocalImport(path),
    onSuccess: async () => {
      // 关键铁律：导入完成后全量失效 React Query 缓存
      await queryClient.invalidateQueries();
      onClose();
      if (onSuccess) {
        onSuccess({ direction: 'overwrite' });
      }
    },
    onError: (err: Error) => {
      setActionError(err.message);
    },
  });

  // 4. Mutation 2：方向二 导入为新账号
  const asNewAccountMutation = useMutation({
    mutationFn: ({ path, name }: { path: string; name: string }) => importAsNewAccount(path, name),
    onSuccess: async (res) => {
      // 关键铁律：全量失效 React Query 缓存
      await queryClient.invalidateQueries();
      setCreatedAccount(res);
      if (onSuccess) {
        onSuccess({
          direction: 'new-account',
          accountId: res.id,
          displayName: res.displayName,
        });
      }
    },
    onError: (err: Error) => {
      setActionError(err.message);
    },
  });

  // 5. Mutation 3：切换至新创建的账号
  const switchMutation = useMutation({
    mutationFn: (id: string) => switchAccount(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      onClose();
    },
    onError: (err: Error) => {
      setActionError(`切换账号失败：${err.message}`);
    },
  });

  // 差异计算
  const coreAdded = preflight?.diff.core.added ?? [];
  const coreRemoved = preflight?.diff.core.removed ?? [];
  const coreModified = preflight?.diff.core.modified ?? [];
  const modulesDiff = preflight?.diff.modules ?? [];
  const totalCoreDiff = coreAdded.length + coreRemoved.length + coreModified.length;

  function handleConfirmOverwrite() {
    if (!trimmedFilePath) return;
    setActionError(null);
    confirmMutation.mutate(trimmedFilePath);
  }

  function handleImportAsNewAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmedFilePath) return;
    const name = newDisplayName.trim();
    if (!name) {
      setActionError('请输入新账号显示名称');
      return;
    }
    setActionError(null);
    asNewAccountMutation.mutate({ path: trimmedFilePath, name });
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="本地备份文件导入向导"
      description="选择本地 SQLite 快照文件，并选择覆盖当前工作区或作为新账号独立导入"
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5 text-xs">
        {/* ========================================================================= */}
        {/* 成功导入新账号完成页 */}
        {/* ========================================================================= */}
        {createdAccount ? (
          <div className="space-y-5 py-4 text-center animate-fade-in">
            <div className="flex size-14 items-center justify-center rounded-full bg-good-soft text-good mx-auto shadow-xs">
              <IconCheck size={32} />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-ink">新账号已成功创建并导入数据</h3>
              <p className="text-xs text-secondary leading-relaxed">
                快照数据库已解压并成功执行表结构迁移。账号「{createdAccount.displayName}
                」已独立落盘。
              </p>
            </div>

            <div className="rounded-control bg-surface-2 p-3 text-[11px] font-mono text-muted max-w-md mx-auto border border-line">
              账号 ID: {createdAccount.id} · 名称: {createdAccount.displayName}
            </div>

            {actionError && (
              <div className="flex items-center justify-center gap-1.5 text-xs text-critical">
                <IconAlertCircle size={14} />
                <span>{actionError}</span>
              </div>
            )}

            <div className="flex items-center justify-center gap-3 pt-2">
              <Button type="button" variant="ghost" size="md" onClick={onClose}>
                留在当前账号
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                disabled={switchMutation.isPending}
                icon={<IconUser size={14} />}
                onClick={() => switchMutation.mutate(createdAccount.id)}
              >
                {switchMutation.isPending ? '正在切换...' : '立即切换至该账号'}
              </Button>
            </div>
          </div>
        ) : (
          /* ========================================================================= */
          /* 向导主要配置与预览区 */
          /* ========================================================================= */
          <>
            {/* 步骤 1：文件选择与绝对路径展示 */}
            <div className="space-y-2.5">
              <input
                ref={fileInputRef}
                type="file"
                accept=".db,.db.gz,.gz,application/gzip,application/x-sqlite3"
                onChange={handleFileInputChange}
                className="hidden"
              />

              <div className="space-y-1.5">
                <span className="font-bold text-ink text-[12px] block">选择备份快照文件：</span>

                {trimmedFilePath ? (
                  /* 已选定文件：展示图标、文件名、绝对路径以及重新选择/清除按钮 */
                  <div className="p-3 rounded-panel border border-accent/40 bg-accent-soft/20 flex items-center justify-between gap-3 animate-fade-in">
                    <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
                      <div className="flex size-9 items-center justify-center rounded-lg bg-accent text-white shrink-0 shadow-xs">
                        <IconDatabase size={16} />
                      </div>
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-ink text-xs truncate">
                            {trimmedFilePath.split(/[/\\]/).pop() || trimmedFilePath}
                          </span>
                          <Chip tone="good">已选定</Chip>
                        </div>
                        <AutoScrollPath text={trimmedFilePath} className="mt-1" />
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={isPickingFile || isUploadingFile}
                        icon={
                          isPickingFile || isUploadingFile ? (
                            <IconRefreshCw size={13} className="animate-spin" />
                          ) : (
                            <IconFolder size={13} />
                          )
                        }
                        onClick={handlePickFile}
                      >
                        {isPickingFile ? '选择中...' : '重新选择'}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setFilePath('');
                          setActionError(null);
                        }}
                        className="text-muted hover:text-critical"
                      >
                        清除
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* 未选定文件：展示选择文件按钮与默认路径提示 */
                  <div className="p-4 rounded-panel border-2 border-dashed border-line hover:border-accent bg-surface hover:bg-surface-2/40 transition-all flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent shrink-0">
                        <IconFolder size={20} />
                      </div>
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <div className="font-bold text-ink text-xs">
                          {isPickingFile
                            ? '正在打开文件选择器...'
                            : isUploadingFile
                              ? '正在读取备份文件...'
                              : '选择本地快照文件'}
                        </div>
                        {resolvedDir ? (
                          <AutoScrollPath
                            text={resolvedDir}
                            prefix={<span className="text-[11px] text-muted">默认路径：</span>}
                            className="mt-0.5"
                          />
                        ) : (
                          <div className="text-[11px] text-muted mt-0.5">
                            支持 .db 或 .db.gz 格式的快照文件
                          </div>
                        )}
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={isPickingFile || isUploadingFile}
                      icon={
                        isPickingFile || isUploadingFile ? (
                          <IconRefreshCw size={14} className="animate-spin" />
                        ) : (
                          <IconFolder size={14} />
                        )
                      }
                      onClick={handlePickFile}
                      className="shrink-0"
                    >
                      {isPickingFile
                        ? '正在选择...'
                        : isUploadingFile
                          ? '正在上传...'
                          : '选择备份文件...'}
                    </Button>
                  </div>
                )}
              </div>

              {/* 快捷选择已知本地备份 */}
              {knownBackups.length > 0 && (
                <div className="space-y-1 pt-0.5">
                  <span className="text-[11px] text-muted block">快捷选择已有快照：</span>
                  <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto pr-1">
                    {knownBackups.map((b) => {
                      const fullPath = joinBackupFilePath(resolvedDir, b.name);
                      const isSelected = filePath === fullPath || filePath === b.name;
                      return (
                        <button
                          key={b.name}
                          type="button"
                          onClick={() => {
                            setFilePath(fullPath);
                            setActionError(null);
                          }}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-control text-[11px] border transition-colors ${
                            isSelected
                              ? 'border-accent bg-accent-soft text-accent font-semibold'
                              : 'border-line bg-surface hover:bg-surface-2 text-secondary hover:text-ink'
                          }`}
                        >
                          <IconFolder size={11} />
                          <span className="truncate max-w-[220px]">
                            {b.meta ? formatUtcToLocal(b.meta.createdAt).full : b.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 步骤 2：选择导入方向 */}
            <div className="space-y-2 pt-1">
              <span className="font-bold text-ink text-[12px]">选择导入处理方向：</span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 方向一：覆盖当前账号 */}
                <div
                  onClick={() => {
                    setDirection('overwrite');
                    setActionError(null);
                  }}
                  className={`p-3.5 rounded-panel border text-left cursor-pointer transition-all ${
                    direction === 'overwrite'
                      ? 'border-critical/60 bg-critical/5 shadow-xs ring-2 ring-critical/20'
                      : 'border-line bg-surface hover:bg-surface-2/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex size-7 items-center justify-center rounded-lg bg-critical/10 text-critical">
                        <IconDatabase size={15} />
                      </div>
                      <span className="font-bold text-ink">覆盖当前账号数据</span>
                    </div>
                    <Chip tone="critical">高危替换</Chip>
                  </div>
                  <p className="mt-2 text-[11px] text-muted leading-relaxed">
                    将备份文件热替换进当前正在使用的工作区，操作前自动在本地留存安全回退快照。
                  </p>
                </div>

                {/* 方向二：导入为新账号 */}
                <div
                  onClick={() => {
                    setDirection('new-account');
                    setActionError(null);
                  }}
                  className={`p-3.5 rounded-panel border text-left cursor-pointer transition-all ${
                    direction === 'new-account'
                      ? 'border-accent bg-accent-soft/40 shadow-xs ring-2 ring-accent/30'
                      : 'border-line bg-surface hover:bg-surface-2/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex size-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
                        <IconUser size={15} />
                      </div>
                      <span className="font-bold text-ink">导入为独立新账号</span>
                    </div>
                    <Chip tone="good">安全隔离</Chip>
                  </div>
                  <p className="mt-2 text-[11px] text-muted leading-relaxed">
                    在独立子目录建库并自动运行表结构迁移，完全不影响现有账号与任何历史数据。
                  </p>
                </div>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* 方向一的内容区：预检状态、差异比对与兼容性检查 */}
            {/* ========================================================================= */}
            {direction === 'overwrite' && (
              <div className="space-y-3.5 pt-1 border-t border-line">
                {!trimmedFilePath ? (
                  <div className="py-6 text-center text-muted bg-surface-2/40 rounded-control border border-line">
                    <IconFileText size={20} className="mx-auto mb-1.5 text-muted" />
                    <span>请输入或选择有效的备份文件路径以开始差异预检</span>
                  </div>
                ) : isPreflightLoading ? (
                  <div className="py-8 text-center space-y-2 text-muted">
                    <IconRefreshCw size={22} className="animate-spin mx-auto text-accent" />
                    <div className="font-medium text-ink">正在从本地文件读取并计算行级差异...</div>
                    <p className="text-[11px]">校验 SQLite 水位并在内存中比对核心事项与模块数据</p>
                  </div>
                ) : isPreflightError ? (
                  <div className="space-y-2">
                    <div className="rounded-panel border border-critical/30 bg-critical/10 p-3.5 text-critical space-y-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <IconAlertCircle size={15} />
                        <span>预检请求失败</span>
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        {(preflightError as Error)?.message || '无法读取文件或文件已损坏'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void refetchPreflight()}
                    >
                      重新尝试预检
                    </Button>
                  </div>
                ) : preflight && !preflight.compatible ? (
                  /* 版本超前警告 */
                  <div className="rounded-panel border border-critical/40 bg-critical/10 p-4 text-critical space-y-2 animate-fade-in">
                    <div className="flex items-center gap-2 font-bold text-sm">
                      <IconAlertCircle size={18} />
                      <span>备份版本超前 · 拒绝覆盖</span>
                    </div>
                    <p className="text-xs leading-relaxed">
                      {preflight.reason ||
                        '该备份包含超前于当前客户端代码的数据库迁移版本。强制恢复会导致运行时缺少列或结构破坏。'}
                    </p>
                    <div className="text-[11px] font-mono bg-critical/20 p-2 rounded-control">
                      备份来源应用版本：{preflight.meta?.appVersion || '未知'} · 设备：
                      {preflight.meta?.device || '未知'}
                    </div>
                    <p className="text-secondary text-[11px]">
                      请升级工作台应用至与备份兼容的最新版本后再执行覆盖导入。
                    </p>
                  </div>
                ) : preflight ? (
                  /* 兼容通过，展示元数据与差异选项卡 */
                  <div className="space-y-3 animate-fade-in">
                    {/* 元数据卡片 */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-panel border border-line bg-surface-2 p-2.5 text-[11px]">
                      <div>
                        <span className="text-muted block">备份生成时间</span>
                        <span className="font-semibold text-ink truncate block">
                          {preflight.meta
                            ? formatUtcToLocal(preflight.meta.createdAt).full
                            : '来源未知'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted block">来源设备</span>
                        <span className="font-semibold text-ink truncate block">
                          {preflight.meta?.device || '来源未知'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted block">文件大小</span>
                        <span className="font-semibold text-ink truncate block">
                          {preflight.meta
                            ? `${(preflight.meta.bytes / 1024).toFixed(1)} KB`
                            : '以物理文件为准'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted block">兼容状态</span>
                        <span className="font-semibold text-good flex items-center gap-1">
                          <IconCheck size={12} />
                          完全兼容
                        </span>
                      </div>
                    </div>

                    {!preflight.meta && (
                      <div className="p-2 rounded-control bg-surface-2 border border-line text-[11px] text-muted flex items-center gap-1.5">
                        <IconClock size={13} className="text-secondary" />
                        <span>
                          未检测到旁挂的 .meta.json 元数据文件，已直接从数据库校验迁移版本。
                        </span>
                      </div>
                    )}

                    {/* 差异标签页切换 */}
                    <div className="flex items-center gap-2 border-b border-line pb-1.5">
                      <button
                        type="button"
                        onClick={() => setDiffTab('core')}
                        className={`px-2.5 py-1 rounded-control font-semibold text-xs transition-colors flex items-center gap-1.5 ${
                          diffTab === 'core'
                            ? 'bg-accent-soft text-accent font-bold'
                            : 'text-secondary hover:text-ink'
                        }`}
                      >
                        <span>核心待办事项差异</span>
                        <Chip tone={totalCoreDiff > 0 ? 'accent' : 'neutral'}>
                          {totalCoreDiff > 0 ? `${totalCoreDiff} 处变动` : '完全一致'}
                        </Chip>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiffTab('modules')}
                        className={`px-2.5 py-1 rounded-control font-semibold text-xs transition-colors flex items-center gap-1.5 ${
                          diffTab === 'modules'
                            ? 'bg-accent-soft text-accent font-bold'
                            : 'text-secondary hover:text-ink'
                        }`}
                      >
                        <span>业务模块表计数</span>
                        <Chip tone="neutral">{modulesDiff.length} 个数据表</Chip>
                      </button>
                    </div>

                    {/* 选项卡 1：核心待办行级差异 */}
                    {diffTab === 'core' && (
                      <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
                        {totalCoreDiff === 0 ? (
                          <div className="py-4 text-center text-muted bg-surface-2/40 rounded-control border border-line">
                            <IconCheck size={16} className="text-good mx-auto mb-1" />
                            <span>核心待办事项与本地当前完全一致</span>
                          </div>
                        ) : (
                          <>
                            {coreAdded.length > 0 && (
                              <div className="space-y-1">
                                <div className="font-bold text-good text-[11px]">
                                  + 文件新增 ({coreAdded.length} 项，导入后写入本地)：
                                </div>
                                <div className="space-y-0.5">
                                  {coreAdded.map((item) => (
                                    <div
                                      key={item.id}
                                      className="flex items-center justify-between p-1.5 rounded-control bg-good-soft/40 border border-good/20 text-xs"
                                    >
                                      <span className="font-medium text-ink truncate">
                                        {item.title}
                                      </span>
                                      <span className="font-mono text-[10px] text-muted shrink-0 ml-2">
                                        {item.id}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {coreRemoved.length > 0 && (
                              <div className="space-y-1">
                                <div className="font-bold text-critical text-[11px]">
                                  - 本地独有 ({coreRemoved.length} 项，导入后将被覆盖删除)：
                                </div>
                                <div className="space-y-0.5">
                                  {coreRemoved.map((item) => (
                                    <div
                                      key={item.id}
                                      className="flex items-center justify-between p-1.5 rounded-control bg-critical/10 border border-critical/20 text-xs"
                                    >
                                      <span className="font-medium text-ink truncate line-through text-muted">
                                        {item.title}
                                      </span>
                                      <span className="font-mono text-[10px] text-muted shrink-0 ml-2">
                                        {item.id}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {coreModified.length > 0 && (
                              <div className="space-y-1">
                                <div className="font-bold text-warning text-[11px]">
                                  ~ 内容变更 ({coreModified.length} 项，导入后以文件为准)：
                                </div>
                                <div className="space-y-0.5">
                                  {coreModified.map((item) => (
                                    <div
                                      key={item.id}
                                      className="p-1.5 rounded-control bg-warning-soft/40 border border-warning/20 text-xs space-y-0.5"
                                    >
                                      <div className="flex items-center justify-between">
                                        <span className="font-semibold text-ink truncate">
                                          {item.title}
                                        </span>
                                        <span className="font-mono text-[10px] text-muted shrink-0 ml-2">
                                          {item.id}
                                        </span>
                                      </div>
                                      {item.localTitle && item.localTitle !== item.title && (
                                        <div className="text-[10px] text-muted">
                                          本地当前：
                                          <span className="line-through">{item.localTitle}</span>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {/* 选项卡 2：业务模块表计数 */}
                    {diffTab === 'modules' && (
                      <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                        {modulesDiff.length === 0 ? (
                          <div className="py-4 text-center text-muted bg-surface-2/40 rounded-control border border-line">
                            暂无业务模块数据表
                          </div>
                        ) : (
                          modulesDiff.map((m) => {
                            const diffCount = m.remoteCount - m.localCount;
                            return (
                              <div
                                key={m.table}
                                className="flex items-center justify-between p-2 rounded-control border border-line bg-surface-2/40 text-xs"
                              >
                                <div>
                                  <span className="font-bold text-ink">
                                    {m.moduleName || m.moduleId}
                                  </span>
                                  <span className="font-mono text-[10px] text-muted ml-1.5">
                                    ({m.table})
                                  </span>
                                  <div className="text-[11px] text-secondary">
                                    本地 {m.localCount} 条 → 导入文件 {m.remoteCount} 条
                                  </div>
                                </div>
                                <div>
                                  {diffCount > 0 ? (
                                    <Chip tone="good">+{diffCount} 条</Chip>
                                  ) : diffCount < 0 ? (
                                    <Chip tone="warning">{diffCount} 条</Chip>
                                  ) : (
                                    <Chip tone="neutral">一致</Chip>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}

                    {/* 回退保障说明 */}
                    <div className="rounded-control bg-surface-2 p-2.5 text-[11px] text-muted space-y-1 border border-line">
                      <div className="flex items-center gap-1.5 font-bold text-ink">
                        <IconShield size={13} className="text-accent" />
                        <span>自动回退保护：</span>
                      </div>
                      <div>
                        执行覆盖前系统将自动生成 <code>.restore/backup.db</code>
                        ，若过程异常可安全回退。确认后将进入全服务恢复模式。
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* ========================================================================= */}
            {/* 方向二的内容区：配置新账号名称（无需预检） */}
            {/* ========================================================================= */}
            {direction === 'new-account' && (
              <form
                onSubmit={handleImportAsNewAccount}
                className="space-y-4 pt-1 border-t border-line animate-fade-in"
              >
                <Field label="新工作区 / 账号显示名称">
                  <input
                    type="text"
                    required
                    value={newDisplayName}
                    onChange={(e) => {
                      setNewDisplayName(e.target.value);
                      setActionError(null);
                    }}
                    placeholder="例如：迁移工作区 (2026-08-20)"
                    className={controlClass}
                  />
                </Field>

                <div className="rounded-control bg-surface-2 p-3 text-[11px] text-muted space-y-1 border border-line">
                  <div className="flex items-center gap-1.5 font-bold text-ink">
                    <IconShield size={13} className="text-good" />
                    <span>独立存储与平滑迁移：</span>
                  </div>
                  <div>
                    该操作将在 <code>data/local/accounts/</code>
                    下分配全新独立目录，自动执行数据库迁移并注册为本地新账号。不会中断或修改当前工作区。
                  </div>
                </div>
              </form>
            )}

            {/* 错误提示 */}
            {actionError && (
              <div className="flex items-center gap-1.5 text-xs text-critical bg-critical/10 p-2.5 rounded-control">
                <IconAlertCircle size={14} className="shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            {/* 底部动作栏 */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-line">
              <Button type="button" variant="ghost" size="md" onClick={onClose}>
                取消
              </Button>

              {direction === 'overwrite' ? (
                <Button
                  type="button"
                  variant="danger"
                  size="md"
                  disabled={
                    !trimmedFilePath ||
                    isPreflightLoading ||
                    isPreflightError ||
                    !preflight?.compatible ||
                    confirmMutation.isPending
                  }
                  icon={<IconDatabase size={14} />}
                  onClick={handleConfirmOverwrite}
                >
                  {confirmMutation.isPending ? '正在提交导入...' : '确认覆盖当前账号数据'}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  disabled={
                    !trimmedFilePath || !newDisplayName.trim() || asNewAccountMutation.isPending
                  }
                  icon={<IconUser size={14} />}
                  onClick={handleImportAsNewAccount}
                >
                  {asNewAccountMutation.isPending ? '正在建库导入...' : '确认导入为新账号'}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
