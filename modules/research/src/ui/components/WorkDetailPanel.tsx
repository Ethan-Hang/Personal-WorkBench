import { Button, Chip, IconAlertCircle, IconBookOpen, IconPlus, IconTrash } from '@workbench/ui';
import type { CollectionView, WorkDetail } from '../api.js';
import { FileStatus } from './FileStatus.js';

export interface WorkDetailPanelProps {
  detail: WorkDetail | undefined;
  loading: boolean;
  collections: CollectionView[];
  selectedCollectionIds: string[];
  savingCollections: boolean;
  variant?: 'compact' | 'template';
  onToggleCollection: (id: string) => void;
  onSaveCollections: () => void;
  onCheckLocation: (id: string) => void;
  onRelinkLocation: (id: string) => void;
  onRemoveAttachment: (id: string) => void;
  onAddAttachment: (editionId: string) => void;
  onTrashWork: (id: string) => void;
  onRestoreWork: (id: string) => void;
  onPermanentDelete: (id: string) => void;
}

export function WorkDetailPanel({
  detail,
  loading,
  collections,
  selectedCollectionIds,
  savingCollections,
  variant = 'compact',
  onToggleCollection,
  onSaveCollections,
  onCheckLocation,
  onRelinkLocation,
  onRemoveAttachment,
  onAddAttachment,
  onTrashWork,
  onRestoreWork,
  onPermanentDelete,
}: WorkDetailPanelProps) {
  if (!detail && loading) return <p className="text-xs text-muted">正在读取详情…</p>;
  if (!detail) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center text-center">
        <IconBookOpen size={28} className="text-muted" />
        <p className="mt-3 text-sm font-semibold text-ink">选择一条文献查看详情</p>
      </div>
    );
  }

  const sectionClass =
    variant === 'template'
      ? 'rounded-[14px] border border-line bg-surface p-4 shadow-sm'
      : 'border-t border-line pt-4';

  return (
    <div className="space-y-4 animate-scale-in">
      <section className={variant === 'template' ? sectionClass : ''}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold leading-6 text-ink">
              {detail.work.title || '未命名作品'}
            </h2>
            <p className="mt-2 text-xs leading-5 text-secondary">
              {detail.work.authors.join('、') || '作者待补充'}
              {detail.work.year !== null ? ` · ${detail.work.year}` : ''}
            </p>
          </div>
          <FileStatus status={detail.work.fileStatus} />
        </div>
      </section>

      <section className={sectionClass}>
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-muted">目录归属</h3>
          <Button size="sm" disabled={savingCollections} onClick={onSaveCollections}>
            保存
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {collections.map((collection) => {
            const checked = selectedCollectionIds.includes(collection.id);
            return (
              <label
                key={collection.id}
                className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs ${
                  checked
                    ? 'border-accent/25 bg-accent-soft text-accent'
                    : 'border-line bg-surface text-secondary'
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={() => onToggleCollection(collection.id)}
                />
                {collection.name}
              </label>
            );
          })}
          {collections.length === 0 && <span className="text-[11px] text-muted">尚未创建目录</span>}
        </div>
      </section>

      <section className={sectionClass}>
        <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-muted">版本与附件</h3>
        <div className="mt-3 space-y-4">
          {detail.editions.map((edition) => (
            <div key={edition.id} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-ink">
                    {edition.publicationTitle || edition.title || '未命名版本'}
                  </p>
                  <p className="mt-1 text-[11px] text-muted">
                    {edition.identifiers
                      .map((identifier) => `${identifier.scheme.toUpperCase()} ${identifier.value}`)
                      .join(' · ') || '无外部标识符'}
                  </p>
                </div>
                <Button
                  size="sm"
                  icon={<IconPlus size={12} />}
                  onClick={() => onAddAttachment(edition.id)}
                >
                  附件
                </Button>
              </div>
              {edition.attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="rounded-control border border-line bg-surface p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-ink">
                        {attachment.displayName}
                      </p>
                      <p className="mt-1 text-[10px] tabular-nums text-muted">
                        {(attachment.asset.byteSize / 1024 / 1024).toFixed(2)} MiB ·{' '}
                        {attachment.asset.contentHash.slice(0, 12)}…
                      </p>
                    </div>
                    <Chip tone={attachment.status === 'active' ? 'good' : 'neutral'}>
                      {attachment.status === 'active' ? '使用中' : '已移除'}
                    </Chip>
                  </div>
                  <div className="mt-3 space-y-2">
                    {attachment.asset.locations.map((location) => (
                      <div key={location.id} className="border-t border-line/70 pt-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold text-secondary">
                              {location.mode === 'managed' ? '托管副本' : '链接原文件'} ·{' '}
                              {location.state}
                            </p>
                            <p
                              className="mt-1 truncate text-[10px] text-muted"
                              title={location.originalPath}
                            >
                              {location.originalPath}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button size="sm" onClick={() => onCheckLocation(location.id)}>
                              检查
                            </Button>
                            {location.mode === 'linked' &&
                              (location.state === 'missing' || location.state === 'changed') && (
                                <Button size="sm" onClick={() => onRelinkLocation(location.id)}>
                                  重新定位
                                </Button>
                              )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {attachment.status === 'active' && (
                    <button
                      type="button"
                      className="mt-3 text-[11px] font-semibold text-critical"
                      onClick={() => onRemoveAttachment(attachment.id)}
                    >
                      移除附件
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className={sectionClass}>
        <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-muted">作品操作</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {detail.work.status === 'active' ? (
            <Button icon={<IconTrash size={13} />} onClick={() => onTrashWork(detail.work.id)}>
              移入回收站
            </Button>
          ) : (
            <>
              <Button onClick={() => onRestoreWork(detail.work.id)}>恢复作品</Button>
              <Button
                variant="danger"
                icon={<IconAlertCircle size={13} />}
                onClick={() => onPermanentDelete(detail.work.id)}
              >
                永久删除
              </Button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
