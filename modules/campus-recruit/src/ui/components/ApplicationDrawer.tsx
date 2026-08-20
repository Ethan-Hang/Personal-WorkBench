import { useEffect, useState, type FormEvent } from 'react';
import {
  Button,
  DatePicker,
  Field,
  IconCalendar,
  IconClock,
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

interface ApplicationDrawerProps {
  application: ApplicationView | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateApplication: (id: string, input: UpdateApplicationInput) => void;
  onMarkApplied: (id: string) => void;
  onRemoveApplication: (id: string) => void;
  onCreateRound: (applicationId: string, input: CreateRoundInput) => Promise<void>;
  onUpdateRound: (applicationId: string, id: string, input: UpdateRoundInput) => void;
  onRemoveRound: (applicationId: string, id: string) => void;
  isBusy: boolean;
  error: Error | null;
}

type TabKey = 'rounds' | 'profile';

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function formatInstant(value: string): string {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
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

/**
 * 轮次列表项
 */
function RoundItem({
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
    <div className="rounded-lg border border-line bg-surface p-3.5 shadow-2xs">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-full bg-ink text-[10px] font-bold text-white">
              {round.sequence}
            </span>
            <span className="text-[14px] font-bold text-ink">{round.name}</span>
            <RoundKindChip kind={round.kind} />
            <RoundOutcomeChip outcome={round.outcome} />
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[12px] text-secondary">
            {round.scheduledAt ? (
              <span className="flex items-center gap-1 font-medium text-accent">
                <IconClock size={13} />
                <span>{formatInstant(round.scheduledAt)}</span>
              </span>
            ) : (
              <span className="text-muted">时间待定</span>
            )}
            {round.format && <span>形式: {round.format}</span>}
            {round.durationMin && <span>时长: {round.durationMin}分钟</span>}
          </div>
        </div>

        {/* 结果切换按钮 */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 sm:pt-0">
          {round.outcome !== 'passed' && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onUpdate({ outcome: 'passed' })}
              className="rounded bg-good-soft px-2 py-1 text-[11px] font-bold text-good hover:bg-good/20"
            >
              通过
            </button>
          )}
          {round.outcome !== 'failed' && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onUpdate({ outcome: 'failed' })}
              className="rounded bg-critical-soft px-2 py-1 text-[11px] font-bold text-critical hover:bg-critical/20"
            >
              未通过
            </button>
          )}
          {round.outcome !== 'pending' && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onUpdate({ outcome: 'pending' })}
              className="rounded bg-surface-2 px-2 py-1 text-[11px] font-medium text-secondary hover:text-ink"
            >
              重置待定
            </button>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (window.confirm(`确认删除轮次“${round.name}”？`)) onRemove();
            }}
            className="rounded p-1 text-muted hover:bg-critical-soft hover:text-critical"
            title="删除此轮次"
          >
            <IconTrash size={13} />
          </button>
        </div>
      </div>

      {/* 轮次备忘录 */}
      <div className="mt-2.5 border-t border-line/60 pt-2 text-[12px]">
        {isEditingNotes ? (
          <div className="space-y-2">
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="记录面试考察要点、手撕算法、核心问答等..."
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
              <p className="whitespace-pre-wrap rounded bg-surface-2/60 p-2 text-[12px] leading-relaxed text-ink">
                {round.notes}
              </p>
            ) : (
              <span className="italic text-muted">+ 点击添加此轮考察内容或面试复盘要点</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 添加轮次表单
 */
function AddRoundSection({
  onCreate,
  disabled,
}: {
  onCreate: (input: CreateRoundInput) => Promise<void>;
  disabled: boolean;
}) {
  const { toUtcIso } = useTimezone();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<RoundKind>('other');
  const [kindChosen, setKindChosen] = useState(false);
  const [scheduledLocal, setScheduledLocal] = useState('');
  const [format, setFormat] = useState('');
  const [duration, setDuration] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim() === '') return;
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
      // error handled by parent mutation
    }
  }

  function onNameChange(next: string) {
    setName(next);
    if (!kindChosen) {
      setKind(suggestRoundKind(next));
    }
  }

  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line bg-surface-2/40 py-2.5 text-[13px] font-semibold text-secondary hover:border-accent hover:bg-accent/5 hover:text-accent"
      >
        <IconPlus size={15} />
        <span>添加下一轮面试或笔试安排</span>
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-accent/40 bg-accent/5 p-3.5 shadow-sm space-y-3"
    >
      <div className="flex items-center justify-between">
        <h4 className="text-[13px] font-bold text-ink">安排新轮次</h4>
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
            onChange={(e) => onNameChange(e.target.value)}
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

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" onClick={() => setIsExpanded(false)} className="py-1 text-[12px]">
          取消
        </Button>
        <Button type="submit" variant="primary" disabled={disabled} className="py-1 text-[12px]">
          保存轮次
        </Button>
      </div>
    </form>
  );
}

/**
 * 完整档案详情表单
 */
function ProfileForm({
  application,
  onSave,
  disabled,
}: {
  application: ApplicationView;
  onSave: (input: UpdateApplicationInput) => void;
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

  useEffect(() => {
    setForm({
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
  }, [application]);

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
    <form onSubmit={submit} className="space-y-3.5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="公司名称">
          <input
            required
            value={form.company}
            onChange={(e) => set('company', e.target.value)}
            className={controlClass}
          />
        </Field>
        <Field label="申请岗位">
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
            placeholder="例如：深圳 / 上海"
            className={controlClass}
          />
        </Field>
        <Field label="公司类型">
          <input
            value={form.companyType}
            onChange={(e) => set('companyType', e.target.value)}
            placeholder="例如：外企 / 国企 / 独角兽"
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
        <Field label="薪资 / 预期待遇">
          <input
            value={form.salary}
            onChange={(e) => set('salary', e.target.value)}
            placeholder="例如：25k·16薪 + 签字费"
            className={controlClass}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="投递渠道">
          <input
            value={form.channel}
            onChange={(e) => set('channel', e.target.value)}
            placeholder="例如：牛客 / 官网 / Boss"
            className={controlClass}
          />
        </Field>
        <Field label="内推码 / 内推人">
          <input
            value={form.referral}
            onChange={(e) => set('referral', e.target.value)}
            placeholder="例如：NTAXXXXX"
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

      <Field label="投递备忘 / 关键信息">
        <textarea
          rows={3}
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="记录投递账号、招聘进度交流群、意向度评级等..."
          className={controlClass}
        />
      </Field>

      <div className="pt-2">
        <Button type="submit" variant="primary" disabled={disabled}>
          保存档案修改
        </Button>
      </div>
    </form>
  );
}

export function ApplicationDrawer({
  application,
  isOpen,
  onClose,
  onUpdateApplication,
  onMarkApplied,
  onRemoveApplication,
  onCreateRound,
  onUpdateRound,
  onRemoveRound,
  isBusy,
  error,
}: ApplicationDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('rounds');

  // ESC 键关闭
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !application) return null;

  const sortedRounds = [...application.rounds].sort((a, b) => a.sequence - b.sequence);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* 遮罩层 */}
      <div
        className="fixed inset-0 bg-ink/30 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 滑出抽屉主体 */}
      <div className="relative z-10 flex h-full w-full max-w-2xl flex-col border-l border-line bg-surface shadow-2xl transition-transform">
        {/* 抽屉顶栏 */}
        <div className="border-b border-line bg-surface px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <PriorityBadge priority={application.priority} />
                <h2 className="text-xl font-bold text-ink">{application.company}</h2>
                <ApplicationStatusChip status={application.status} />
              </div>
              <p className="text-[13px] text-secondary">{application.position}</p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink"
              aria-label="关闭抽屉"
            >
              <IconX size={18} />
            </button>
          </div>

          {/* 快捷动作栏 */}
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-2 p-2.5 text-[12px]">
            <div className="flex items-center gap-2">
              {application.appliedAt === null ? (
                <Button
                  type="button"
                  variant="primary"
                  disabled={isBusy}
                  onClick={() => onMarkApplied(application.id)}
                  className="py-1 text-[12px]"
                >
                  标记已投递
                </Button>
              ) : (
                <span className="flex items-center gap-1 text-muted">
                  <IconCalendar size={13} />
                  <span>已于 {application.appliedAt.slice(0, 10)} 投递</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <label className="text-muted">终局结果:</label>
              <select
                value={application.outcome ?? ''}
                disabled={isBusy}
                onChange={(e) =>
                  onUpdateApplication(application.id, {
                    outcome: (e.target.value === '' ? null : e.target.value) as ApplicationOutcome,
                  })
                }
                className={`${controlClass} py-0.5 text-[12px]`}
              >
                <option value="">流程中 / 未定</option>
                <option value="oc">OC (口头Offer)</option>
                <option value="offer">Offer 🎉</option>
                <option value="rejected">已挂 / 未通过</option>
                <option value="declined">已拒绝</option>
              </select>

              <button
                type="button"
                disabled={isBusy}
                onClick={() => {
                  if (window.confirm(`彻底删除「${application.company}」的投递记录及全部轮次？`)) {
                    onRemoveApplication(application.id);
                    onClose();
                  }
                }}
                className="rounded p-1 text-muted hover:bg-critical-soft hover:text-critical"
                title="删除整条记录"
              >
                <IconTrash size={14} />
              </button>
            </div>
          </div>

          {/* 错误提示 */}
          {error && (
            <p role="alert" className="mt-2 text-[12px] text-critical">
              操作失败：{error.message}
            </p>
          )}

          {/* Tab 导航 */}
          <div className="mt-4 flex gap-4 border-b border-line text-[13px] font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('rounds')}
              className={`pb-2 transition-colors ${
                activeTab === 'rounds'
                  ? 'border-b-2 border-accent text-accent'
                  : 'text-muted hover:text-ink'
              }`}
            >
              招聘流转与轮次 ({sortedRounds.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`pb-2 transition-colors ${
                activeTab === 'profile'
                  ? 'border-b-2 border-accent text-accent'
                  : 'text-muted hover:text-ink'
              }`}
            >
              投递详情与档案
            </button>
          </div>
        </div>

        {/* 抽屉可滚动内容区 */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'rounds' ? (
            <div className="space-y-4">
              {/* 轮次列表 */}
              {sortedRounds.length === 0 ? (
                <div className="rounded-lg border border-line bg-surface-2/40 p-6 text-center text-[13px] text-muted">
                  暂未录入任何面试或笔试安排，点击下方添加第一轮。
                </div>
              ) : (
                <div className="space-y-3">
                  {sortedRounds.map((round) => (
                    <RoundItem
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
              <AddRoundSection
                disabled={isBusy}
                onCreate={(input) => onCreateRound(application.id, input)}
              />
            </div>
          ) : (
            <ProfileForm
              application={application}
              disabled={isBusy}
              onSave={(input) => onUpdateApplication(application.id, input)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
