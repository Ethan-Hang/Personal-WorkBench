import { useMemo, useState } from 'react';
import { Button, Chip, Field, IconAlertCircle, IconCheck, controlClass } from '@workbench/ui';
import type { ConfirmImportInput, MetadataSourceKind, WorkType } from '../../contract.js';
import type { ImportInspectionItem } from '../api.js';

type Fields = ConfirmImportInput['fields'];

const SOURCE_LABELS: Record<MetadataSourceKind, string> = {
  user: '人工输入',
  'exact-external': '外部精确记录',
  external: '外部候选',
  'embedded-pdf': 'PDF 内嵌',
  'first-page': 'PDF 首页',
  filename: '文件名',
};

const TYPE_LABELS: Record<WorkType, string> = {
  article: '期刊文章',
  'conference-paper': '会议论文',
  preprint: '预印本',
  thesis: '学位论文',
  'book-chapter': '书籍章节',
  report: '报告',
  standard: '标准',
  dataset: '数据集',
  web: '网页资料',
  unknown: '暂不确定',
};

interface SelectedField {
  value: unknown;
  sourceKind: MetadataSourceKind;
  sourceRecordId: string | null;
}

function initialField(item: ImportInspectionItem, name: string): SelectedField | null {
  const order: MetadataSourceKind[] = ['embedded-pdf', 'first-page', 'filename'];
  const suggestions = item.localSuggestions
    .filter((value) => value.fieldName === name)
    .sort((left, right) => order.indexOf(left.sourceKind) - order.indexOf(right.sourceKind));
  const value = suggestions[0];
  return value
    ? {
        value: value.value,
        sourceKind: value.sourceKind,
        sourceRecordId: value.sourceRecordId,
      }
    : null;
}

export function MetadataReview({
  item,
  collectionIds,
  busy,
  onConfirm,
}: {
  item: ImportInspectionItem;
  collectionIds: string[];
  busy: boolean;
  onConfirm: (input: ConfirmImportInput) => Promise<void>;
}) {
  const titleInitial = initialField(item, 'title');
  const authorsInitial = initialField(item, 'authors');
  const [title, setTitle] = useState<SelectedField>(
    titleInitial ?? { value: '', sourceKind: 'user', sourceRecordId: null },
  );
  const [authors, setAuthors] = useState<SelectedField>(
    authorsInitial ?? { value: [], sourceKind: 'user', sourceRecordId: null },
  );
  const [year, setYear] = useState<SelectedField>({
    value: null,
    sourceKind: 'user',
    sourceRecordId: null,
  });
  const [type, setType] = useState<SelectedField>({
    value: 'unknown',
    sourceKind: 'user',
    sourceRecordId: null,
  });
  const [publicationTitle, setPublicationTitle] = useState<SelectedField>({
    value: '',
    sourceKind: 'user',
    sourceRecordId: null,
  });
  const [publisher, setPublisher] = useState<SelectedField>({
    value: '',
    sourceKind: 'user',
    sourceRecordId: null,
  });
  const [decision, setDecision] = useState<ConfirmImportInput['duplicateDecision']>('new-work');
  const [targetWorkId, setTargetWorkId] = useState<string | null>(null);
  const [targetEditionId, setTargetEditionId] = useState<string | null>(null);

  const identifierMatches = useMemo(() => {
    const seen = new Set<string>();
    return item.identifierMatches.filter((match) => {
      const key = `${match.workId}:${match.editionId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [item.identifierMatches]);

  const applyExternal = (candidate: ImportInspectionItem['externalCandidates'][number]) => {
    const sourceKind: MetadataSourceKind =
      candidate.matchKind === 'exact' ? 'exact-external' : 'external';
    const fromSource = (value: unknown): SelectedField => ({
      value,
      sourceKind,
      sourceRecordId: candidate.sourceRecordId,
    });
    if (candidate.title) setTitle(fromSource(candidate.title));
    if (candidate.authors.length > 0) setAuthors(fromSource(candidate.authors));
    if (candidate.year !== null) setYear(fromSource(candidate.year));
    setType(fromSource(candidate.type));
    if (candidate.publicationTitle) setPublicationTitle(fromSource(candidate.publicationTitle));
    if (candidate.publisher) setPublisher(fromSource(candidate.publisher));
  };

  const submit = async (nextDecision = decision) => {
    const fields: Fields = { title, authors, type };
    if (typeof year.value === 'number') fields.year = year;
    if (typeof publicationTitle.value === 'string' && publicationTitle.value.trim()) {
      fields.publicationTitle = publicationTitle;
    }
    if (typeof publisher.value === 'string' && publisher.value.trim()) fields.publisher = publisher;
    await onConfirm({
      itemId: item.item.id,
      duplicateDecision: nextDecision,
      targetWorkId,
      targetEditionId,
      collectionIds,
      fields,
      requestId: crypto.randomUUID(),
    });
  };

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h4 className="text-xs font-bold uppercase tracking-[0.08em] text-muted">文件身份</h4>
          {item.asset && <Chip tone="good">SHA-256 已确认</Chip>}
        </div>
        {item.asset && (
          <div className="grid gap-2 rounded-control bg-surface-2/65 p-3 text-xs sm:grid-cols-[1fr_auto]">
            <code className="truncate text-secondary" title={item.asset.contentHash}>
              {item.asset.contentHash}
            </code>
            <span className="tabular-nums text-muted">
              {(item.asset.byteSize / 1024 / 1024).toFixed(2)} MiB
            </span>
          </div>
        )}
      </section>

      {(item.exactAssetUsages.length > 0 || identifierMatches.length > 0) && (
        <section className="rounded-control border border-warning/25 bg-warning-soft/55 p-3">
          <div className="flex items-start gap-2 text-warning">
            <IconAlertCircle size={15} className="mt-0.5 shrink-0" />
            <div>
              <h4 className="text-xs font-bold">需要决定作品归属</h4>
              <p className="mt-1 text-[11px] leading-5">
                {item.exactAssetUsages.length > 0
                  ? '相同文件已经入库，可挂回现有版本。'
                  : '检测到相同标识符但文件内容不同，请确认它是新版本还是新作品。'}
              </p>
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            {item.exactAssetUsages.map((usage) => (
              <label key={usage.attachmentId} className="flex items-center gap-2 text-xs text-ink">
                <input
                  type="radio"
                  name="duplicate-decision"
                  checked={decision === 'existing-edition' && targetEditionId === usage.editionId}
                  onChange={() => {
                    setDecision('existing-edition');
                    setTargetWorkId(usage.workId);
                    setTargetEditionId(usage.editionId);
                  }}
                />
                挂到现有版本 <code className="text-[10px] text-muted">{usage.editionId}</code>
              </label>
            ))}
            {identifierMatches.map((match) => (
              <label
                key={`${match.workId}:${match.editionId}`}
                className="flex items-center gap-2 text-xs text-ink"
              >
                <input
                  type="radio"
                  name="duplicate-decision"
                  checked={decision === 'new-edition' && targetWorkId === match.workId}
                  onChange={() => {
                    setDecision('new-edition');
                    setTargetWorkId(match.workId);
                    setTargetEditionId(null);
                  }}
                />
                作为同一作品的新版本（{match.scheme.toUpperCase()} {match.value}）
              </label>
            ))}
            <label className="flex items-center gap-2 text-xs text-ink">
              <input
                type="radio"
                name="duplicate-decision"
                checked={decision === 'new-work'}
                onChange={() => {
                  setDecision('new-work');
                  setTargetWorkId(null);
                  setTargetEditionId(null);
                }}
              />
              仍然创建新作品
            </label>
          </div>
        </section>
      )}

      {item.externalCandidates.length > 0 && (
        <section>
          <h4 className="text-xs font-bold uppercase tracking-[0.08em] text-muted">外部候选</h4>
          <div className="mt-2 divide-y divide-line rounded-control border border-line">
            {item.externalCandidates.map((candidate) => (
              <div
                key={`${candidate.provider}:${candidate.sourceLocator}`}
                className="flex items-start justify-between gap-4 p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Chip tone={candidate.matchKind === 'exact' ? 'accent' : 'neutral'}>
                      {candidate.provider}
                    </Chip>
                    <span className="text-[11px] text-muted">
                      {candidate.matchKind === 'exact' ? '精确记录' : '检索候选'}
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-semibold text-ink">
                    {candidate.title ?? '无标题'}
                  </p>
                  <p className="mt-1 truncate text-[11px] text-secondary">
                    {candidate.authors.join('、') || '无作者'}
                    {candidate.year !== null ? ` · ${candidate.year}` : ''}
                  </p>
                </div>
                <Button type="button" size="sm" onClick={() => applyExternal(candidate)}>
                  采用
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2">
        <Field label={`标题 · ${SOURCE_LABELS[title.sourceKind]}`} className="sm:col-span-2">
          <input
            className={controlClass}
            value={typeof title.value === 'string' ? title.value : ''}
            onChange={(event) =>
              setTitle({ value: event.target.value, sourceKind: 'user', sourceRecordId: null })
            }
          />
        </Field>
        <Field label={`作者 · ${SOURCE_LABELS[authors.sourceKind]}`}>
          <input
            className={controlClass}
            value={Array.isArray(authors.value) ? authors.value.join('; ') : ''}
            onChange={(event) =>
              setAuthors({
                value: event.target.value
                  .split(';')
                  .map((value) => value.trim())
                  .filter(Boolean),
                sourceKind: 'user',
                sourceRecordId: null,
              })
            }
            placeholder="多位作者用分号分隔"
          />
        </Field>
        <Field label={`年份 · ${SOURCE_LABELS[year.sourceKind]}`}>
          <input
            className={controlClass}
            type="number"
            min={0}
            max={9999}
            value={typeof year.value === 'number' ? year.value : ''}
            onChange={(event) =>
              setYear({
                value: event.target.value ? Number(event.target.value) : null,
                sourceKind: 'user',
                sourceRecordId: null,
              })
            }
          />
        </Field>
        <Field label={`类型 · ${SOURCE_LABELS[type.sourceKind]}`}>
          <select
            className={controlClass}
            value={String(type.value)}
            onChange={(event) =>
              setType({ value: event.target.value, sourceKind: 'user', sourceRecordId: null })
            }
          >
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`刊物 / 会议 · ${SOURCE_LABELS[publicationTitle.sourceKind]}`}>
          <input
            className={controlClass}
            value={String(publicationTitle.value ?? '')}
            onChange={(event) =>
              setPublicationTitle({
                value: event.target.value,
                sourceKind: 'user',
                sourceRecordId: null,
              })
            }
          />
        </Field>
        <Field label={`出版方 · ${SOURCE_LABELS[publisher.sourceKind]}`} className="sm:col-span-2">
          <input
            className={controlClass}
            value={String(publisher.value ?? '')}
            onChange={(event) =>
              setPublisher({
                value: event.target.value,
                sourceKind: 'user',
                sourceRecordId: null,
              })
            }
          />
        </Field>
      </section>

      {item.warnings.length > 0 && (
        <div className="space-y-1 rounded-control bg-warning-soft/55 p-3 text-[11px] text-warning">
          {item.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        <div className="flex gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => submit('defer')}>
            暂留
          </Button>
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={busy}
            onClick={() => submit('discard')}
          >
            放弃
          </Button>
        </div>
        <Button
          type="button"
          variant="primary"
          icon={<IconCheck size={14} />}
          disabled={busy || String(title.value).trim() === ''}
          onClick={() => submit()}
        >
          确认入库
        </Button>
      </div>
    </div>
  );
}
