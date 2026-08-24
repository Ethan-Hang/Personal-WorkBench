import { useEffect, useState } from 'react';
import { Button, IconFolder, IconTag, IconTrash } from '@workbench/ui';
import type { BulkWorkActionInput } from '../../contract.js';
import type { CollectionView, TagView } from '../api.js';

export function BulkActionsBar({
  selectedCount,
  collections,
  tags,
  status,
  onAction,
}: {
  selectedCount: number;
  collections: CollectionView[];
  tags: TagView[];
  status: 'active' | 'trashed';
  onAction: (action: BulkWorkActionInput['action'], collectionId?: string) => Promise<void>;
}) {
  const [collectionId, setCollectionId] = useState('');
  const [tagId, setTagId] = useState('');

  useEffect(() => {
    if (collections.some((collection) => collection.id === collectionId)) return;
    setCollectionId(collections[0]?.id ?? '');
  }, [collectionId, collections]);

  useEffect(() => {
    if (tags.some((tag) => tag.id === tagId)) return;
    setTagId(tags[0]?.id ?? '');
  }, [tagId, tags]);

  if (selectedCount === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-accent/15 bg-accent-soft/45 px-3 py-2 animate-slide-down-in">
      <span className="mr-1 text-xs font-semibold text-accent">已选 {selectedCount} 项</span>
      {collections.length > 0 && (
        <>
          <select
            className="rounded-control border border-line bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-accent"
            value={collectionId}
            onChange={(event) => setCollectionId(event.target.value)}
          >
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            icon={<IconFolder size={12} />}
            onClick={() => void onAction('add-to-collections', collectionId)}
          >
            加入目录
          </Button>
          <Button size="sm" onClick={() => void onAction('remove-from-collections', collectionId)}>
            移出目录
          </Button>
        </>
      )}
      {tags.length > 0 && (
        <>
          <select
            className="rounded-control border border-line bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-accent"
            value={tagId}
            onChange={(event) => setTagId(event.target.value)}
          >
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            icon={<IconTag size={12} />}
            onClick={() => void onAction('add-tags', tagId)}
          >
            添加标签
          </Button>
          <Button size="sm" onClick={() => void onAction('remove-tags', tagId)}>
            移除标签
          </Button>
        </>
      )}
      <Button
        size="sm"
        variant={status === 'active' ? 'danger' : 'primary'}
        icon={status === 'active' ? <IconTrash size={12} /> : undefined}
        onClick={() => void onAction(status === 'active' ? 'trash' : 'restore')}
      >
        {status === 'active' ? '移入回收站' : '恢复文献'}
      </Button>
    </div>
  );
}
