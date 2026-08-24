import { useEffect, useState } from 'react';
import { Button, Field, Modal, controlClass } from '@workbench/ui';
import type { UpdateWorkMetadataInput, WorkType } from '../../contract.js';
import type { WorkDetail } from '../api.js';

const WORK_TYPE_LABELS: Array<[WorkType, string]> = [
  ['article', '期刊文章'],
  ['conference-paper', '会议论文'],
  ['preprint', '预印本'],
  ['thesis', '学位论文'],
  ['book-chapter', '书籍章节'],
  ['report', '报告'],
  ['standard', '标准'],
  ['dataset', '数据集'],
  ['web', '网页资料'],
  ['unknown', '暂不确定'],
];

type WorkChanges = NonNullable<UpdateWorkMetadataInput['work']>;
type EditionChanges = NonNullable<UpdateWorkMetadataInput['edition']>;

function nullable(value: string): string | null {
  return value.trim() || null;
}

function authorsFromEdition(detail: WorkDetail, editionId: string): string[] {
  return (
    detail.editions
      .find((edition) => edition.id === editionId)
      ?.contributors.filter((contributor) => contributor.role === 'author')
      .sort((left, right) => left.sequence - right.sequence)
      .map((contributor) => contributor.displayName) ?? []
  );
}

export function WorkMetadataDialog({
  open,
  detail,
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  detail: WorkDetail | undefined;
  busy: boolean;
  onClose: () => void;
  onSave: (input: UpdateWorkMetadataInput) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<WorkType>('unknown');
  const [abstract, setAbstract] = useState('');
  const [year, setYear] = useState('');
  const [editionId, setEditionId] = useState('');
  const [editionTitle, setEditionTitle] = useState('');
  const [publicationTitle, setPublicationTitle] = useState('');
  const [publisher, setPublisher] = useState('');
  const [publishedDate, setPublishedDate] = useState('');
  const [authors, setAuthors] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !detail) return;
    setTitle(detail.work.title);
    setType(detail.work.type);
    setAbstract(detail.work.abstract ?? '');
    setYear(detail.work.year?.toString() ?? '');
    const initialEdition =
      detail.editions.find((edition) => edition.id === detail.work.preferredEditionId) ??
      detail.editions[0];
    setEditionId(initialEdition?.id ?? '');
    setEditionTitle(initialEdition?.title ?? '');
    setPublicationTitle(initialEdition?.publicationTitle ?? '');
    setPublisher(initialEdition?.publisher ?? '');
    setPublishedDate(initialEdition?.publishedDate ?? '');
    setAuthors(initialEdition ? authorsFromEdition(detail, initialEdition.id).join('\n') : '');
    setError(null);
  }, [detail, open]);

  const selectEdition = (id: string) => {
    setEditionId(id);
    const edition = detail?.editions.find((candidate) => candidate.id === id);
    setEditionTitle(edition?.title ?? '');
    setPublicationTitle(edition?.publicationTitle ?? '');
    setPublisher(edition?.publisher ?? '');
    setPublishedDate(edition?.publishedDate ?? '');
    setAuthors(detail && edition ? authorsFromEdition(detail, edition.id).join('\n') : '');
  };

  const submit = async () => {
    if (!detail || !title.trim()) return;
    const work: WorkChanges = {};
    const nextTitle = title.trim();
    const nextAbstract = nullable(abstract);
    const nextYear = year.trim() ? Number(year) : null;
    if (nextTitle !== detail.work.title) work.title = nextTitle;
    if (type !== detail.work.type) work.type = type;
    if (nextAbstract !== detail.work.abstract) work.abstract = nextAbstract;
    if (nextYear !== detail.work.year) work.year = nextYear;

    const currentEdition = detail.editions.find((edition) => edition.id === editionId);
    let edition: EditionChanges | undefined;
    if (currentEdition) {
      edition = { id: currentEdition.id, expectedRevision: currentEdition.revision };
      const nextEditionTitle = editionTitle.trim();
      const nextPublicationTitle = nullable(publicationTitle);
      const nextPublisher = nullable(publisher);
      const nextPublishedDate = nullable(publishedDate);
      const nextAuthors = authors
        .split(/\r?\n|;/)
        .map((value) => value.trim())
        .filter(Boolean);
      const currentAuthors = authorsFromEdition(detail, currentEdition.id);
      if (nextEditionTitle && nextEditionTitle !== currentEdition.title) {
        edition.title = nextEditionTitle;
      }
      if (nextPublicationTitle !== currentEdition.publicationTitle) {
        edition.publicationTitle = nextPublicationTitle;
      }
      if (nextPublisher !== currentEdition.publisher) edition.publisher = nextPublisher;
      if (nextPublishedDate !== currentEdition.publishedDate) {
        edition.publishedDate = nextPublishedDate;
      }
      if (JSON.stringify(nextAuthors) !== JSON.stringify(currentAuthors)) {
        edition.authors = nextAuthors;
      }
      if (Object.keys(edition).length === 2) edition = undefined;
    }

    if (Object.keys(work).length === 0 && !edition) {
      setError('没有需要保存的修改');
      return;
    }
    setError(null);
    try {
      await onSave({
        expectedWorkRevision: detail.work.revision,
        ...(Object.keys(work).length > 0 ? { work } : {}),
        ...(edition ? { edition } : {}),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '元数据保存失败');
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="编辑文献信息"
      description="修改后的内容将作为当前信息，原始识别结果仍可查看。"
      maxWidth="max-w-3xl"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="文献标题" className="sm:col-span-2">
          <input
            autoFocus
            className={controlClass}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field label="文献类型">
          <select
            className={controlClass}
            value={type}
            onChange={(event) => setType(event.target.value as WorkType)}
          >
            {WORK_TYPE_LABELS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
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
        <Field label="摘要" className="sm:col-span-2">
          <textarea
            className={`${controlClass} min-h-28 resize-y`}
            value={abstract}
            onChange={(event) => setAbstract(event.target.value)}
          />
        </Field>
      </div>

      {detail && detail.editions.length > 0 && (
        <section className="mt-6 border-t border-line pt-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="编辑版本" className="sm:col-span-2">
              <select
                className={controlClass}
                value={editionId}
                onChange={(event) => selectEdition(event.target.value)}
              >
                {detail.editions.map((edition, index) => (
                  <option key={edition.id} value={edition.id}>
                    {edition.title || `版本 ${index + 1}`} · {edition.kind}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="版本标题" className="sm:col-span-2">
              <input
                className={controlClass}
                value={editionTitle}
                onChange={(event) => setEditionTitle(event.target.value)}
              />
            </Field>
            <Field label="刊物 / 会议">
              <input
                className={controlClass}
                value={publicationTitle}
                onChange={(event) => setPublicationTitle(event.target.value)}
              />
            </Field>
            <Field label="出版方">
              <input
                className={controlClass}
                value={publisher}
                onChange={(event) => setPublisher(event.target.value)}
              />
            </Field>
            <Field label="发布日期">
              <input
                className={controlClass}
                value={publishedDate}
                onChange={(event) => setPublishedDate(event.target.value)}
                placeholder="YYYY-MM-DD 或原始日期文本"
              />
            </Field>
            <Field label="作者（每行一位）">
              <textarea
                className={`${controlClass} min-h-24 resize-y`}
                value={authors}
                onChange={(event) => setAuthors(event.target.value)}
              />
            </Field>
          </div>
        </section>
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
          disabled={busy || !title.trim()}
          onClick={() => void submit()}
        >
          {busy ? '正在保存…' : '保存修改'}
        </Button>
      </div>
    </Modal>
  );
}
