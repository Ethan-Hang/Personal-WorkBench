import { useEffect, useState, type FormEvent } from 'react';
import {
  Button,
  DatePicker,
  Field,
  IconCalendar,
  IconChevronRight,
  IconClock,
  IconEdit,
  IconPlus,
  IconTrash,
  IconX,
  controlClass,
  useTimezone,
} from '@workbench/ui';
import {
  APPLICATION_PRIORITIES,
  ROUND_KINDS,
  type ApplicationOutcome,
  type ApplicationPriority,
  type ApplicationView,
  type CreateRoundInput,
  type RoundKind,
  type RoundView,
  type UpdateApplicationInput,
  type UpdateRoundInput,
} from '../../contract.js';
import { PriorityBadge } from './PriorityBadge.js';
import {
  ApplicationStatusChip,
  ROUND_KIND_LABEL,
  RoundKindChip,
  RoundOutcomeChip,
} from './StatusChip.js';
import { HiringProcessStepper } from './HiringProcessStepper.js';

interface ApplicationTableRowProps {
  application: ApplicationView;
  index?: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdateApplication: (id: string, input: UpdateApplicationInput) => void;
  onMarkApplied: (id: string) => void;
  onRemoveApplication: (id: string) => void;
  onCreateRound: (applicationId: string, input: CreateRoundInput) => Promise<void>;
  onUpdateRound: (applicationId: string, id: string, input: UpdateRoundInput) => void;
  onRemoveRound: (applicationId: string, id: string) => void;
  isBusy: boolean;
}

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function formatShortDate(value: string | null): string {
  if (!value) return '—';
  return value.slice(0, 10);
}

function formatShortInstant(value: string | null): string {
  if (!value) return '—';
  try {
    const d = new Date(value);
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return value;
  }
}

function suggestRoundKind(name: string): RoundKind {
  if (name.includes('简历') || name.includes('初筛') || name.includes('网申')) return 'screening';
  if (name.includes('笔试')) return 'written';
  if (name.includes('测评')) return 'assessment';
  if (/hr/i.test(name)) return 'hr';
  if (name.includes('面')) return 'technical';
  return 'other';
}

function getLatestRound(rounds: RoundView[]): RoundView | null {
  if (rounds.length === 0) return null;
  return [...rounds].sort((a, b) => b.sequence - a.sequence)[0] ?? null;
}

/**
 * 轮次项组件
 */
function InlineRoundItem({
  round,
  onUpdate,
  onRemove,
  disabled,
}: {
  round: RoundView;
  onUpdate: (input: UpdateRoundInput) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const [notes, setNotes] = useState(round.notes ?? '');
  const [isEditingNotes, setIsEditingNotes] = useState(false);

  useEffect(() => {
    setNotes(round.notes ?? '');
  }, [round.notes]);

  return (
    <div className="rounded-lg border border-line bg-surface p-3.5 shadow-2xs transition-all hover:border-line/90">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex size-5 items-center justify-center rounded-full bg-ink text-[10px] font-bold text-white">
            {round.sequence}
          </span>
          <span className="text-[13px] font-bold text-ink">{round.name}</span>
          <RoundKindChip kind={round.kind} />
          <RoundOutcomeChip outcome={round.outcome} />

          {round.scheduledAt ? (
            <span className="flex items-center gap-1 text-[12px] font-medium text-accent">
              <IconClock size={12} />
              <span>{formatShortInstant(round.scheduledAt)}</span>
            </span>
          ) : (
            <span className="text-[11px] text-muted">时间待定</span>
          )}

          {round.format && <span className="text-[11px] text-secondary">· {round.format}</span>}
          {round.durationMin && (
            <span className="text-[11px] text-secondary">· {round.durationMin}分钟</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-1 sm:pt-0">
          {round.outcome !== 'passed' && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onUpdate({ outcome: 'passed' })}
              className="rounded bg-good-soft px-2 py-0.5 text-[11px] font-bold text-good hover:bg-good/20 transition-colors"
            >
              通过
            </button>
          )}
          {round.outcome !== 'failed' && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onUpdate({ outcome: 'failed' })}
              className="rounded bg-critical-soft px-2 py-0.5 text-[11px] font-bold text-critical hover:bg-critical/20 transition-colors"
            >
              未通过
            </button>
          )}
          {round.outcome !== 'pending' && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onUpdate({ outcome: 'pending' })}
              className="rounded bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-secondary hover:text-ink transition-colors"
            >
              重置
            </button>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (window.confirm(`确认删除轮次“${round.name}”？`)) onRemove();
            }}
            className="rounded p-1 text-muted hover:bg-critical-soft hover:text-critical transition-colors"
            title="删除轮次"
          >
            <IconTrash size={13} />
          </button>
        </div>
      </div>

      {/* 轮次笔记/复盘展开 */}
      <div className="mt-2.5 border-t border-line/60 pt-2 text-[12px]">
        {isEditingNotes ? (
          <div className="space-y-2 animate-item-enter">
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="记录被问到的八股、项目深挖、手撕题或复盘心得..."
              className={`${controlClass} w-full text-[12px]`}
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="primary"
                disabled={disabled}
                onClick={() => {
                  onUpdate({ notes: nullableText(notes) });
                  setIsEditingNotes(false);
                }}
                className="py-0.5 text-[11px]"
              >
                保存备注
              </Button>
              <button
                type="button"
                onClick={() => setIsEditingNotes(false)}
                className="text-[11px] text-muted hover:text-ink"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => setIsEditingNotes(true)}
            className="cursor-pointer text-secondary hover:text-ink"
          >
            {round.notes ? (
              <p className="whitespace-pre-wrap rounded bg-surface-2/60 p-2.5 text-[12px] leading-relaxed text-ink border border-line/40">
                {round.notes}
              </p>
            ) : (
              <span className="text-[11px] italic text-muted hover:text-accent transition-colors">
                + 点击添加此轮考察内容或面试复盘备忘
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 原地添加轮次表单
 */
function InlineAddRoundForm({
  onCreate,
  disabled,
}: {
  onCreate: (input: CreateRoundInput) => Promise<void>;
  disabled: boolean;
}) {
  const { toUtcIso } = useTimezone();
  const [isExpanded, setIsExpanded] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<RoundKind>('other');
  const [kindChosen, setKindChosen] = useState(false);
  const [scheduledLocal, setScheduledLocal] = useState('');
  const [format, setFormat] = useState('');
  const [duration, setDuration] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await onCreate({
        name: name.trim(),
        kind,
        scheduledAt: scheduledLocal === '' ? null : toUtcIso(scheduledLocal),
        format: nullableText(format),
        durationMin: duration === '' ? null : Number(duration),
      });
      setName('');
      setKind('other');
      setKindChosen(false);
      setScheduledLocal('');
      setFormat('');
      setDuration('');
      setIsExpanded(false);
    } catch {
      // error handled by parent query
    }
  }

  function handleNameChange(val: string) {
    setName(val);
    if (!kindChosen) setKind(suggestRoundKind(val));
  }

  return (
    <div>
      {!isExpanded ? (
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-line bg-surface-2/50 py-2.5 text-[12px] font-semibold text-secondary hover:border-accent hover:bg-accent/5 hover:text-accent transition-all"
        >
          <IconPlus size={14} />
          <span>安排新一轮面试 / 笔试</span>
        </button>
      ) : (
        <form
          onSubmit={submit}
          className="rounded-lg border border-accent/40 bg-accent/5 p-4 space-y-3 animate-item-enter"
        >
          <div className="flex items-center justify-between">
            <h5 className="text-[13px] font-bold text-ink">安排新轮次</h5>
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="text-muted hover:text-ink"
            >
              <IconX size={14} />
            </button>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label="轮次名称">
              <input
                required
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="例如：技术二面 / 主管面"
                className={controlClass}
              />
            </Field>
            <Field label="轮次类型">
              <select
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as RoundKind);
                  setKindChosen(true);
                }}
                className={controlClass}
              >
                {ROUND_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ROUND_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-3">
            <Field label="面试时间 (时分一体)" className="sm:col-span-2">
              <DatePicker
                value={scheduledLocal}
                onChange={setScheduledLocal}
                placeholder="年 / 月 / 日  时 : 分"
                showTime={true}
                className="w-full"
              />
            </Field>
            <Field label="形式">
              <input
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                placeholder="视频 / 现场 / 电话"
                className={controlClass}
              />
            </Field>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1 border-t border-line/40">
            <Button type="button" onClick={() => setIsExpanded(false)} className="py-1 text-[11px]">
              取消
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={disabled}
              className="py-1 text-[11px]"
            >
              保存轮次
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

/**
 * 完整投递档案全量展示卡片 (在非编辑态下清晰展示所有属性)
 */
function FullProfileViewCard({
  application,
  onStartEdit,
}: {
  application: ApplicationView;
  onStartEdit: () => void;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4 space-y-4 shadow-xs">
      <div className="flex items-center justify-between border-b border-line pb-2.5">
        <h4 className="text-[13px] font-bold text-ink">投递全量档案与信息</h4>
        <button
          type="button"
          onClick={onStartEdit}
          className="flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline transition-colors"
        >
          <IconEdit size={13} />
          <span>编辑档案</span>
        </button>
      </div>

      {/* 结构化元数据网格展示 */}
      <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2 text-[12px]">
        <div>
          <dt className="text-muted font-medium">目标企业</dt>
          <dd className="mt-0.5 font-bold text-ink text-[13px]">{application.company}</dd>
        </div>

        <div>
          <dt className="text-muted font-medium">申请岗位</dt>
          <dd className="mt-0.5 font-semibold text-ink text-[13px]">{application.position}</dd>
        </div>

        <div>
          <dt className="text-muted font-medium">优先级</dt>
          <dd className="mt-0.5 flex items-center gap-1.5">
            <PriorityBadge priority={application.priority} size="sm" />
            <span className="font-medium text-ink">{application.priority} 级重点</span>
          </dd>
        </div>

        <div>
          <dt className="text-muted font-medium">当前派生状态</dt>
          <dd className="mt-0.5">
            <ApplicationStatusChip status={application.status} />
          </dd>
        </div>

        <div>
          <dt className="text-muted font-medium">目标城市</dt>
          <dd className="mt-0.5 font-medium text-ink">{application.city || '未填写'}</dd>
        </div>

        <div>
          <dt className="text-muted font-medium">公司类型与行业</dt>
          <dd className="mt-0.5 font-medium text-ink">
            {application.companyType || application.industry
              ? `${application.companyType || ''} ${application.industry ? `· ${application.industry}` : ''}`
              : '未填写'}
          </dd>
        </div>

        <div>
          <dt className="text-muted font-medium">投递渠道</dt>
          <dd className="mt-0.5 font-medium text-ink">{application.channel || '未填写'}</dd>
        </div>

        <div>
          <dt className="text-muted font-medium">内推人 / 内推码</dt>
          <dd className="mt-0.5 font-medium text-ink">
            {application.referral ? (
              <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-bold text-ink">
                {application.referral}
              </span>
            ) : (
              '无'
            )}
          </dd>
        </div>

        <div>
          <dt className="text-muted font-medium">网申截止时间</dt>
          <dd className="mt-0.5 font-medium text-ink">
            {application.applyDeadlineDate ? (
              <span className="flex items-center gap-1 text-ink">
                <IconCalendar size={12} className="text-muted" />
                <span>{application.applyDeadlineDate}</span>
              </span>
            ) : (
              '未设置截止日'
            )}
          </dd>
        </div>

        <div>
          <dt className="text-muted font-medium">投递确认时间</dt>
          <dd className="mt-0.5 font-medium text-ink">
            {application.appliedAt ? formatShortInstant(application.appliedAt) : '尚未标记投递'}
          </dd>
        </div>

        <div>
          <dt className="text-muted font-medium">薪资待遇 / 预期</dt>
          <dd className="mt-0.5 font-medium text-ink">{application.salary || '待录入'}</dd>
        </div>

        <div>
          <dt className="text-muted font-medium">岗位 JD 链接</dt>
          <dd className="mt-0.5">
            {application.link ? (
              <a
                href={application.link}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-accent hover:underline inline-flex items-center gap-1"
              >
                <span>访问招聘网页 ↗</span>
              </a>
            ) : (
              <span className="text-muted">未填写</span>
            )}
          </dd>
        </div>
      </dl>

      {/* 投递备忘与复盘笔记全文 */}
      <div className="border-t border-line pt-3">
        <div className="flex items-center justify-between mb-1.5">
          <dt className="text-[12px] font-bold text-ink">投递备忘与注意事项</dt>
        </div>
        {application.notes ? (
          <p className="whitespace-pre-wrap rounded-md bg-surface-2/60 p-3 text-[12px] leading-relaxed text-ink border border-line/50">
            {application.notes}
          </p>
        ) : (
          <p className="text-[12px] text-muted italic">
            暂无投递备忘，点击上方「编辑档案」可添加。
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * 原地档案编辑表单
 */
function InlineProfileEditForm({
  application,
  onSave,
  onCancel,
  disabled,
}: {
  application: ApplicationView;
  onSave: (input: UpdateApplicationInput) => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const [form, setForm] = useState({
    company: application.company,
    position: application.position,
    companyType: application.companyType ?? '',
    industry: application.industry ?? '',
    city: application.city ?? '',
    channel: application.channel ?? '',
    referral: application.referral ?? '',
    priority: application.priority,
    applyDeadlineDate: application.applyDeadlineDate ?? '',
    salary: application.salary ?? '',
    link: application.link ?? '',
    notes: application.notes ?? '',
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.company.trim() || !form.position.trim()) return;
    onSave({
      company: form.company.trim(),
      position: form.position.trim(),
      companyType: nullableText(form.companyType),
      industry: nullableText(form.industry),
      city: nullableText(form.city),
      channel: nullableText(form.channel),
      referral: nullableText(form.referral),
      priority: form.priority,
      applyDeadlineDate: form.applyDeadlineDate === '' ? null : form.applyDeadlineDate,
      salary: nullableText(form.salary),
      link: nullableText(form.link),
      notes: nullableText(form.notes),
    });
  }

  const set = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-lg border border-accent/40 bg-surface p-4 shadow-xs animate-item-enter"
    >
      <div className="flex items-center justify-between border-b border-line pb-2">
        <h4 className="text-[13px] font-bold text-ink">编辑投递档案</h4>
        <button type="button" onClick={onCancel} className="text-[12px] text-muted hover:text-ink">
          取消编辑
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="目标公司 *">
          <input
            required
            value={form.company}
            onChange={(e) => set('company', e.target.value)}
            className={controlClass}
          />
        </Field>
        <Field label="申请岗位 *">
          <input
            required
            value={form.position}
            onChange={(e) => set('position', e.target.value)}
            className={controlClass}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="优先级">
          <select
            value={form.priority}
            onChange={(e) => set('priority', e.target.value as ApplicationPriority)}
            className={controlClass}
          >
            {APPLICATION_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p} 级
              </option>
            ))}
          </select>
        </Field>
        <Field label="城市">
          <input
            value={form.city}
            onChange={(e) => set('city', e.target.value)}
            placeholder="例如：深圳"
            className={controlClass}
          />
        </Field>
        <Field label="公司类型">
          <input
            value={form.companyType}
            onChange={(e) => set('companyType', e.target.value)}
            placeholder="例如：国企 / 大厂"
            className={controlClass}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="网申截止日">
          <DatePicker
            value={form.applyDeadlineDate}
            onChange={(val) => set('applyDeadlineDate', val)}
            placeholder="年 / 月 / 日  时 : 分"
            showTime={true}
            className="w-full"
          />
        </Field>
        <Field label="薪资待遇 / 预期">
          <input
            value={form.salary}
            onChange={(e) => set('salary', e.target.value)}
            placeholder="例如：25k·15薪"
            className={controlClass}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="投递渠道">
          <input
            value={form.channel}
            onChange={(e) => set('channel', e.target.value)}
            placeholder="例如：牛客 / 官网"
            className={controlClass}
          />
        </Field>
        <Field label="内推码 / 内推人">
          <input
            value={form.referral}
            onChange={(e) => set('referral', e.target.value)}
            placeholder="例如：NTAXXXX"
            className={controlClass}
          />
        </Field>
      </div>

      <Field label="岗位链接 / JD">
        <input
          type="url"
          value={form.link}
          onChange={(e) => set('link', e.target.value)}
          placeholder="https://..."
          className={controlClass}
        />
      </Field>

      <Field label="投递备忘 / 注意事项">
        <textarea
          rows={3}
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="记录面试进度群、HR联系方式、投递注意事项..."
          className={controlClass}
        />
      </Field>

      <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-line">
        <Button type="button" onClick={onCancel} className="text-[12px]">
          取消
        </Button>
        <Button type="submit" variant="primary" disabled={disabled} className="text-[12px]">
          保存档案修改
        </Button>
      </div>
    </form>
  );
}

/**
 * 每一行投递记录（含折叠态表格行 + 原地平滑展开的详情与编辑面板）
 */
export function ApplicationTableRow({
  application,
  index = 0,
  isExpanded,
  onToggleExpand,
  onUpdateApplication,
  onMarkApplied,
  onRemoveApplication,
  onCreateRound,
  onUpdateRound,
  onRemoveRound,
  isBusy,
}: ApplicationTableRowProps) {
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const latestRound = getLatestRound(application.rounds);
  const sortedRounds = [...application.rounds].sort((a, b) => a.sequence - b.sequence);

  function handleEditClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!isExpanded) {
      onToggleExpand();
    }
    setIsEditingProfile(true);
  }

  return (
    <div
      style={{ animationDelay: `${Math.min(index * 60, 600)}ms` }}
      className={`border-b border-line last:border-b-0 transition-colors animate-slide-left-in ${
        isExpanded ? 'bg-surface-2/30' : 'hover:bg-surface-2/40'
      }`}
    >
      {/* 摘要表单行（始终可见，点击任意区域平滑展开） */}
      <div
        onClick={onToggleExpand}
        className="flex cursor-pointer flex-col gap-2.5 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between text-[13px] select-none"
      >
        {/* 左侧：展开折叠指示图标 + 优先级 + 公司岗位 */}
        <div className="flex items-center gap-3 min-w-[260px] flex-1">
          <span
            className={`text-muted transition-transform duration-300 ease-out ${
              isExpanded ? 'rotate-90 text-accent' : 'rotate-0'
            }`}
          >
            <IconChevronRight size={16} />
          </span>

          <PriorityBadge priority={application.priority} />

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-ink hover:text-accent transition-colors">
                {application.company}
              </span>
              <ApplicationStatusChip status={application.status} />
            </div>
            <span className="text-[12px] text-secondary truncate">{application.position}</span>
          </div>
        </div>

        {/* 中间信息：城市、最新轮次进度、网申截止日 */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-secondary sm:justify-end">
          {/* 城市 / 渠道 */}
          <div className="min-w-[70px]">
            <span>{application.city || '—'}</span>
            {application.channel && (
              <span className="text-[11px] text-muted ml-1">({application.channel})</span>
            )}
          </div>

          {/* 最新轮次与时间 */}
          <div className="min-w-[140px]">
            {latestRound ? (
              <div className="flex items-center gap-1.5 font-medium text-ink">
                <span>{latestRound.name}</span>
                <span className="text-[11px] text-muted">
                  (
                  {latestRound.outcome === 'passed'
                    ? '通过'
                    : latestRound.outcome === 'failed'
                      ? '未过'
                      : '待定'}
                  )
                </span>
                {latestRound.scheduledAt && (
                  <span className="flex items-center gap-0.5 text-accent text-[11px]">
                    <IconClock size={11} />
                    <span>{formatShortInstant(latestRound.scheduledAt)}</span>
                  </span>
                )}
              </div>
            ) : (
              <span className="text-muted">未安排轮次</span>
            )}
          </div>

          {/* 网申截止 / 投递 */}
          <div className="min-w-[120px] text-right">
            {application.applyDeadlineDate ? (
              <span className="flex items-center justify-end gap-1 text-ink font-medium">
                <IconCalendar size={12} className="text-muted" />
                <span>截止 {application.applyDeadlineDate}</span>
              </span>
            ) : (
              <span className="text-muted">
                {application.appliedAt
                  ? `已投 ${formatShortDate(application.appliedAt)}`
                  : '无截止日'}
              </span>
            )}
          </div>
        </div>

        {/* 右侧快捷动作 */}
        <div
          className="flex items-center justify-end gap-2 pt-1 sm:pt-0"
          onClick={(e) => e.stopPropagation()}
        >
          {application.appliedAt === null && (
            <Button
              type="button"
              variant="primary"
              disabled={isBusy}
              onClick={() => onMarkApplied(application.id)}
              className="px-2 py-0.5 text-[11px]"
            >
              标已投
            </Button>
          )}

          <button
            type="button"
            onClick={handleEditClick}
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-secondary hover:bg-surface-3 hover:text-ink transition-colors"
            title="编辑此投递"
          >
            <IconEdit size={12} />
            <span>编辑</span>
          </button>
        </div>
      </div>

      {/* 原地向下平滑展开的详情面板 */}
      <div className={`accordion-wrapper ${isExpanded ? 'is-expanded' : ''}`}>
        <div className="accordion-inner">
          <div className="border-t border-line/70 bg-surface/90 px-5 py-4 space-y-4">
            {/* 顶栏：终局结果选择器与快捷操作 */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-2/60 px-4 py-2.5 text-[12px]">
              <div className="flex items-center gap-2">
                <span className="text-muted font-medium">求职进度:</span>
                <span className="font-bold text-ink">
                  {application.company} · {application.position}
                </span>
                <ApplicationStatusChip status={application.status} />
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <label className="text-muted font-medium">终局状态:</label>
                <select
                  value={application.outcome ?? ''}
                  disabled={isBusy}
                  onChange={(e) =>
                    onUpdateApplication(application.id, {
                      outcome: (e.target.value === ''
                        ? null
                        : e.target.value) as ApplicationOutcome,
                    })
                  }
                  className={`${controlClass} py-0.5 text-[12px]`}
                >
                  <option value="">流程中 / 未定</option>
                  <option value="oc">OC (口头Offer)</option>
                  <option value="offer">Offer (正式录用)</option>
                  <option value="rejected">已挂 / 未通过</option>
                  <option value="declined">已拒绝</option>
                </select>

                <button
                  type="button"
                  onClick={() => setIsEditingProfile((prev) => !prev)}
                  className="rounded border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-secondary hover:text-ink transition-colors"
                >
                  {isEditingProfile ? '查看全部信息' : '修改档案'}
                </button>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => {
                    if (
                      window.confirm(`彻底删除「${application.company}」的投递记录及全部轮次？`)
                    ) {
                      onRemoveApplication(application.id);
                    }
                  }}
                  className="rounded p-1 text-muted hover:bg-critical-soft hover:text-critical transition-colors"
                  title="删除整条记录"
                >
                  <IconTrash size={14} />
                </button>
              </div>
            </div>

            {/* ⭐ 全流程推进步进跟踪器 (Visual Workflow Stepper) */}
            <HiringProcessStepper
              application={application}
              onMarkApplied={onMarkApplied}
              isBusy={isBusy}
            />

            {/* 主内容区域：非编辑态展示全量信息卡片 + 轮次流转轴；编辑态展示表单 */}
            <div className="grid gap-4 lg:grid-cols-12">
              {/* 档案信息区域 (占 5 列) */}
              <div className="lg:col-span-5">
                {isEditingProfile ? (
                  <InlineProfileEditForm
                    application={application}
                    disabled={isBusy}
                    onSave={(input) => {
                      onUpdateApplication(application.id, input);
                      setIsEditingProfile(false);
                    }}
                    onCancel={() => setIsEditingProfile(false)}
                  />
                ) : (
                  <FullProfileViewCard
                    application={application}
                    onStartEdit={() => setIsEditingProfile(true)}
                  />
                )}
              </div>

              {/* 轮次流转与面试时间轴 (占 7 列) */}
              <div className="space-y-3.5 lg:col-span-7">
                <div className="flex items-center justify-between">
                  <h4 className="text-[13px] font-bold text-ink">
                    招聘流转与面试轮次 ({sortedRounds.length})
                  </h4>
                </div>

                {sortedRounds.length === 0 ? (
                  <div className="rounded-lg border border-line bg-surface-2/40 p-6 text-center text-[12px] text-muted">
                    暂无轮次安排，点击下方添加第一轮（如笔试/一面）。
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {sortedRounds.map((round) => (
                      <InlineRoundItem
                        key={round.id}
                        round={round}
                        disabled={isBusy}
                        onUpdate={(input) => onUpdateRound(application.id, round.id, input)}
                        onRemove={() => onRemoveRound(application.id, round.id)}
                      />
                    ))}
                  </div>
                )}

                {/* 添加新轮次 */}
                <InlineAddRoundForm
                  disabled={isBusy}
                  onCreate={(input) => onCreateRound(application.id, input)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
