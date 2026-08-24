import { useState, type FormEvent } from 'react';
import { Button, DatePicker, Field, controlClass, useTimezone } from '@workbench/ui';
import {
  ROUND_KINDS,
  type RoundKind,
  type RoundView,
  type UpdateRoundInput,
} from '../../contract.js';
import { ROUND_KIND_LABEL, nameForKindChange } from '../utils/roundNaming.js';

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * 轮次的就地编辑表单。抽屉与表格行各有一套外观不同的轮次卡片，但「能改哪些字段、
 * 改完发什么」是同一件事，所以收在这里一份。
 *
 * **刻意不发 `outcome`。** 结果由卡片上那排按钮管，混进来会让「保存一下轮次名」
 * 顺手重写 `outcomeAt`——服务端只在 outcome 真的变了时才动它，但没必要把这条
 * 依赖建立起来。
 *
 * 时刻两头换算：入口 `formatUtcToLocal(...).full` 拿到 'YYYY-MM-DD HH:mm'，
 * 出口 `toUtcIso` 换回 UTC。因为写入前服务端已把秒与毫秒截零（ADR-0012），
 * 这一来一回是恒等的——不改时间就不会产生一次假的变更。
 */
export function RoundEditForm({
  round,
  onSave,
  onCancel,
  disabled,
}: {
  round: RoundView;
  onSave: (input: UpdateRoundInput) => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const { toUtcIso, formatUtcToLocal } = useTimezone();
  const toLocal = (utc: string | null): string => (utc === null ? '' : formatUtcToLocal(utc).full);

  const [name, setName] = useState(round.name);
  const [kind, setKind] = useState<RoundKind>(round.kind);
  const [scheduledLocal, setScheduledLocal] = useState(toLocal(round.scheduledAt));
  const [deadlineLocal, setDeadlineLocal] = useState(toLocal(round.deadlineAt));
  const [format, setFormat] = useState(round.format ?? '');
  const [duration, setDuration] = useState(
    round.durationMin === null ? '' : String(round.durationMin),
  );

  function onKindChange(next: RoundKind) {
    setKind(next);
    // 与新建表单同一条规则：名称为空或还是上次自动填的类型名才跟着改，
    // 手打过的「技术二面」不会因为改了类型就被抹掉
    const suggested = nameForKindChange(next, name);
    if (suggested !== null) setName(suggested);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') return;
    onSave({
      name: trimmed,
      kind,
      scheduledAt: scheduledLocal === '' ? null : toUtcIso(scheduledLocal),
      deadlineAt: deadlineLocal === '' ? null : toUtcIso(deadlineLocal),
      format: nullableText(format),
      durationMin: duration === '' ? null : Number(duration),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field label="轮次名称">
          <input
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：技术二面 / 主管面"
            className={controlClass}
          />
        </Field>
        <Field label="轮次类型">
          <select
            value={kind}
            onChange={(e) => onKindChange(e.target.value as RoundKind)}
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

      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field label="安排时间 (时分一体)">
          <DatePicker
            value={scheduledLocal}
            onChange={setScheduledLocal}
            placeholder="年 / 月 / 日  时 : 分"
            showTime={true}
            className="w-full"
          />
        </Field>
        <Field label="截止时间 (测评 / 笔试常用)">
          <DatePicker
            value={deadlineLocal}
            onChange={setDeadlineLocal}
            placeholder="最晚做完的时刻"
            showTime={true}
            className="w-full"
          />
        </Field>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field label="形式">
          <input
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            placeholder="视频 / 现场 / 电话"
            className={controlClass}
          />
        </Field>
        <Field label="时长 (分钟)">
          <input
            type="number"
            min={1}
            max={1440}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="60"
            className={controlClass}
          />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="text-[11px] text-muted hover:text-ink">
          取消
        </button>
        <Button type="submit" variant="primary" disabled={disabled} className="py-0.5 text-[11px]">
          保存轮次
        </Button>
      </div>
    </form>
  );
}
