import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Chip,
  DatePicker,
  EmptyState,
  Field,
  IconBriefcase,
  PageHeader,
  Panel,
  controlClass,
} from '@workbench/ui';
import {
  APPLICATION_PRIORITIES,
  ROUND_KINDS,
  type ApplicationOutcome,
  type ApplicationPriority,
  type ApplicationStatusCode,
  type ApplicationView,
  type CreateApplicationInput,
  type CreateRoundInput,
  type RoundKind,
  type RoundOutcome,
  type RoundView,
  type UpdateApplicationInput,
  type UpdateRoundInput,
} from '../contract.js';
import {
  deleteApplication,
  deleteRound,
  fetchApplications,
  patchApplication,
  patchRound,
  postApplication,
  postApply,
  postRound,
} from './api.js';

const APPLICATIONS_KEY = ['campus', 'applications'] as const;
const STATS_KEY = ['campus', 'stats'] as const;

const PRIORITY_TONE: Record<ApplicationPriority, 'neutral' | 'warning' | 'critical'> = {
  S: 'critical',
  A: 'warning',
  B: 'neutral',
  C: 'neutral',
};

const PRIORITY_RAIL: Record<ApplicationPriority, string> = {
  S: 'border-critical',
  A: 'border-warning',
  B: 'border-accent',
  C: 'border-line',
};

const STATUS_TONE: Record<ApplicationStatusCode, 'neutral' | 'good' | 'warning' | 'critical'> = {
  offer: 'good',
  oc: 'good',
  declined: 'neutral',
  failed: 'critical',
  pending: 'warning',
  shelved: 'neutral',
  applied: 'neutral',
  in_progress: 'warning',
};

const ROUND_KIND_LABEL: Record<RoundKind, string> = {
  assessment: '测评',
  written: '笔试',
  technical: '专业面',
  hr: 'HR',
  other: '其他',
};

const ROUND_OUTCOME_LABEL: Record<RoundOutcome, string> = {
  pending: '待定',
  passed: '通过',
  failed: '未通过',
};

const ROUND_OUTCOME_TONE: Record<RoundOutcome, 'neutral' | 'good' | 'critical'> = {
  pending: 'neutral',
  passed: 'good',
  failed: 'critical',
};

type CreateApplicationForm = {
  company: string;
  position: string;
  priority: ApplicationPriority;
  applyDeadlineDate: string;
};

const INITIAL_APPLICATION_FORM: CreateApplicationForm = {
  company: '',
  position: '',
  priority: 'B',
  applyDeadlineDate: '',
};

type EditApplicationForm = {
  company: string;
  position: string;
  companyType: string;
  industry: string;
  city: string;
  channel: string;
  referral: string;
  priority: ApplicationPriority;
  applyDeadlineDate: string;
  salary: string;
  link: string;
  notes: string;
};

type ApplicationActions = {
  updateApplication: (id: string, input: UpdateApplicationInput) => void;
  markApplied: (id: string) => void;
  removeApplication: (id: string) => void;
  createRound: (applicationId: string, input: CreateRoundInput) => Promise<void>;
  updateRound: (applicationId: string, id: string, input: UpdateRoundInput) => void;
  removeRound: (applicationId: string, id: string) => void;
  isBusy: boolean;
};

type ActionError =
  { scope: 'create'; error: Error } | { scope: 'application'; applicationId: string; error: Error };

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function formatInstant(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function suggestRoundKind(name: string): RoundKind {
  if (name.includes('笔试')) return 'written';
  if (name.includes('测评')) return 'assessment';
  if (/hr/i.test(name)) return 'hr';
  if (name.includes('面')) return 'technical';
  return 'other';
}

function applicationForm(application: ApplicationView): EditApplicationForm {
  return {
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
  };
}

function MutationError({ error, action }: { error: Error | null; action: string }) {
  if (error === null) return null;
  return (
    <p
      role="alert"
      className="rounded-control bg-critical-soft px-3 py-2 text-[13px] text-critical"
    >
      {action}失败：{error.message}，请检查后重试。
    </p>
  );
}

function ApplicationEditForm({
  application,
  onSave,
  disabled,
}: {
  application: ApplicationView;
  onSave: (input: UpdateApplicationInput) => void;
  disabled: boolean;
}) {
  const [form, setForm] = useState<EditApplicationForm>(() => applicationForm(application));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (form.company.trim() === '' || form.position.trim() === '') return;
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

  const set = <K extends keyof EditApplicationForm>(key: K, value: EditApplicationForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
      <Field label="公司">
        <input
          required
          value={form.company}
          onChange={(event) => set('company', event.target.value)}
          className={controlClass}
        />
      </Field>
      <Field label="岗位">
        <input
          required
          value={form.position}
          onChange={(event) => set('position', event.target.value)}
          className={controlClass}
        />
      </Field>
      <Field label="公司类型">
        <input
          value={form.companyType}
          onChange={(event) => set('companyType', event.target.value)}
          className={controlClass}
        />
      </Field>
      <Field label="行业">
        <input
          value={form.industry}
          onChange={(event) => set('industry', event.target.value)}
          className={controlClass}
        />
      </Field>
      <Field label="城市">
        <input
          value={form.city}
          onChange={(event) => set('city', event.target.value)}
          className={controlClass}
        />
      </Field>
      <Field label="投递渠道">
        <input
          value={form.channel}
          onChange={(event) => set('channel', event.target.value)}
          className={controlClass}
        />
      </Field>
      <Field label="内推人 / 内推码">
        <input
          value={form.referral}
          onChange={(event) => set('referral', event.target.value)}
          className={controlClass}
        />
      </Field>
      <Field label="优先级">
        <select
          value={form.priority}
          onChange={(event) => set('priority', event.target.value as ApplicationPriority)}
          className={controlClass}
        >
          {APPLICATION_PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {priority}
            </option>
          ))}
        </select>
      </Field>
      <Field label="申请截止日">
        <DatePicker
          value={form.applyDeadlineDate}
          onChange={(val) => set('applyDeadlineDate', val)}
          placeholder="年 / 月 / 日"
          className="w-full"
        />
      </Field>
      <Field label="薪资">
        <input
          value={form.salary}
          onChange={(event) => set('salary', event.target.value)}
          className={controlClass}
        />
      </Field>
      <Field label="岗位链接" className="sm:col-span-2">
        <input
          type="url"
          value={form.link}
          onChange={(event) => set('link', event.target.value)}
          className={controlClass}
        />
      </Field>
      <Field label="备注" className="sm:col-span-2">
        <textarea
          rows={3}
          value={form.notes}
          onChange={(event) => set('notes', event.target.value)}
          className={controlClass}
        />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" variant="primary" disabled={disabled}>
          保存投递信息
        </Button>
      </div>
    </form>
  );
}

function RoundSequenceStrip({ rounds }: { rounds: RoundView[] }) {
  if (rounds.length === 0) return null;

  return (
    <div className="overflow-x-auto border-y border-line bg-surface-2 px-3 py-3">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">招聘进度</p>
      <ol className="flex min-w-max items-center pb-1" aria-label="轮次顺序">
        {rounds.map((round, index) => (
          <li key={round.id} className="flex items-center">
            <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-2.5 py-1.5">
              <span className="flex size-5 items-center justify-center rounded-full bg-ink text-[10px] font-bold text-white">
                {round.sequence}
              </span>
              <span className="text-[12px] font-semibold">{round.name}</span>
              {round.scheduledAt !== null && (
                <span className="text-[11px] text-muted">{formatInstant(round.scheduledAt)}</span>
              )}
              <Chip tone={ROUND_OUTCOME_TONE[round.outcome]}>
                {ROUND_OUTCOME_LABEL[round.outcome]}
              </Chip>
            </div>
            {index < rounds.length - 1 && <span aria-hidden="true" className="h-px w-5 bg-line" />}
          </li>
        ))}
      </ol>
    </div>
  );
}

function RoundRow({
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
  const [sequence, setSequence] = useState(String(round.sequence));
  const [notes, setNotes] = useState(round.notes ?? '');

  useEffect(() => setSequence(String(round.sequence)), [round.sequence]);
  useEffect(() => setNotes(round.notes ?? ''), [round.notes]);

  function updateSequence(event: FormEvent) {
    event.preventDefault();
    const next = Number(sequence);
    if (Number.isInteger(next) && next > 0 && next !== round.sequence) {
      onUpdate({ sequence: next });
    }
  }

  return (
    <li className="border-b border-line py-3 last:border-b-0">
      <div className="grid items-start gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <form onSubmit={updateSequence} className="flex items-center gap-1">
          <span className="text-[11px] font-bold text-muted">#</span>
          <input
            type="number"
            min={1}
            required
            aria-label={`${round.name}的轮次顺序`}
            value={sequence}
            onChange={(event) => setSequence(event.target.value)}
            className={`${controlClass} w-16 px-2 py-1.5 text-[12px]`}
          />
          <Button type="submit" className="px-2 py-1.5 text-[12px]" disabled={disabled}>
            移动
          </Button>
        </form>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold">{round.name}</span>
            <Chip>{ROUND_KIND_LABEL[round.kind]}</Chip>
            <Chip tone={ROUND_OUTCOME_TONE[round.outcome]}>
              {ROUND_OUTCOME_LABEL[round.outcome]}
            </Chip>
          </div>
          <p className="mt-1 text-[12px] text-secondary">
            {round.scheduledAt === null ? '时间待定' : formatInstant(round.scheduledAt)}
            {round.format !== null && ` · ${round.format}`}
            {round.durationMin !== null && ` · ${round.durationMin} 分钟`}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5 sm:justify-end">
          {round.outcome !== 'passed' && (
            <Button
              type="button"
              className="px-2 py-1.5 text-[12px]"
              disabled={disabled}
              onClick={() => onUpdate({ outcome: 'passed' })}
            >
              通过
            </Button>
          )}
          {round.outcome !== 'failed' && (
            <Button
              type="button"
              className="px-2 py-1.5 text-[12px]"
              disabled={disabled}
              onClick={() => onUpdate({ outcome: 'failed' })}
            >
              未通过
            </Button>
          )}
          {round.outcome !== 'pending' && (
            <Button
              type="button"
              className="px-2 py-1.5 text-[12px]"
              disabled={disabled}
              onClick={() => onUpdate({ outcome: 'pending' })}
            >
              恢复待定
            </Button>
          )}
          <Button
            type="button"
            className="px-2 py-1.5 text-[12px] text-critical"
            disabled={disabled}
            onClick={() => {
              if (window.confirm(`删除轮次“${round.name}”？`)) onRemove();
            }}
          >
            删除
          </Button>
        </div>
      </div>

      <details className="mt-2 text-[12px]">
        <summary className="cursor-pointer font-semibold text-secondary">轮次备注</summary>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <textarea
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="记录考察内容或复盘要点"
            className={`${controlClass} min-w-0 flex-1`}
          />
          <Button
            type="button"
            className="self-start text-[12px]"
            disabled={disabled}
            onClick={() => onUpdate({ notes: nullableText(notes) })}
          >
            保存备注
          </Button>
        </div>
      </details>
    </li>
  );
}

function AddRoundForm({
  onCreate,
  disabled,
}: {
  onCreate: (input: CreateRoundInput) => Promise<void>;
  disabled: boolean;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<RoundKind>('other');
  const [kindWasChosen, setKindWasChosen] = useState(false);
  const [scheduledLocal, setScheduledLocal] = useState('');
  const [format, setFormat] = useState('');
  const [duration, setDuration] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim() === '') return;
    try {
      await onCreate({
        name: name.trim(),
        kind,
        scheduledAt: scheduledLocal === '' ? null : new Date(scheduledLocal).toISOString(),
        format: nullableText(format),
        durationMin: duration === '' ? null : Number(duration),
      });
      setName('');
      setKind('other');
      setKindWasChosen(false);
      setScheduledLocal('');
      setFormat('');
      setDuration('');
    } catch {
      // mutation 的 error 会在页面上显示；保留输入便于候选人修改后重试。
    }
  }

  function changeName(nextName: string) {
    setName(nextName);
    if (!kindWasChosen) setKind(suggestRoundKind(nextName));
  }

  return (
    <form onSubmit={submit} className="grid gap-2 border-t border-line pt-3 sm:grid-cols-6">
      <Field label="新轮次" className="sm:col-span-2">
        <input
          required
          value={name}
          onChange={(event) => changeName(event.target.value)}
          placeholder="例如：一面 / HR 面"
          className={controlClass}
        />
      </Field>
      <Field label="类型">
        <select
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as RoundKind);
            setKindWasChosen(true);
          }}
          className={controlClass}
        >
          {ROUND_KINDS.map((value) => (
            <option key={value} value={value}>
              {ROUND_KIND_LABEL[value]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="时间" className="sm:col-span-2">
        <input
          type="datetime-local"
          value={scheduledLocal}
          onChange={(event) => setScheduledLocal(event.target.value)}
          className={controlClass}
        />
      </Field>
      <Field label="时长（分钟）">
        <input
          type="number"
          min={1}
          max={1440}
          value={duration}
          onChange={(event) => setDuration(event.target.value)}
          className={controlClass}
        />
      </Field>
      <Field label="形式" className="sm:col-span-2">
        <input
          value={format}
          onChange={(event) => setFormat(event.target.value)}
          placeholder="线上 / 现场 / 电话"
          className={controlClass}
        />
      </Field>
      <div className="flex items-end sm:col-span-4">
        <Button type="submit" variant="primary" disabled={disabled}>
          添加轮次
        </Button>
      </div>
    </form>
  );
}

function ApplicationPanel({
  application,
  actions,
  error,
}: {
  application: ApplicationView;
  actions: ApplicationActions;
  error: Error | null;
}) {
  const rounds = [...application.rounds].sort((a, b) => a.sequence - b.sequence);

  return (
    <article className={`border-l-4 pl-2 ${PRIORITY_RAIL[application.priority]}`}>
      <Panel
        title={
          <div className="flex flex-wrap items-center gap-2">
            <span>
              {application.company} · {application.position}
            </span>
            <Chip tone={PRIORITY_TONE[application.priority]}>{application.priority} 级</Chip>
            <Chip tone={STATUS_TONE[application.status.code]}>{application.status.label}</Chip>
          </div>
        }
        hint={
          application.status.failedRoundName === null
            ? undefined
            : `停在：${application.status.failedRoundName}`
        }
        action={
          <Button
            type="button"
            className="shrink-0 text-critical"
            disabled={actions.isBusy}
            onClick={() => {
              if (window.confirm('删除该投递及全部轮次？')) {
                actions.removeApplication(application.id);
              }
            }}
          >
            删除
          </Button>
        }
      >
        <div className="space-y-4">
          <MutationError error={error} action="本条操作" />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-secondary">
              {application.applyDeadlineDate !== null && (
                <div>
                  <dt className="inline font-semibold text-ink">截止 </dt>
                  <dd className="inline">{application.applyDeadlineDate}</dd>
                </div>
              )}
              {application.appliedAt !== null && (
                <div>
                  <dt className="inline font-semibold text-ink">已投 </dt>
                  <dd className="inline">{formatInstant(application.appliedAt)}</dd>
                </div>
              )}
              {application.city !== null && (
                <div>
                  <dt className="inline font-semibold text-ink">城市 </dt>
                  <dd className="inline">{application.city}</dd>
                </div>
              )}
              {application.channel !== null && (
                <div>
                  <dt className="inline font-semibold text-ink">渠道 </dt>
                  <dd className="inline">{application.channel}</dd>
                </div>
              )}
              {application.link !== null && (
                <div>
                  <a
                    href={application.link}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-accent hover:underline"
                  >
                    查看岗位
                  </a>
                </div>
              )}
            </dl>

            <div className="flex flex-wrap items-end gap-2">
              {application.appliedAt === null && (
                <Button
                  type="button"
                  variant="primary"
                  disabled={actions.isBusy}
                  onClick={() => actions.markApplied(application.id)}
                >
                  标记已投递
                </Button>
              )}
              <Field label="最终结果">
                <select
                  aria-label={`${application.company}的最终结果`}
                  value={application.outcome ?? ''}
                  disabled={actions.isBusy}
                  onChange={(event) =>
                    actions.updateApplication(application.id, {
                      outcome:
                        event.target.value === ''
                          ? null
                          : (event.target.value as ApplicationOutcome),
                    })
                  }
                  className={controlClass}
                >
                  <option value="">未定</option>
                  <option value="oc">OC</option>
                  <option value="offer">Offer</option>
                  <option value="rejected">已挂</option>
                  <option value="declined">我拒了</option>
                </select>
              </Field>
            </div>
          </div>

          <RoundSequenceStrip rounds={rounds} />

          <section aria-labelledby={`rounds-${application.id}`}>
            <div className="mb-1 flex items-center justify-between">
              <h3 id={`rounds-${application.id}`} className="text-[13px] font-bold">
                轮次记录
              </h3>
              <span className="text-[11px] text-muted">{rounds.length} 轮</span>
            </div>
            {rounds.length === 0 ? (
              <p className="py-3 text-[13px] text-muted">还没有轮次，从下方添加第一个安排。</p>
            ) : (
              <ul>
                {rounds.map((round) => (
                  <RoundRow
                    key={round.id}
                    round={round}
                    disabled={actions.isBusy}
                    onUpdate={(input) => actions.updateRound(application.id, round.id, input)}
                    onRemove={() => actions.removeRound(application.id, round.id)}
                  />
                ))}
              </ul>
            )}
            <AddRoundForm
              disabled={actions.isBusy}
              onCreate={(input) => actions.createRound(application.id, input)}
            />
          </section>

          <details className="border-t border-line pt-3">
            <summary className="cursor-pointer text-[13px] font-semibold text-secondary">
              编辑投递详情
            </summary>
            <ApplicationEditForm
              application={application}
              disabled={actions.isBusy}
              onSave={(input) => actions.updateApplication(application.id, input)}
            />
          </details>
        </div>
      </Panel>
    </article>
  );
}

export function ApplicationsPage() {
  const queryClient = useQueryClient();
  const [createForm, setCreateForm] = useState(INITIAL_APPLICATION_FORM);
  const [actionError, setActionError] = useState<ActionError | null>(null);
  const applicationsQuery = useQuery({ queryKey: APPLICATIONS_KEY, queryFn: fetchApplications });

  const invalidateCampus = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: APPLICATIONS_KEY }),
      queryClient.invalidateQueries({ queryKey: STATS_KEY }),
    ]);
  };

  const mutationStarted = () => setActionError(null);
  const mutationSucceeded = async () => {
    setActionError(null);
    await invalidateCampus();
  };
  const createFailed = (error: Error) => setActionError({ scope: 'create', error });
  const applicationFailed = (applicationId: string, error: Error) =>
    setActionError({ scope: 'application', applicationId, error });

  const createApplicationMutation = useMutation({
    mutationFn: postApplication,
    onMutate: mutationStarted,
    onError: createFailed,
    onSuccess: async () => {
      setCreateForm(INITIAL_APPLICATION_FORM);
      await mutationSucceeded();
    },
  });
  const updateApplicationMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateApplicationInput }) =>
      patchApplication(id, input),
    onMutate: mutationStarted,
    onError: (error, { id }) => applicationFailed(id, error),
    onSuccess: mutationSucceeded,
  });
  const applyMutation = useMutation({
    mutationFn: postApply,
    onMutate: mutationStarted,
    onError: (error, id) => applicationFailed(id, error),
    onSuccess: mutationSucceeded,
  });
  const deleteApplicationMutation = useMutation({
    mutationFn: deleteApplication,
    onMutate: mutationStarted,
    onError: (error, id) => applicationFailed(id, error),
    onSuccess: mutationSucceeded,
  });
  const createRoundMutation = useMutation({
    mutationFn: ({ applicationId, input }: { applicationId: string; input: CreateRoundInput }) =>
      postRound(applicationId, input),
    onMutate: mutationStarted,
    onError: (error, { applicationId }) => applicationFailed(applicationId, error),
    onSuccess: mutationSucceeded,
  });
  const updateRoundMutation = useMutation({
    mutationFn: ({ id, input }: { applicationId: string; id: string; input: UpdateRoundInput }) =>
      patchRound(id, input),
    onMutate: mutationStarted,
    onError: (error, { applicationId }) => applicationFailed(applicationId, error),
    onSuccess: mutationSucceeded,
  });
  const deleteRoundMutation = useMutation({
    mutationFn: ({ id }: { applicationId: string; id: string }) => deleteRound(id),
    onMutate: mutationStarted,
    onError: (error, { applicationId }) => applicationFailed(applicationId, error),
    onSuccess: mutationSucceeded,
  });

  const mutations = [
    createApplicationMutation,
    updateApplicationMutation,
    applyMutation,
    deleteApplicationMutation,
    createRoundMutation,
    updateRoundMutation,
    deleteRoundMutation,
  ];
  const isBusy = mutations.some((mutation) => mutation.isPending);

  function submitApplication(event: FormEvent) {
    event.preventDefault();
    if (createForm.company.trim() === '' || createForm.position.trim() === '') return;
    const input: CreateApplicationInput = {
      company: createForm.company.trim(),
      position: createForm.position.trim(),
      priority: createForm.priority,
    };
    if (createForm.applyDeadlineDate !== '') {
      input.applyDeadlineDate = createForm.applyDeadlineDate;
    }
    createApplicationMutation.mutate(input);
  }

  if (applicationsQuery.isPending) {
    return (
      <div className="space-y-4">
        <PageHeader eyebrow="秋招管理" title="投递总表" />
        <p role="status" className="text-[13px] text-muted">
          正在整理你的投递记录…
        </p>
      </div>
    );
  }

  if (applicationsQuery.isError) {
    return (
      <div className="space-y-4">
        <PageHeader eyebrow="秋招管理" title="投递总表" />
        <Panel>
          <p className="text-[13px] text-critical">
            投递记录加载失败：{applicationsQuery.error.message}
          </p>
          <Button type="button" className="mt-3" onClick={() => void applicationsQuery.refetch()}>
            重新加载
          </Button>
        </Panel>
      </div>
    );
  }

  const actions: ApplicationActions = {
    updateApplication: (id, input) => updateApplicationMutation.mutate({ id, input }),
    markApplied: (id) => applyMutation.mutate(id),
    removeApplication: (id) => deleteApplicationMutation.mutate(id),
    createRound: async (applicationId, input) => {
      await createRoundMutation.mutateAsync({ applicationId, input });
    },
    updateRound: (applicationId, id, input) =>
      updateRoundMutation.mutate({ applicationId, id, input }),
    removeRound: (applicationId, id) => deleteRoundMutation.mutate({ applicationId, id }),
    isBusy,
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="秋招管理" title="投递总表" />

      <Panel title="记一条新机会" hint="先记公司和岗位，其他信息可以稍后补齐">
        <form onSubmit={submitApplication} className="grid items-end gap-2 sm:grid-cols-6">
          <Field label="公司" className="sm:col-span-2">
            <input
              required
              value={createForm.company}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, company: event.target.value }))
              }
              placeholder="公司名称"
              className={controlClass}
            />
          </Field>
          <Field label="岗位" className="sm:col-span-2">
            <input
              required
              value={createForm.position}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, position: event.target.value }))
              }
              placeholder="申请岗位"
              className={controlClass}
            />
          </Field>
          <Field label="优先级">
            <select
              value={createForm.priority}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  priority: event.target.value as ApplicationPriority,
                }))
              }
              className={controlClass}
            >
              {APPLICATION_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </Field>
          <Field label="截止日">
            <DatePicker
              value={createForm.applyDeadlineDate}
              onChange={(val) =>
                setCreateForm((current) => ({
                  ...current,
                  applyDeadlineDate: val,
                }))
              }
              placeholder="年 / 月 / 日"
              className="w-full"
            />
          </Field>
          <div className="sm:col-span-6">
            <Button type="submit" variant="primary" disabled={isBusy}>
              添加投递
            </Button>
          </div>
        </form>
        {actionError?.scope === 'create' && (
          <div className="mt-3">
            <MutationError error={actionError.error} action="添加投递" />
          </div>
        )}
      </Panel>

      {applicationsQuery.data.applications.length === 0 ? (
        <EmptyState
          icon={IconBriefcase}
          title="还没有投递记录"
          description="把正在关注的公司与岗位记在上方，截止日和面试轮次就能集中跟进。"
        />
      ) : (
        <section className="space-y-4" aria-label="投递流水账">
          {applicationsQuery.data.applications.map((application) => (
            <ApplicationPanel
              key={application.id}
              application={application}
              actions={actions}
              error={
                actionError?.scope === 'application' && actionError.applicationId === application.id
                  ? actionError.error
                  : null
              }
            />
          ))}
        </section>
      )}
    </div>
  );
}
