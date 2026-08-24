import { useState } from 'react';
import { Button, Field, controlClass } from '@workbench/ui';
import {
  ATTACHMENT_ROLES,
  WORK_TYPES,
  type ResearchSearchAst,
  type SearchSort,
} from '../../contract.js';
import type { CollectionView, TagView } from '../api.js';

type Filters = ResearchSearchAst['filters'];
type ArrayFilterKey =
  | 'collectionIds'
  | 'tagIds'
  | 'types'
  | 'attachmentRoles'
  | 'storageModes'
  | 'fileStatuses'
  | 'maintenance';

const labels = {
  types: {
    unknown: '未分类',
    article: '期刊文章',
    'conference-paper': '会议论文',
    preprint: '预印本',
    thesis: '学位论文',
    'book-chapter': '书籍章节',
    report: '报告',
    standard: '标准',
    dataset: '数据集',
    web: '网页资料',
  },
  roles: {
    'primary-pdf': '主 PDF',
    supplement: '补充材料',
    dataset: '数据集',
    code: '代码',
    'web-snapshot': '网页快照',
    other: '其他',
  },
  file: {
    none: '无附件',
    available: '可用',
    missing: '缺失',
    changed: '已变化',
    recycled: '已移除',
    mixed: '混合状态',
  },
  maintenance: {
    'missing-fields': '缺失字段',
    'missing-files': '缺失/变化文件',
    'duplicate-candidates': '重复候选',
    'metadata-failed': '元数据失败',
    'unfinished-imports': '未完成导入',
  },
} as const;

export function SearchFiltersPanel({
  open,
  filters,
  sort,
  collections,
  tags,
  saving,
  onChange,
  onSort,
  onClear,
  onSave,
}: {
  open: boolean;
  filters: Filters;
  sort: SearchSort;
  collections: CollectionView[];
  tags: TagView[];
  saving: boolean;
  onChange: (filters: Filters) => void;
  onSort: (sort: SearchSort) => void;
  onClear: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [savedName, setSavedName] = useState('');
  if (!open) return null;

  const toggle = (key: ArrayFilterKey, value: string) => {
    const current = filters[key] as string[];
    onChange({
      ...filters,
      [key]: current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    });
  };
  const chips = (
    key: ArrayFilterKey,
    values: Array<{ value: string; label: string; color?: string | null }>,
  ) => (
    <div className="flex flex-wrap gap-1.5">
      {values.map((item) => {
        const checked = (filters[key] as string[]).includes(item.value);
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={checked}
            onClick={() => toggle(key, item.value)}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition ${
              checked
                ? 'border-accent/25 bg-accent-soft font-semibold text-accent'
                : 'border-line bg-surface text-secondary hover:text-ink'
            }`}
          >
            {item.color !== undefined && (
              <span
                className="h-2 w-2 rounded-full border border-line"
                style={{ backgroundColor: item.color ?? 'transparent' }}
              />
            )}
            {item.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <section className="border-t border-line bg-surface-2/30 p-4 animate-slide-down-in">
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="排序">
          <select
            className={controlClass}
            value={sort}
            onChange={(event) => onSort(event.target.value as SearchSort)}
          >
            <option value="relevance">相关度</option>
            <option value="updated-desc">最近更新</option>
            <option value="title-asc">标题</option>
            <option value="year-desc">年份</option>
          </select>
        </Field>
        <Field label="起始年份">
          <input
            className={controlClass}
            type="number"
            min={0}
            max={9999}
            value={filters.yearFrom ?? ''}
            onChange={(event) =>
              onChange({
                ...filters,
                yearFrom: event.target.value ? Number(event.target.value) : null,
              })
            }
          />
        </Field>
        <Field label="结束年份">
          <input
            className={controlClass}
            type="number"
            min={0}
            max={9999}
            value={filters.yearTo ?? ''}
            onChange={(event) =>
              onChange({
                ...filters,
                yearTo: event.target.value ? Number(event.target.value) : null,
              })
            }
          />
        </Field>
        <Field label="相关文献 ID">
          <input
            className={controlClass}
            value={filters.relatedWorkId ?? ''}
            onChange={(event) =>
              onChange({ ...filters, relatedWorkId: event.target.value.trim() || null })
            }
          />
        </Field>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-muted">类型</p>
          {chips(
            'types',
            WORK_TYPES.map((value) => ({ value, label: labels.types[value] })),
          )}
        </div>
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-muted">目录</p>
          {collections.length > 0 ? (
            chips(
              'collectionIds',
              collections.map((value) => ({ value: value.id, label: value.name })),
            )
          ) : (
            <span className="text-[11px] text-muted">暂无普通目录</span>
          )}
        </div>
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-muted">标签</p>
          {tags.length > 0 ? (
            chips(
              'tagIds',
              tags.map((value) => ({ value: value.id, label: value.name, color: value.color })),
            )
          ) : (
            <span className="text-[11px] text-muted">暂无标签</span>
          )}
        </div>
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
            附件角色
          </p>
          {chips(
            'attachmentRoles',
            ATTACHMENT_ROLES.map((value) => ({ value, label: labels.roles[value] })),
          )}
        </div>
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
            存储与文件状态
          </p>
          <div className="space-y-2">
            {chips('storageModes', [
              { value: 'managed', label: '托管' },
              { value: 'linked', label: '链接' },
            ])}
            {chips(
              'fileStatuses',
              Object.entries(labels.file).map(([value, label]) => ({ value, label })),
            )}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
            维护条件
          </p>
          {chips(
            'maintenance',
            Object.entries(labels.maintenance).map(([value, label]) => ({ value, label })),
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
        <Field label="保存为智能目录" className="min-w-[220px]">
          <input
            className={controlClass}
            value={savedName}
            onChange={(event) => setSavedName(event.target.value)}
            placeholder="例如：近五年待补元数据"
          />
        </Field>
        <Button
          disabled={saving || !savedName.trim()}
          onClick={() => void onSave(savedName.trim()).then(() => setSavedName(''))}
        >
          保存查询
        </Button>
        <Button disabled={saving} onClick={onClear}>
          清除过滤
        </Button>
      </div>
    </section>
  );
}
