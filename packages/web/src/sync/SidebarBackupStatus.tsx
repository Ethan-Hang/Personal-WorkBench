import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import {
  IconShield,
  IconAlertCircle,
  IconRefreshCw,
  IconCheck,
  useTimezone,
  formatRelativeBackupTime,
} from '@workbench/ui';
import type { BackupListItem } from '@workbench/sync/contract';
import { fetchLocalBackupList, runLocalBackup } from './localBackupApi.js';
import { fetchBackupList } from './backupApi.js';

interface SidebarBackupStatusProps {
  isCollapsed?: boolean;
}

interface ResolvedBackupInfo {
  latestTime: string | null;
  latestSource: 'local' | 'cloud' | null;
  localCount: number;
  cloudCount: number;
  totalCount: number;
  latestItem: BackupListItem | null;
}

/**
 * 从快照列表或文件名中提取 ISO8601 时间戳
 */
function extractCreatedAt(item: BackupListItem): string | null {
  if (item.meta?.createdAt) {
    return item.meta.createdAt;
  }
  // 备用：从文件名解析类似 2026-08-20T14-24-31-327Z.db.gz
  const match = item.name.match(
    /^(\d{4}-\d{2}-\d{2}T\d{2})[-:](\d{2})[-:](\d{2})(?:[-.](\d{3}))?Z/,
  );
  if (match) {
    const [, prefix, mm, ss, ms] = match;
    return `${prefix}:${mm}:${ss}.${ms || '000'}Z`;
  }
  return null;
}

export function SidebarBackupStatus({ isCollapsed = false }: SidebarBackupStatusProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { timezone, formatUtcToLocal } = useTimezone();

  // 客户端定时更新相对时间（每 30 秒递增 tick 触发重算）
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 30_000);
    return () => clearInterval(timer);
  }, []);

  // 1. 本地备份列表
  const { data: localBackups = [], isLoading: isLocalLoading } = useQuery({
    queryKey: ['local-backup-list'],
    queryFn: () => fetchLocalBackupList(),
    staleTime: 10_000,
  });

  // 2. WebDAV 云端备份列表（网络或未配置报错时静默兜底为空）
  const { data: cloudBackups = [], isLoading: isCloudLoading } = useQuery({
    queryKey: ['backup-list'],
    queryFn: async () => {
      try {
        return await fetchBackupList();
      } catch {
        return [];
      }
    },
    staleTime: 30_000,
  });

  // 3. 一键快捷快照 Mutation
  const [backupToast, setBackupToast] = useState<string | null>(null);
  const backupMutation = useMutation({
    mutationFn: () => runLocalBackup(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['local-backup-list'] });
      void queryClient.invalidateQueries({ queryKey: ['local-backup-config'] });
      setNow(new Date());
      setBackupToast('快照创建成功');
      setTimeout(() => setBackupToast(null), 2500);
    },
    onError: (err: Error) => {
      setBackupToast(`备份失败: ${err.message}`);
      setTimeout(() => setBackupToast(null), 3000);
    },
  });

  // 4. 解析并聚合本地与云端的最新备份信息
  const backupInfo = useMemo<ResolvedBackupInfo>(() => {
    let latestTime: string | null = null;
    let latestTimestamp = 0;
    let latestSource: 'local' | 'cloud' | null = null;
    let latestItem: BackupListItem | null = null;

    // 检查本地备份
    for (const item of localBackups) {
      const iso = extractCreatedAt(item);
      if (!iso) continue;
      const t = new Date(iso).getTime();
      if (!isNaN(t) && t > latestTimestamp) {
        latestTimestamp = t;
        latestTime = iso;
        latestSource = 'local';
        latestItem = item;
      }
    }

    // 检查云端备份
    for (const item of cloudBackups) {
      const iso = extractCreatedAt(item);
      if (!iso) continue;
      const t = new Date(iso).getTime();
      if (!isNaN(t) && t > latestTimestamp) {
        latestTimestamp = t;
        latestTime = iso;
        latestSource = 'cloud';
        latestItem = item;
      }
    }

    return {
      latestTime,
      latestSource,
      localCount: localBackups.length,
      cloudCount: cloudBackups.length,
      totalCount: localBackups.length + cloudBackups.length,
      latestItem,
    };
  }, [localBackups, cloudBackups]);

  const hasBackup = Boolean(backupInfo.latestTime);
  const relativeTimeStr = formatRelativeBackupTime(backupInfo.latestTime, {
    now,
    timeZone: timezone,
  });

  const fullTimeStr = backupInfo.latestTime ? formatUtcToLocal(backupInfo.latestTime).full : '';

  const isWorking = backupMutation.isPending || isLocalLoading || isCloudLoading;

  // 综合悬浮提示文案
  const tooltipText = useMemo(() => {
    if (backupMutation.isPending) return '正在创建本地备份快照…';
    if (!hasBackup) {
      return '尚未创建任何备份快照，点击立即备份或进入存储设置';
    }
    const sourceLabel = backupInfo.latestSource === 'cloud' ? 'WebDAV 云端' : '本地快照';
    const counts = `本地: ${backupInfo.localCount} 份 / 云端: ${backupInfo.cloudCount} 份`;
    return `上次备份：${relativeTimeStr} (${fullTimeStr}) · ${sourceLabel}\n${counts}\n点击前往数据与存储管理`;
  }, [backupMutation.isPending, hasBackup, backupInfo, relativeTimeStr, fullTimeStr]);

  function handleCardClick() {
    navigate('/settings?tab=storage');
  }

  function handleQuickBackup(e: React.MouseEvent) {
    e.stopPropagation();
    if (backupMutation.isPending) return;
    backupMutation.mutate();
  }

  /* ------------------- 折叠状态展示 (w-16) ------------------- */
  if (isCollapsed) {
    return (
      <div className="relative flex justify-center py-0.5">
        <button
          type="button"
          onClick={handleCardClick}
          title={tooltipText}
          aria-label={tooltipText}
          className={`relative flex size-9 items-center justify-center rounded-control transition-all duration-200 ${
            hasBackup
              ? 'text-sidebar-text hover:bg-sidebar-active/60 hover:text-white'
              : 'text-warning/80 hover:bg-warning/10 hover:text-warning'
          }`}
        >
          {isWorking ? (
            <IconRefreshCw size={15} className="animate-spin text-accent" />
          ) : hasBackup ? (
            <IconShield size={15} className="text-good" />
          ) : (
            <IconAlertCircle size={15} className="text-warning" />
          )}

          {/* 状态徽标小圆点 */}
          <span
            className={`absolute top-1.5 right-1.5 size-2 rounded-full border border-sidebar ring-1 ring-sidebar ${
              isWorking ? 'bg-accent animate-ping' : hasBackup ? 'bg-good' : 'bg-warning'
            }`}
          />
        </button>
      </div>
    );
  }

  /* ------------------- 展开状态展示 (w-64) ------------------- */
  return (
    <div
      onClick={handleCardClick}
      title={tooltipText}
      className={`group relative rounded-control border p-2 transition-all duration-200 cursor-pointer select-none ${
        hasBackup
          ? 'border-sidebar-line/50 bg-sidebar-active/20 hover:bg-sidebar-active/40 hover:border-sidebar-line/80 text-sidebar-text'
          : 'border-warning/30 bg-warning/5 hover:bg-warning/10 hover:border-warning/50 text-sidebar-text'
      }`}
    >
      {/* 头部标题与快捷备份按钮行 */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {/* 状态指示图标 */}
          {isWorking ? (
            <IconRefreshCw size={13} className="animate-spin text-accent shrink-0" />
          ) : hasBackup ? (
            <IconShield size={13} className="text-good shrink-0" />
          ) : (
            <IconAlertCircle size={13} className="text-warning shrink-0" />
          )}

          <span className="text-[11px] font-semibold text-sidebar-text truncate">
            {hasBackup ? '数据备份' : '备份提醒'}
          </span>

          {/* 来源标识 (本地/云端) */}
          {hasBackup && backupInfo.latestSource && (
            <span className="text-[9px] px-1 py-0.2 rounded bg-sidebar-line/60 text-sidebar-muted font-medium shrink-0">
              {backupInfo.latestSource === 'cloud' ? '云端' : '本地'}
            </span>
          )}
        </div>

        {/* 快捷一键备份按钮 */}
        <button
          type="button"
          onClick={handleQuickBackup}
          disabled={backupMutation.isPending}
          title="立即创建本地快照"
          className="flex size-5 items-center justify-center rounded border border-sidebar-line/40 bg-sidebar-active/40 text-sidebar-muted hover:text-white hover:bg-sidebar-active hover:border-sidebar-line transition-all shadow-2xs shrink-0"
        >
          <IconRefreshCw
            size={10}
            className={backupMutation.isPending ? 'animate-spin text-accent' : ''}
          />
        </button>
      </div>

      {/* 上一次备份时间与状态详情 */}
      <div className="mt-1 flex items-center justify-between text-[11px] leading-tight">
        {hasBackup ? (
          <div className="flex items-center gap-1 min-w-0 truncate">
            <span className="text-sidebar-muted shrink-0">上次:</span>
            <span className="font-medium text-white tracking-tight truncate">
              {relativeTimeStr}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-warning font-medium">
            <span>未备份</span>
            <span className="text-[10px] text-warning/80">· 建议创建</span>
          </div>
        )}

        {/* 数量统计角标 */}
        {hasBackup && backupInfo.totalCount > 0 && (
          <span className="text-[10px] text-sidebar-muted tabular-nums shrink-0 ml-1">
            {backupInfo.totalCount}份
          </span>
        )}
      </div>

      {/* 快捷备份操作提示条 */}
      {backupToast && (
        <div className="absolute inset-0 flex items-center justify-center rounded-control bg-sidebar-active/95 backdrop-blur-xs border border-accent/60 px-2 text-[11px] font-medium text-white animate-fade-in shadow-md">
          <IconCheck size={12} className="text-good mr-1 shrink-0" />
          <span className="truncate">{backupToast}</span>
        </div>
      )}
    </div>
  );
}
