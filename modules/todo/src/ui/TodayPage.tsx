import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Importance } from '@workbench/core';
import { Button, Chip, Field, PageHeader, Panel, controlClass } from '@workbench/ui';
import type { TaskView } from '../contract.js';
import { fetchToday, postComplete, postTask } from './api.js';

const TODAY_KEY = ['todo', 'today'] as const;

const URGENCY_LABEL: Record<TaskView['urgency'], string> = {
  overdue: '已逾期',
  imminent: '24 小时内',
  soon: '3 天内',
  later: '还早',
  none: '无死线',
};

/** 紧急度到色调的映射集中在这里，页面各处不再各自判断颜色。 */
const URGENCY_TONE: Record<TaskView['urgency'], 'neutral' | 'warning' | 'critical'> = {
  overdue: 'critical',
  imminent: 'warning',
  soon: 'warning',
  later: 'neutral',
  none: 'neutral',
};

function TaskRow({ task, onComplete }: { task: TaskView; onComplete: (id: string) => void }) {
  return (
    <li className="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
      <input
        type="checkbox"
        aria-label={`完成 ${task.title}`}
        onChange={() => onComplete(task.id)}
        className="size-[18px] rounded-[6px] accent-accent"
      />
      <span className="flex-1 text-[13px] font-semibold">{task.title}</span>
      {task.isImportantQuadrant && <Chip tone="warning">重要</Chip>}
      <Chip tone={URGENCY_TONE[task.urgency]}>{URGENCY_LABEL[task.urgency]}</Chip>
    </li>
  );
}

export function TodayPage() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [importance, setImportance] = useState<Importance>('normal');
  const [dueDate, setDueDate] = useState('');

  const today = useQuery({ queryKey: TODAY_KEY, queryFn: fetchToday });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: TODAY_KEY });

  const create = useMutation({
    mutationFn: postTask,
    onSuccess: () => {
      setTitle('');
      setDueDate('');
      void invalidate();
    },
  });

  const complete = useMutation({ mutationFn: postComplete, onSuccess: () => void invalidate() });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (title.trim() === '') return;
    create.mutate({ title, importance, dueDate: dueDate === '' ? null : dueDate });
  }

  if (today.isPending) return <p className="text-muted">加载中…</p>;
  if (today.isError) return <p className="text-critical">加载失败：{today.error.message}</p>;

  const { date, tasks, overdue } = today.data;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="今日工作台" title={date} />

      {overdue.length > 0 && (
        <details className="rounded-panel border border-critical-soft bg-critical-soft px-[18px] py-3">
          <summary className="cursor-pointer text-[13px] font-semibold text-critical">
            有 {overdue.length} 项逾期任务，点击展开
          </summary>
          <ul className="mt-2">
            {overdue.map((t) => (
              <TaskRow key={t.id} task={t} onComplete={(id) => complete.mutate(id)} />
            ))}
          </ul>
        </details>
      )}

      <Panel>
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
          <Field label="要做点什么" className="min-w-48 flex-1">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="写点什么…"
              aria-label="任务标题"
              className={controlClass}
            />
          </Field>
          <Field label="重要程度">
            <select
              value={importance}
              onChange={(e) => setImportance(e.target.value as Importance)}
              aria-label="重要程度"
              className={controlClass}
            >
              <option value="high">重要</option>
              <option value="normal">一般</option>
              <option value="low">次要</option>
            </select>
          </Field>
          <Field label="截止日期">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              aria-label="截止日期"
              className={controlClass}
            />
          </Field>
          <Button type="submit" variant="primary" disabled={create.isPending}>
            添加
          </Button>
        </form>

        {create.isError && (
          <p className="mt-3 text-[13px] text-critical">添加失败：{create.error.message}</p>
        )}
        {complete.isError && (
          <p className="mt-3 text-[13px] text-critical">完成失败：{complete.error.message}</p>
        )}
      </Panel>

      <Panel title="今天" hint={`${tasks.length} 项`}>
        {tasks.length === 0 ? (
          <p className="text-muted">今天还没有安排。</p>
        ) : (
          <ul>
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} onComplete={(id) => complete.mutate(id)} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
