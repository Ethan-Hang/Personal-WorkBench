import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Importance } from '@workbench/core';
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

function TaskRow({ task, onComplete }: { task: TaskView; onComplete: (id: string) => void }) {
  return (
    <li className="flex items-center gap-3 border-b border-stone-200 py-3">
      <input
        type="checkbox"
        aria-label={`完成 ${task.title}`}
        onChange={() => onComplete(task.id)}
        className="size-4"
      />
      <span className="flex-1">{task.title}</span>
      {task.isImportantQuadrant && (
        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">重要</span>
      )}
      <span
        className={task.urgency === 'overdue' ? 'text-xs text-red-700' : 'text-xs text-stone-500'}
      >
        {URGENCY_LABEL[task.urgency]}
      </span>
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

  if (today.isPending) return <p className="text-stone-500">加载中…</p>;
  if (today.isError) return <p className="text-red-700">加载失败：{today.error.message}</p>;

  const { date, tasks, overdue } = today.data;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">今日工作台 · {date}</h1>

      {overdue.length > 0 && (
        <details className="rounded border border-red-200 bg-red-50 px-4 py-3">
          <summary className="cursor-pointer text-red-800">
            有 {overdue.length} 项逾期任务，点击展开
          </summary>
          <ul className="mt-2">
            {overdue.map((t) => (
              <TaskRow key={t.id} task={t} onComplete={(id) => complete.mutate(id)} />
            ))}
          </ul>
        </details>
      )}

      <form onSubmit={onSubmit} className="flex flex-wrap gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="要做点什么？"
          aria-label="任务标题"
          className="flex-1 rounded border border-stone-300 px-3 py-2"
        />
        <select
          value={importance}
          onChange={(e) => setImportance(e.target.value as Importance)}
          aria-label="重要程度"
          className="rounded border border-stone-300 px-3 py-2"
        >
          <option value="high">重要</option>
          <option value="normal">一般</option>
          <option value="low">次要</option>
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          aria-label="截止日期"
          className="rounded border border-stone-300 px-3 py-2"
        />
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded bg-amber-700 px-4 py-2 text-white disabled:opacity-50"
        >
          添加
        </button>
      </form>

      {create.isError && <p className="text-red-700">添加失败：{create.error.message}</p>}
      {complete.isError && <p className="text-red-700">完成失败：{complete.error.message}</p>}

      {tasks.length === 0 ? (
        <p className="text-stone-500">今天还没有安排。</p>
      ) : (
        <ul>
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} onComplete={(id) => complete.mutate(id)} />
          ))}
        </ul>
      )}
    </div>
  );
}
