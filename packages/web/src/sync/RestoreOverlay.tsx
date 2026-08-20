import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { RestoreState } from '@workbench/sync/contract';
import {
  Button,
  Chip,
  IconAlertCircle,
  IconCheck,
  IconDatabase,
  IconRefreshCw,
} from '@workbench/ui';
import { fetchRestoreState, rollbackRestore } from './backupApi.js';

export function RestoreOverlay({
  externalState,
  onClearExternalState,
}: {
  externalState?: RestoreState | null;
  onClearExternalState?: () => void;
}) {
  const queryClient = useQueryClient();
  const [activeState, setActiveState] = useState<RestoreState | null>(externalState ?? null);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [rollbackMessage, setRollbackMessage] = useState<string | null>(null);

  // 同步外部传入的状态（如 503 拦截）
  useEffect(() => {
    if (externalState) {
      setActiveState(externalState);
    }
  }, [externalState]);

  // 1. 挂载时初始检查一次服务端是否处于恢复态（防刷新后漏掉）
  useEffect(() => {
    let isCancelled = false;
    void fetchRestoreState()
      .then((s) => {
        if (!isCancelled && s.state !== 'idle') {
          setActiveState(s);
        }
      })
      .catch(() => {
        // ignore
      });
    return () => {
      isCancelled = true;
    };
  }, []);

  // 2. 监听全局 503 恢复事件
  useEffect(() => {
    function handleRestoreSignal(e: CustomEvent<RestoreState>) {
      if (e.detail) {
        setActiveState(e.detail);
      }
    }
    window.addEventListener('workbench:restore-state', handleRestoreSignal as EventListener);
    return () => {
      window.removeEventListener('workbench:restore-state', handleRestoreSignal as EventListener);
    };
  }, []);

  const isBlocking =
    activeState !== null &&
    (activeState.state === 'restoring' ||
      activeState.state === 'switching' ||
      activeState.state === 'error');

  // 轮询恢复状态
  useEffect(() => {
    if (!isBlocking) return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isCancelled = false;

    async function checkState() {
      try {
        const current = await fetchRestoreState();
        if (isCancelled) return;

        if (current.state === 'idle') {
          // 恢复完成：全量清除所有 React Query 缓存，防止数据串门
          await queryClient.invalidateQueries();
          setActiveState(null);
          if (onClearExternalState) onClearExternalState();
        } else {
          setActiveState(current);
          timeoutId = setTimeout(checkState, 1500);
        }
      } catch {
        if (!isCancelled) {
          timeoutId = setTimeout(checkState, 2000);
        }
      }
    }

    timeoutId = setTimeout(checkState, 1500);

    return () => {
      isCancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isBlocking, queryClient, onClearExternalState]);

  if (!isBlocking || !activeState) return null;

  async function handleRollback() {
    setIsRollingBack(true);
    try {
      const res = await rollbackRestore();
      await queryClient.invalidateQueries();
      if (res.state === 'idle') {
        setActiveState(null);
        if (onClearExternalState) onClearExternalState();
      } else {
        setActiveState(res);
      }
    } catch (err: unknown) {
      setRollbackMessage(`回退失败：${(err as Error).message}`);
    } finally {
      setIsRollingBack(false);
    }
  }

  const content = (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 sm:p-6 overflow-hidden select-none animate-fade-in">
      {/* 全屏高弥散毛玻璃亚克力遮罩 */}
      <div
        className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-2xl backdrop-saturate-150 transition-opacity duration-300"
        aria-hidden="true"
      />

      {/* 居中核心卡片 */}
      <div className="relative z-10 w-full max-w-lg rounded-panel border border-line/90 bg-surface/95 dark:bg-surface/95 backdrop-blur-2xl p-6 sm:p-8 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] ring-1 ring-black/10 dark:ring-white/10 text-center space-y-5 animate-scale-in">
        {activeState.state === 'error' ? (
          /* 恢复错误状态 */
          <div className="space-y-4">
            <div className="flex size-14 items-center justify-center rounded-full bg-critical/10 text-critical mx-auto">
              <IconAlertCircle size={32} />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-center gap-2">
                <h3 className="text-lg font-bold text-ink">数据恢复异常</h3>
                <Chip tone="critical">需要处理</Chip>
              </div>
              <p className="text-xs text-secondary leading-relaxed">
                {activeState.error || activeState.message || '恢复过程遭遇中断或未预期的错误。'}
              </p>
            </div>

            {rollbackMessage && (
              <div className="text-xs text-critical bg-critical/10 p-2.5 rounded-control">
                {rollbackMessage}
              </div>
            )}

            <div className="rounded-control bg-surface-2 p-3 text-[11px] text-muted space-y-1 text-left border border-line">
              <div className="font-bold text-ink">安全保护机制：</div>
              <div>
                系统在启动替换前已留存本地数据库备份（<code>.restore/backup.db</code>
                ）。您可以点击下方按钮立即回退到恢复前的本地数据库状态。
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                type="button"
                variant="danger"
                size="md"
                disabled={isRollingBack}
                icon={<IconDatabase size={15} />}
                onClick={handleRollback}
              >
                {isRollingBack ? '正在回退中...' : '回退到恢复前状态'}
              </Button>
            </div>
          </div>
        ) : (
          /* 恢复或切换中状态 */
          <div className="space-y-4 py-2">
            <div className="relative flex size-16 items-center justify-center rounded-2xl bg-accent-soft text-accent mx-auto shadow-sm">
              <IconRefreshCw size={36} className="animate-spin text-accent" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2">
                <h3 className="text-lg font-bold text-ink">
                  {activeState.state === 'switching'
                    ? '正在切换本地账号...'
                    : '正在恢复云端数据快照...'}
                </h3>
                <Chip tone="accent">全系统独占</Chip>
              </div>

              <p className="text-xs text-secondary leading-relaxed">
                {activeState.message ||
                  (activeState.state === 'switching'
                    ? '正在换连目标账号数据库并执行结构迁移'
                    : '正在下载快照、校验哈希并执行数据库热替换')}
              </p>
            </div>

            {/* 步骤条 */}
            {activeState.step && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-2 border border-line text-[11px] font-mono text-muted">
                <span className="size-2 rounded-full bg-accent animate-pulse" />
                <span>当前步骤：{activeState.step}</span>
              </div>
            )}

            <div className="rounded-control bg-surface-2/60 p-3.5 text-[11px] text-muted space-y-1.5 text-left border border-line/60">
              <div className="flex items-center gap-1.5 text-ink font-semibold">
                <IconCheck size={13} className="text-good" />
                <span>事务安全保护与断电续命进行中</span>
              </div>
              <p className="leading-relaxed">
                请勿关闭电源或强行退出应用。系统正在进行连接层热切与代次更新，完成后将自动刷新工作区。
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }
  return content;
}
