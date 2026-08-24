import {
  Button,
  Chip,
  IconAlertCircle,
  IconBookOpen,
  IconPlus,
  IconTag,
  IconTrash,
} from '@workbench/ui';
import type { CollectionView, TagView, WorkDetail } from '../api.js';
import { FileStatus } from './FileStatus.js';

export interface WorkDetailPanelProps {
  detail: WorkDetail | undefined;
  loading: boolean;
  collections: CollectionView[];
  selectedCollectionIds: string[];
  savingCollections: boolean;
  availableTags: TagView[];
  selectedTagIds: string[];
  savingTags: boolean;
  variant?: 'compact' | 'template';
  onToggleCollection: (id: string) => void;
  onSaveCollections: () => void;
  onToggleTag: (id: string) => void;
  onSaveTags: () => void;
  onCheckLocation: (id: string) => void;
  onRelinkLocation: (id: string) => void;
  onRemoveAttachment: (id: string) => void;
  onRestoreAttachment: (id: string) => void;
  onPermanentDeleteAttachment: (id: string) => void;
  onAddAttachment: (editionId: string) => void;
  onEditMetadata: () => void;
  onAddRelation: (workId: string) => void;
  onRemoveRelation: (id: string) => void;
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
  availableTags,
  selectedTagIds,
  savingTags,
  variant = 'compact',
  onToggleCollection,
  onSaveCollections,
  onToggleTag,
  onSaveTags,
  onCheckLocation,
  onRelinkLocation,
  onRemoveAttachment,
  onRestoreAttachment,
  onPermanentDeleteAttachment,
  onAddAttachment,
  onEditMetadata,
  onAddRelation,
  onRemoveRelation,
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
          <div className="min-w-0">
            <h2 className="break-words text-lg font-bold leading-6 text-ink">
              {detail.work.title || '未命名作品'}
            </h2>
            <p className="mt-2 text-xs leading-5 text-secondary">
              {detail.work.authors.join('、') || '作者待补充'}
              {detail.work.year !== null ? ` · ${detail.work.year}` : ''}
            </p>
            {detail.work.abstract && (
              <p className="mt-3 line-clamp-4 whitespace-pre-wrap break-words text-xs leading-5 text-muted">
                {detail.work.abstract}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <FileStatus status={detail.work.fileStatus} />
            {detail.work.status === 'active' && (
              <Button size="sm" onClick={onEditMetadata}>
                编辑元数据
              </Button>
            )}
          </div>
        </div>
      </section>

      <section className={sectionClass}>
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-muted">
            <IconTag size={12} /> 标签
          </h3>
          {detail.work.status === 'active' && (
            <Button size="sm" disabled={savingTags} onClick={onSaveTags}>
              保存
            </Button>
          )}
        </div>
        <div className="mt-3 flex max-h-36 flex-wrap gap-2 overflow-y-auto pr-1">
          {availableTags.map((tag) => {
            const checked = selectedTagIds.includes(tag.id);
            return (
              <label
                key={tag.id}
                className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                  checked
                    ? 'border-accent/25 bg-accent-soft text-accent'
                    : 'border-line bg-surface text-secondary'
                } ${detail.work.status !== 'active' ? 'pointer-events-none opacity-70' : ''}`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  disabled={detail.work.status !== 'active'}
                  onChange={() => onToggleTag(tag.id)}
                />
                <span
                  className="h-2 w-2 rounded-full border border-line"
                  style={{ backgroundColor: tag.color ?? 'transparent' }}
                />
                {tag.name}
              </label>
            );
          })}
          {availableTags.length === 0 && (
            <span className="text-[11px] text-muted">尚未创建标签</span>
          )}
        </div>
      </section>

      <section className={sectionClass}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-muted">作品关系</h3>
          {detail.work.status === 'active' && (
            <Button
              size="sm"
              icon={<IconPlus size={12} />}
              onClick={() => onAddRelation(detail.work.id)}
            >
              添加
            </Button>
          )}
        </div>
        <div className="mt-3 space-y-2">
          {detail.relations.map((relation) => (
            <div key={relation.id} className="rounded-control border border-line bg-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-ink">
                    {relation.direction === 'outgoing' ? '指向' : '来自'} · {relation.kind}
                  </p>
                  <p className="mt-1 truncate text-[11px] text-secondary">
                    {relation.counterpart.title || relation.counterpart.id}
                    {relation.counterpart.status === 'trashed' ? ' · 已在回收站' : ''}
                  </p>
                  {relation.note && <p className="mt-1 text-[11px] text-muted">{relation.note}</p>}
                </div>
                {detail.work.status === 'active' && (
                  <button
                    type="button"
                    className="shrink-0 text-[11px] font-semibold text-critical"
                    onClick={() => onRemoveRelation(relation.id)}
                  >
                    移除
                  </button>
                )}
              </div>
            </div>
          ))}
          {detail.relations.length === 0 && (
            <p className="text-[11px] leading-5 text-muted">
              尚未建立 related、extends、revises 或 cites 关系。
            </p>
          )}
        </div>
      </section>

      <section className={sectionClass}>
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-muted">目录归属</h3>
          {detail.work.status === 'active' && (
            <Button size="sm" disabled={savingCollections} onClick={onSaveCollections}>
              保存
            </Button>
          )}
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
                } ${detail.work.status !== 'active' ? 'pointer-events-none opacity-70' : ''}`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  disabled={detail.work.status !== 'active'}
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
                <div className="min-w-0">
                  <p className="break-words text-xs font-semibold text-ink">
                    {edition.publicationTitle || edition.title || '未命名版本'}
                  </p>
                  <p className="mt-1 break-words text-[11px] leading-5 text-secondary">
                    {edition.contributors
                      .filter((contributor) => contributor.role === 'author')
                      .map((contributor) => contributor.displayName)
                      .join('、') || '作者待补充'}
                    {edition.publisher ? ` · ${edition.publisher}` : ''}
                    {edition.publishedDate ? ` · ${edition.publishedDate}` : ''}
                  </p>
                  <p className="mt-1 text-[11px] text-muted">
                    {edition.identifiers
                      .map((identifier) => `${identifier.scheme.toUpperCase()} ${identifier.value}`)
                      .join(' · ') || '无外部标识符'}
                  </p>
                </div>
                {detail.work.status === 'active' && (
                  <Button
                    size="sm"
                    icon={<IconPlus size={12} />}
                    onClick={() => onAddAttachment(edition.id)}
                  >
                    附件
                  </Button>
                )}
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
                            <p className="mt-1 break-all text-[10px] text-muted">
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
                  {attachment.status === 'active' ? (
                    <button
                      type="button"
                      className="mt-3 text-[11px] font-semibold text-critical"
                      onClick={() => onRemoveAttachment(attachment.id)}
                    >
                      移除附件
                    </button>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-3">
                      <button
                        type="button"
                        className="text-[11px] font-semibold text-accent"
                        onClick={() => onRestoreAttachment(attachment.id)}
                      >
                        恢复附件
                      </button>
                      <button
                        type="button"
                        className="text-[11px] font-semibold text-critical"
                        onClick={() => onPermanentDeleteAttachment(attachment.id)}
                      >
                        永久删除附件
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className={sectionClass}>
        <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-muted">元数据来源</h3>
        <div className="mt-3 space-y-3">
          {detail.assertions.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-xs font-semibold text-secondary">
                字段取值与来源（{detail.assertions.length}）
              </summary>
              <div className="mt-3 space-y-2">
                {detail.assertions.map((assertion) => {
                  const source = detail.sources.find(
                    (candidate) => candidate.id === assertion.sourceRecordId,
                  );
                  return (
                    <div
                      key={assertion.id}
                      className="border-l-2 border-line pl-3 text-[11px] leading-5"
                    >
                      <p className="break-words text-secondary">
                        <span className="font-semibold text-ink">{assertion.fieldName}</span> ·{' '}
                        {typeof assertion.value === 'string'
                          ? assertion.value || '空值'
                          : JSON.stringify(assertion.value)}
                      </p>
                      <p className="text-muted">
                        {assertion.isSelected ? '当前采用' : '历史候选'} ·{' '}
                        {assertion.sourceKind === 'user'
                          ? '人工修改'
                          : (source?.provider ?? assertion.sourceKind)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </details>
          ) : (
            <p className="text-[11px] text-muted">没有字段来源记录</p>
          )}

          {detail.externalMappings.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs font-semibold text-secondary">
                外部服务映射（{detail.externalMappings.length}）
              </summary>
              <div className="mt-3 space-y-2">
                {detail.externalMappings.map((mapping) => (
                  <p key={mapping.id} className="break-all text-[11px] leading-5 text-muted">
                    <span className="font-semibold text-secondary">{mapping.provider}</span> ·{' '}
                    {mapping.externalId} · {mapping.cacheStatus}
                  </p>
                ))}
              </div>
            </details>
          )}

          {detail.sources.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs font-semibold text-secondary">
                原始响应（{detail.sources.length}）
              </summary>
              <div className="mt-3 space-y-3">
                {detail.sources.map((source) => (
                  <details key={source.id} className="border-l-2 border-line pl-3">
                    <summary className="cursor-pointer break-all text-[11px] font-semibold text-secondary">
                      {source.provider} · {source.sourceLocator || '无定位信息'}
                    </summary>
                    <p className="mt-2 break-all text-[10px] leading-5 text-muted">
                      {source.rawFormat} · {source.parserVersion} · {source.observedAt}
                    </p>
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-control bg-surface-2 p-3 text-[10px] leading-5 text-secondary">
                      {source.rawPayload}
                    </pre>
                  </details>
                ))}
              </div>
            </details>
          )}
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
