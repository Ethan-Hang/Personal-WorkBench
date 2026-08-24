import { useState, type FormEvent } from 'react';
import { Button, controlClass, Field, IconTrash, Modal } from '@workbench/ui';
import type {
  CreateSeasonInput,
  SeasonKind,
  SeasonView,
  UpdateSeasonInput,
} from '../../contract.js';
import { SEASON_KIND_LABEL, SEASON_KIND_OPTIONS } from './SeasonSwitcher.js';

interface SeasonManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  seasons: SeasonView[];
  onCreate: (input: CreateSeasonInput) => Promise<void>;
  onUpdate: (id: string, input: UpdateSeasonInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  isBusy: boolean;
  /**
   * 服务端的错误原样展示。
   *
   * 删除的两条拒绝规则（季里还有投递、这是最后一个未归档的季）的提示语
   * 就是写给用户看的，改写只会丢掉「下一步该做什么」。
   */
  error: Error | null;
}

const EMPTY_FORM = { name: '', kind: 'campus-autumn' as SeasonKind, startDate: '', endDate: '' };

function nullableDate(value: string): string | null {
  return value.trim() === '' ? null : value.trim();
}

function SeasonRow({
  season,
  onUpdate,
  onDelete,
  isBusy,
}: {
  season: SeasonView;
  onUpdate: (id: string, input: UpdateSeasonInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  isBusy: boolean;
}) {
  const [name, setName] = useState(season.name);
  const isArchived = season.archivedAt !== null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-control border border-line bg-surface-2/50 px-2.5 py-2">
      <input
        value={name}
        disabled={isBusy}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const trimmed = name.trim();
          if (trimmed === '' || trimmed === season.name) {
            setName(season.name);
            return;
          }
          void onUpdate(season.id, { name: trimmed });
        }}
        className={`${controlClass} min-w-0 flex-1 py-1 text-[12px]`}
      />

      <span className="shrink-0 text-[11px] text-muted">{SEASON_KIND_LABEL[season.kind]}</span>
      <span className="shrink-0 text-[11px] text-muted tabular-nums">
        {season.applicationCount} 条投递
      </span>

      {/*
        起止日期建完之后同样要能改——招聘季的时间范围本来就是边走边明确的，
        只在新建时可填等于逼人删掉重建。清空即置 null（「还没定」是合法状态）。
        这两个值是浮动日期，原样收发，绝不转 UTC。
      */}
      <input
        type="date"
        value={season.startDate ?? ''}
        disabled={isBusy}
        onChange={(e) => void onUpdate(season.id, { startDate: nullableDate(e.target.value) })}
        className={`${controlClass} shrink-0 py-0.5 text-[11px]`}
        title="开始日期"
      />
      <span className="shrink-0 text-[11px] text-muted">–</span>
      <input
        type="date"
        value={season.endDate ?? ''}
        disabled={isBusy}
        onChange={(e) => void onUpdate(season.id, { endDate: nullableDate(e.target.value) })}
        className={`${controlClass} shrink-0 py-0.5 text-[11px]`}
        title="结束日期"
      />

      <Button
        type="button"
        disabled={isBusy}
        onClick={() => void onUpdate(season.id, { archived: !isArchived })}
        className="px-2 py-0.5 text-[11px]"
        title={
          isArchived ? '取消归档，让它回到切换器里' : '归档后不出现在切换器里，但日历上的面试照旧'
        }
      >
        {isArchived ? '取消归档' : '归档'}
      </Button>

      <button
        type="button"
        disabled={isBusy}
        onClick={() => void onDelete(season.id)}
        className="rounded p-1 text-muted hover:bg-critical-soft hover:text-critical transition-colors disabled:opacity-50"
        title="删除这个招聘季"
      >
        <IconTrash size={13} />
      </button>
    </div>
  );
}

export function SeasonManagerModal({
  isOpen,
  onClose,
  seasons,
  onCreate,
  onUpdate,
  onDelete,
  isBusy,
  error,
}: SeasonManagerModalProps) {
  const [form, setForm] = useState(EMPTY_FORM);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (form.name.trim() === '') return;
    await onCreate({
      name: form.name.trim(),
      kind: form.kind,
      startDate: nullableDate(form.startDate),
      endDate: nullableDate(form.endDate),
    });
    setForm(EMPTY_FORM);
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="管理招聘季"
      description="秋招、春招、社招各自独立；投递、统计与筛选都按季作用。"
    >
      <div className="space-y-4">
        {error && (
          <p
            role="alert"
            className="rounded-control bg-critical-soft px-3 py-2 text-[12px] text-critical"
          >
            {error.message}
          </p>
        )}

        <div className="space-y-1.5">
          {seasons.map((season) => (
            <SeasonRow
              key={`${season.id}-${season.name}`}
              season={season}
              onUpdate={onUpdate}
              onDelete={onDelete}
              isBusy={isBusy}
            />
          ))}
        </div>

        <form onSubmit={handleCreate} className="space-y-2.5 border-t border-line pt-3.5">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label="名称">
              <input
                value={form.name}
                disabled={isBusy}
                placeholder="2027 秋招"
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                className={`${controlClass} py-1 text-[12px]`}
              />
            </Field>
            <Field label="类型">
              <select
                value={form.kind}
                disabled={isBusy}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, kind: e.target.value as SeasonKind }))
                }
                className={`${controlClass} py-1 text-[12px]`}
              >
                {SEASON_KIND_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="开始日期（选填）">
              <input
                type="date"
                value={form.startDate}
                disabled={isBusy}
                onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))}
                className={`${controlClass} py-1 text-[12px]`}
              />
            </Field>
            <Field label="结束日期（选填）">
              <input
                type="date"
                value={form.endDate}
                disabled={isBusy}
                onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))}
                className={`${controlClass} py-1 text-[12px]`}
              />
            </Field>
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={isBusy || form.name.trim() === ''}
            className="py-1 text-[12px]"
          >
            新建招聘季
          </Button>
        </form>
      </div>
    </Modal>
  );
}
