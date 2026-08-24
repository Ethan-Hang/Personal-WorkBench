import { useEffect, useState } from 'react';
import { Button, Field, IconFolder, Modal, controlClass } from '@workbench/ui';
import type { CreateManualWorkInput, IdentifierScheme, WorkType } from '../../contract.js';
import type { CollectionView } from '../api.js';

export function ManualWorkDialog({
  open,
  collections,
  busy,
  onClose,
  onCreate,
}: {
  open: boolean;
  collections: CollectionView[];
  busy: boolean;
  onClose: () => void;
  onCreate: (input: CreateManualWorkInput) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<WorkType>('unknown');
  const [year, setYear] = useState('');
  const [authors, setAuthors] = useState('');
  const [publicationTitle, setPublicationTitle] = useState('');
  const [publisher, setPublisher] = useState('');
  const [identifierScheme, setIdentifierScheme] = useState<IdentifierScheme>('doi');
  const [identifierValue, setIdentifierValue] = useState('');
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setTitle('');
    setType('unknown');
    setYear('');
    setAuthors('');
    setPublicationTitle('');
    setPublisher('');
    setIdentifierScheme('doi');
    setIdentifierValue('');
    setCollectionIds([]);
    setError(null);
  }, [open]);

  const submit = async () => {
    if (!title.trim()) return;
    setError(null);
    try {
      await onCreate({
        title: title.trim(),
        type,
        year: year ? Number(year) : null,
        authors: authors
          .split(';')
          .map((value) => value.trim())
          .filter(Boolean),
        editionKind: 'unknown',
        publicationTitle: publicationTitle.trim() || null,
        publisher: publisher.trim() || null,
        identifiers: identifierValue.trim()
          ? [{ scheme: identifierScheme, value: identifierValue.trim() }]
          : [],
        collectionIds,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建记录失败');
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="新建文献"
      description="填写文献的基本信息；附件可以稍后添加。"
      maxWidth="max-w-2xl"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="标题" className="sm:col-span-2">
          <input
            autoFocus
            className={controlClass}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field label="作者（多位用分号分隔）">
          <input
            className={controlClass}
            value={authors}
            onChange={(event) => setAuthors(event.target.value)}
          />
        </Field>
        <Field label="年份">
          <input
            className={controlClass}
            type="number"
            min={0}
            max={9999}
            value={year}
            onChange={(event) => setYear(event.target.value)}
          />
        </Field>
        <Field label="文献类型">
          <select
            className={controlClass}
            value={type}
            onChange={(event) => setType(event.target.value as WorkType)}
          >
            <option value="unknown">暂不确定</option>
            <option value="article">期刊文章</option>
            <option value="conference-paper">会议论文</option>
            <option value="preprint">预印本</option>
            <option value="thesis">学位论文</option>
            <option value="book-chapter">书籍章节</option>
            <option value="report">报告</option>
            <option value="standard">标准</option>
            <option value="dataset">数据集</option>
            <option value="web">网页资料</option>
          </select>
        </Field>
        <Field label="刊物 / 会议">
          <input
            className={controlClass}
            value={publicationTitle}
            onChange={(event) => setPublicationTitle(event.target.value)}
          />
        </Field>
        <Field label="出版方" className="sm:col-span-2">
          <input
            className={controlClass}
            value={publisher}
            onChange={(event) => setPublisher(event.target.value)}
          />
        </Field>
        <Field label="标识符类型">
          <select
            className={controlClass}
            value={identifierScheme}
            onChange={(event) => setIdentifierScheme(event.target.value as IdentifierScheme)}
          >
            {['doi', 'arxiv', 'isbn', 'issn', 'pmid', 'url'].map((value) => (
              <option key={value} value={value}>
                {value.toUpperCase()}
              </option>
            ))}
          </select>
        </Field>
        <Field label="标识符值">
          <input
            className={controlClass}
            value={identifierValue}
            onChange={(event) => setIdentifierValue(event.target.value)}
          />
        </Field>
      </div>

      {collections.length > 0 && (
        <div className="mt-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">加入目录</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {collections.map((collection) => {
              const checked = collectionIds.includes(collection.id);
              return (
                <label
                  key={collection.id}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                    checked
                      ? 'border-accent/25 bg-accent-soft text-accent'
                      : 'border-line text-secondary'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() =>
                      setCollectionIds((values) =>
                        checked
                          ? values.filter((value) => value !== collection.id)
                          : [...values, collection.id],
                      )
                    }
                  />
                  <IconFolder size={12} />
                  {collection.name}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-control bg-critical-soft p-3 text-xs text-critical">{error}</p>
      )}
      <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
        <Button type="button" onClick={onClose} disabled={busy}>
          取消
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={() => void submit()}
          disabled={busy || !title.trim()}
        >
          {busy ? '正在创建…' : '创建记录'}
        </Button>
      </div>
    </Modal>
  );
}
