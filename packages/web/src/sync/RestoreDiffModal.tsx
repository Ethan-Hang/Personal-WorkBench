import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Chip,
  IconAlertCircle,
  IconCheck,
  IconDatabase,
  IconRefreshCw,
  IconShield,
  Modal,
  useTimezone,
} from '@workbench/ui';
import { preflightRestore } from './backupApi.js';

export function RestoreDiffModal({
  isOpen,
  onClose,
  backupName,
  onConfirmRestore,
  isRestoring = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  backupName: string | null;
  onConfirmRestore: (name: string) => Promise<void>;
  isRestoring?: boolean;
}) {
  const { formatUtcToLocal } = useTimezone();
  const [diffTab, setDiffTab] = useState<'core' | 'modules'>('core');

  const {
    data: preflight,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['restore-preflight', backupName],
    queryFn: () => (backupName ? preflightRestore(backupName) : Promise.reject('无备份名')),
    enabled: isOpen && Boolean(backupName),
  });

  const coreAdded = preflight?.diff.core.added ?? [];
  const coreRemoved = preflight?.diff.core.removed ?? [];
  const coreModified = preflight?.diff.core.modified ?? [];
  const modulesDiff = preflight?.diff.modules ?? [];

  const totalCoreDiff = coreAdded.length + coreRemoved.length + coreModified.length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="恢复数据与差异确认"
      description="比对云端快照与本地数据库的行级与模块差异，确认后执行热切换"
      maxWidth="max-w-2xl"
    >
      {isLoading ? (
        <div className="py-12 text-center space-y-3 text-xs text-muted">
          <IconRefreshCw size={28} className="animate-spin mx-auto text-accent" />
          <div className="font-medium text-ink">正在从云端读取快照元数据并计算数据差异...</div>
          <p className="text-[11px]">通过 ATTACH 临时对比待办项与业务模块表行级差异</p>
        </div>
      ) : isError ? (
        <div className="py-6 space-y-4 text-xs">
          <div className="rounded-panel border border-critical/30 bg-critical/10 p-4 text-critical space-y-2">
            <div className="flex items-center gap-2 font-bold text-sm">
              <IconAlertCircle size={18} />
              <span>无法进行数据恢复预检</span>
            </div>
            <p className="leading-relaxed">{(error as Error)?.message}</p>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <Button type="button" variant="ghost" size="md" onClick={onClose}>
              关闭
            </Button>
          </div>
        </div>
      ) : preflight && !preflight.compatible ? (
        <div className="py-4 space-y-4 text-xs">
          <div className="rounded-panel border border-critical/40 bg-critical/10 p-4 text-critical space-y-2.5">
            <div className="flex items-center gap-2 font-bold text-sm">
              <IconAlertCircle size={20} />
              <span>备份版本超前 · 拒绝恢复</span>
            </div>
            <p className="leading-relaxed">
              {preflight.reason ||
                '该云端备份的迁移水位超前于当前客户端代码（向下迁移不存在）。如果强制恢复将导致运行时缺少列或结构错乱。'}
            </p>
            <div className="text-[11px] font-mono bg-critical/20 p-2.5 rounded-control">
              备份来源应用版本：{preflight.meta.appVersion} · 设备：{preflight.meta.device}
            </div>
          </div>
          <p className="text-secondary text-[11px]">
            请升级您的工作台至与备份兼容的最新版本后再执行恢复。
          </p>
          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <Button type="button" variant="ghost" size="md" onClick={onClose}>
              我知道了
            </Button>
          </div>
        </div>
      ) : preflight ? (
        <div className="space-y-4 text-xs">
          {/* 快照元数据卡片 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-panel border border-line bg-surface-2 p-3 text-[11px]">
            <div>
              <span className="text-muted block">备份生成时间</span>
              <span className="font-semibold text-ink truncate block">
                {formatUtcToLocal(preflight.meta.createdAt).full}
              </span>
            </div>
            <div>
              <span className="text-muted block">来源设备</span>
              <span className="font-semibold text-ink truncate block">
                {preflight.meta.device || '未知设备'}
              </span>
            </div>
            <div>
              <span className="text-muted block">文件大小</span>
              <span className="font-semibold text-ink truncate block">
                {(preflight.meta.bytes / 1024).toFixed(1)} KB
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

          {/* 差异标签页切换 */}
          <div className="flex items-center gap-2 border-b border-line pb-2">
            <button
              type="button"
              onClick={() => setDiffTab('core')}
              className={`px-3 py-1.5 rounded-control font-semibold text-xs transition-colors flex items-center gap-1.5 ${
                diffTab === 'core'
                  ? 'bg-accent-soft text-accent font-bold'
                  : 'text-secondary hover:text-ink'
              }`}
            >
              <span>核心待办事项行级差异</span>
              <Chip tone={totalCoreDiff > 0 ? 'accent' : 'neutral'}>
                {totalCoreDiff > 0 ? `${totalCoreDiff} 处变动` : '完全一致'}
              </Chip>
            </button>
            <button
              type="button"
              onClick={() => setDiffTab('modules')}
              className={`px-3 py-1.5 rounded-control font-semibold text-xs transition-colors flex items-center gap-1.5 ${
                diffTab === 'modules'
                  ? 'bg-accent-soft text-accent font-bold'
                  : 'text-secondary hover:text-ink'
              }`}
            >
              <span>业务模块表行数计数</span>
              <Chip tone="neutral">{modulesDiff.length} 个数据表</Chip>
            </button>
          </div>

          {/* 选项卡 1：核心待办事项差异 */}
          {diffTab === 'core' && (
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {totalCoreDiff === 0 ? (
                <div className="py-6 text-center text-muted bg-surface-2/40 rounded-control border border-line">
                  <IconCheck size={20} className="text-good mx-auto mb-1" />
                  <span>核心待办事项与本地当前完全一致，无新增、删除或变更</span>
                </div>
              ) : (
                <>
                  {/* 1. 云端新增 (+) */}
                  {coreAdded.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 font-bold text-good text-[11px] uppercase tracking-wider">
                        <span>+ 云端新增 ({coreAdded.length} 项，恢复后将写入本地)</span>
                      </div>
                      <div className="space-y-1">
                        {coreAdded.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between p-2 rounded-control bg-good-soft/50 border border-good/20 text-xs"
                          >
                            <span className="font-semibold text-ink truncate">{item.title}</span>
                            <span className="font-mono text-[10px] text-muted shrink-0 ml-2">
                              {item.id}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 2. 本地独有 (-) */}
                  {coreRemoved.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 font-bold text-critical text-[11px] uppercase tracking-wider">
                        <span>- 本地独有 ({coreRemoved.length} 项，恢复后将被覆盖删除)</span>
                      </div>
                      <div className="space-y-1">
                        {coreRemoved.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between p-2 rounded-control bg-critical/10 border border-critical/20 text-xs"
                          >
                            <span className="font-semibold text-ink truncate line-through text-muted">
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

                  {/* 3. 内容不同 (~) */}
                  {coreModified.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 font-bold text-warning text-[11px] uppercase tracking-wider">
                        <span>~ 内容变更 ({coreModified.length} 项，恢复后将以云端为准)</span>
                      </div>
                      <div className="space-y-1">
                        {coreModified.map((item) => (
                          <div
                            key={item.id}
                            className="p-2 rounded-control bg-warning-soft/40 border border-warning/20 text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-ink truncate">{item.title}</span>
                              <span className="font-mono text-[10px] text-muted shrink-0 ml-2">
                                {item.id}
                              </span>
                            </div>
                            {item.localTitle && item.localTitle !== item.title && (
                              <div className="text-[11px] text-muted">
                                本地当前标题：
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
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {modulesDiff.length === 0 ? (
                <div className="py-6 text-center text-muted bg-surface-2/40 rounded-control border border-line">
                  暂无业务模块表数据
                </div>
              ) : (
                modulesDiff.map((m) => {
                  const diffCount = m.remoteCount - m.localCount;
                  return (
                    <div
                      key={m.table}
                      className="flex items-center justify-between p-3 rounded-control border border-line bg-surface-2/40 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="font-bold text-ink flex items-center gap-2">
                          <span>{m.moduleName || m.moduleId}</span>
                          <span className="font-mono text-[11px] text-muted font-normal">
                            ({m.table})
                          </span>
                        </div>
                        <div className="text-[11px] text-secondary">
                          本地 {m.localCount} 条 → 云端 {m.remoteCount} 条
                        </div>
                      </div>

                      <div>
                        {diffCount > 0 ? (
                          <Chip tone="good">+{diffCount} 条新增</Chip>
                        ) : diffCount < 0 ? (
                          <Chip tone="warning">{diffCount} 条变动</Chip>
                        ) : (
                          <Chip tone="neutral">数量一致</Chip>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* 底部危险提示与操作区 */}
          <div className="rounded-control bg-surface-2 p-3 text-[11px] text-muted space-y-1 border border-line">
            <div className="flex items-center gap-1.5 font-bold text-ink">
              <IconShield size={14} className="text-accent" />
              <span>安全回退保障：</span>
            </div>
            <div>
              确认恢复将从 WebDAV
              拉取数据库快照并替换当前本地库。系统将在热替换前自动在本地保留回退点（
              <code>.restore/backup.db</code>），万一发生异常可随时手动或自动回退。
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={onClose}
              disabled={isRestoring}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="danger"
              size="md"
              disabled={isRestoring}
              icon={<IconDatabase size={14} />}
              onClick={() => backupName && onConfirmRestore(backupName)}
            >
              {isRestoring ? '正在进入恢复态...' : '确认恢复至此备份'}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
