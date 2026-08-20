import { useState, useEffect, useMemo } from 'react';
import { DatePicker, parseDateTime } from './DatePicker.js';
import { useTimezone } from './TimezoneContext.js';
import { Field } from './Field.js';
import { IconClock, IconCalendar, IconAlertCircle, IconSparkles } from './icons.js';

export interface ScheduleRangeValue {
  kind: 'all-day' | 'timed';
  date?: string; // YYYY-MM-DD for all-day
  startUtc?: string; // UTC ISO string for timed
  endUtc?: string; // UTC ISO string for timed
}

export interface ScheduleRangePickerProps {
  initialKind?: 'all-day' | 'timed';
  initialDate?: string;
  initialStartLocal?: string; // 'YYYY-MM-DD HH:mm'
  initialEndLocal?: string; // 'YYYY-MM-DD HH:mm'
  onChange: (value: ScheduleRangeValue | null) => void;
  className?: string;
}

function padZero(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function dateToLocalString(d: Date): string {
  const y = d.getFullYear();
  const m = padZero(d.getMonth() + 1);
  const day = padZero(d.getDate());
  const h = padZero(d.getHours());
  const min = padZero(d.getMinutes());
  return `${y}-${m}-${day} ${h}:${min}`;
}

function parseToDate(str: string): Date | null {
  if (!str.trim()) return null;
  const parsed = parseDateTime(str);
  if (!parsed.date) return null;
  const d = new Date(parsed.date);
  if (parsed.hour !== null && parsed.minute !== null) {
    d.setHours(parsed.hour, parsed.minute, 0, 0);
  } else {
    d.setHours(9, 0, 0, 0);
  }
  return d;
}

export function ScheduleRangePicker({
  initialKind = 'all-day',
  initialDate = '',
  initialStartLocal = '',
  initialEndLocal = '',
  onChange,
  className = '',
}: ScheduleRangePickerProps) {
  const { toUtcIso, timezone } = useTimezone();

  const [kind, setKind] = useState<'all-day' | 'timed'>(initialKind);

  // 全天模式状态
  const [allDayDate, setAllDayDate] = useState(
    initialDate || dateToLocalString(new Date()).slice(0, 10),
  );

  // 定时模式状态：三者（开始、结束、持续时长）
  const [startTime, setStartTime] = useState<string>(() => {
    if (initialStartLocal) return initialStartLocal;
    const now = new Date();
    now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
    return dateToLocalString(now);
  });

  const [endTime, setEndTime] = useState<string>(() => {
    if (initialEndLocal) return initialEndLocal;
    const now = new Date();
    now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15 + 45, 0, 0);
    return dateToLocalString(now);
  });

  const [durationMin, setDurationMin] = useState<number | null>(() => {
    const s = parseToDate(initialStartLocal || startTime);
    const e = parseToDate(initialEndLocal || endTime);
    if (s && e && e.getTime() > s.getTime()) {
      return Math.round((e.getTime() - s.getTime()) / 60000);
    }
    return 45;
  });

  // 最近触发推导的字段来源，用于展示友好的推导提示语
  const [deductionTip, setDeductionTip] = useState<string | null>(null);

  // 1. 开始时间变更处理
  function handleStartChange(newStart: string) {
    setStartTime(newStart);
    const sDate = parseToDate(newStart);
    if (!sDate) return;

    if (durationMin !== null && durationMin > 0) {
      const newEnd = new Date(sDate.getTime() + durationMin * 60000);
      const newEndStr = dateToLocalString(newEnd);
      setEndTime(newEndStr);
      setDeductionTip(
        `已根据持续时长（${durationMin}分钟），自动设置结束时间为 ${newEndStr.slice(11)}`,
      );
    } else if (endTime) {
      const eDate = parseToDate(endTime);
      if (eDate && eDate.getTime() > sDate.getTime()) {
        const diff = Math.round((eDate.getTime() - sDate.getTime()) / 60000);
        setDurationMin(diff);
        setDeductionTip(`持续时长已更新为 ${diff} 分钟`);
      }
    }
  }

  // 2. 结束时间变更处理
  function handleEndChange(newEnd: string) {
    setEndTime(newEnd);
    const eDate = parseToDate(newEnd);
    if (!eDate) return;

    if (startTime) {
      const sDate = parseToDate(startTime);
      if (sDate) {
        if (eDate.getTime() > sDate.getTime()) {
          const diff = Math.round((eDate.getTime() - sDate.getTime()) / 60000);
          setDurationMin(diff);
          setDeductionTip(`持续时长已更新为 ${diff} 分钟`);
        } else if (durationMin !== null && durationMin > 0) {
          const newStart = new Date(eDate.getTime() - durationMin * 60000);
          const newStartStr = dateToLocalString(newStart);
          setStartTime(newStartStr);
          setDeductionTip(
            `已根据持续时长（${durationMin}分钟），自动调整开始时间为 ${newStartStr.slice(11)}`,
          );
        }
      }
    } else if (durationMin !== null && durationMin > 0) {
      const newStart = new Date(eDate.getTime() - durationMin * 60000);
      const newStartStr = dateToLocalString(newStart);
      setStartTime(newStartStr);
      setDeductionTip(`已根据持续时长，自动设置开始时间为 ${newStartStr.slice(11)}`);
    }
  }

  // 3. 持续时长变更处理
  function handleDurationChange(newDuration: number | null) {
    setDurationMin(newDuration);
    if (newDuration === null || newDuration <= 0) return;

    if (startTime) {
      const sDate = parseToDate(startTime);
      if (sDate) {
        const newEnd = new Date(sDate.getTime() + newDuration * 60000);
        const newEndStr = dateToLocalString(newEnd);
        setEndTime(newEndStr);
        setDeductionTip(
          `已根据持续时长（${newDuration}分钟），自动设置结束时间为 ${newEndStr.slice(11)}`,
        );
      }
    } else if (endTime) {
      const eDate = parseToDate(endTime);
      if (eDate) {
        const newStart = new Date(eDate.getTime() - newDuration * 60000);
        const newStartStr = dateToLocalString(newStart);
        setStartTime(newStartStr);
        setDeductionTip(`已根据持续时长，自动设置开始时间为 ${newStartStr.slice(11)}`);
      }
    }
  }

  // 校验时间合法性
  const timeError = useMemo(() => {
    if (kind === 'all-day') return null;
    if (!startTime) return '请设置开始时间';
    const sDate = parseToDate(startTime);
    const eDate = parseToDate(endTime);
    if (!sDate) return '开始时间格式无效';
    if (eDate && eDate.getTime() <= sDate.getTime()) {
      return '结束时间必须晚于开始时间';
    }
    return null;
  }, [kind, startTime, endTime]);

  // 同步输出给外部
  useEffect(() => {
    if (kind === 'all-day') {
      if (!allDayDate) {
        onChange(null);
      } else {
        onChange({
          kind: 'all-day',
          date: allDayDate.trim(),
        });
      }
    } else {
      if (timeError || !startTime) {
        onChange(null);
        return;
      }
      const startUtc = toUtcIso(startTime);
      const endUtc = endTime ? toUtcIso(endTime) : undefined;
      onChange({
        kind: 'timed',
        startUtc,
        endUtc: endUtc || undefined,
      });
    }
  }, [kind, allDayDate, startTime, endTime, timeError, toUtcIso, onChange]);

  const quickDurations = [
    { label: '15分钟', mins: 15 },
    { label: '30分钟', mins: 30 },
    { label: '45分钟', mins: 45 },
    { label: '1小时', mins: 60 },
    { label: '1.5小时', mins: 90 },
    { label: '2小时', mins: 120 },
  ];

  return (
    <div className={`space-y-3.5 ${className}`}>
      {/* 顶部排程类型切换胶囊 */}
      <div className="flex items-center justify-between border-b border-line pb-2.5">
        <div className="flex rounded-control bg-surface-2 p-0.5 border border-line/60">
          <button
            type="button"
            onClick={() => setKind('all-day')}
            className={`flex items-center gap-1.5 rounded-[5px] px-3 py-1.5 text-xs font-bold transition-all ${
              kind === 'all-day'
                ? 'bg-surface text-accent shadow-xs'
                : 'text-secondary hover:text-ink'
            }`}
          >
            <IconCalendar size={13} />
            <span>全天排程</span>
          </button>
          <button
            type="button"
            onClick={() => setKind('timed')}
            className={`flex items-center gap-1.5 rounded-[5px] px-3 py-1.5 text-xs font-bold transition-all ${
              kind === 'timed'
                ? 'bg-surface text-accent shadow-xs'
                : 'text-secondary hover:text-ink'
            }`}
          >
            <IconClock size={13} />
            <span>时间段排程</span>
          </button>
        </div>

        <span className="text-[11px] text-muted">
          时区：<strong className="text-secondary">{timezone}</strong>
        </span>
      </div>

      {/* 1. 全天排程模式 */}
      {kind === 'all-day' ? (
        <div className="space-y-2 animate-fade-in">
          <Field label="排程日期">
            <DatePicker
              value={allDayDate}
              onChange={setAllDayDate}
              placeholder="年 / 月 / 日"
              showTime={false}
              className="w-full"
            />
          </Field>
          <p className="text-[11px] text-muted leading-relaxed">
            全天事项将在当天的任务列表置顶呈现，若未完成将自动滚入次日。
          </p>
        </div>
      ) : (
        /* 2. 定时时间段模式（支持开始、结束、时长三者任意二者推导第三者） */
        <div className="space-y-3 animate-fade-in">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* 开始时间 */}
            <Field label="开始时间">
              <DatePicker
                value={startTime}
                onChange={handleStartChange}
                placeholder="年 / 月 / 日  时 : 分"
                showTime={true}
                className="w-full"
              />
            </Field>

            {/* 结束时间 */}
            <Field label="结束时间 (可选)">
              <DatePicker
                value={endTime}
                onChange={handleEndChange}
                placeholder="年 / 月 / 日  时 : 分"
                showTime={true}
                className="w-full"
              />
            </Field>
          </div>

          {/* 持续时长与快捷推导按钮 */}
          <div className="rounded-control bg-surface-2/60 p-3 border border-line/60 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-ink">持续时长</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={durationMin ?? ''}
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value, 10) : null;
                    handleDurationChange(val);
                  }}
                  className="w-16 rounded-control border border-line bg-surface px-2 py-0.5 text-center text-xs font-bold text-ink focus:outline-accent"
                  placeholder="分钟"
                />
                <span className="text-[11px] text-muted">分钟</span>
                {durationMin !== null && durationMin >= 60 && (
                  <span className="text-[11px] text-accent font-semibold ml-1">
                    ({(durationMin / 60).toFixed(1)}小时)
                  </span>
                )}
              </div>
            </div>

            {/* 快捷时长胶囊按钮 */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {quickDurations.map((d) => (
                <button
                  key={d.mins}
                  type="button"
                  onClick={() => handleDurationChange(d.mins)}
                  className={`rounded-control px-2 py-1 text-[11px] font-semibold border transition ${
                    durationMin === d.mins
                      ? 'border-accent bg-accent-soft text-accent ring-1 ring-accent/30'
                      : 'border-line bg-surface text-secondary hover:bg-surface-2 hover:text-ink'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* 智能推导辅助提示 */}
          {deductionTip && !timeError && (
            <div className="flex items-center gap-1.5 text-[11px] text-accent bg-accent-soft/40 px-2.5 py-1.5 rounded-control border border-accent/20 animate-slide-down-in">
              <IconSparkles size={13} className="shrink-0 text-accent" />
              <span>{deductionTip}</span>
            </div>
          )}

          {/* 错误提示 */}
          {timeError && (
            <div className="flex items-center gap-1.5 text-[11px] text-critical bg-critical-soft/60 px-2.5 py-1.5 rounded-control border border-critical/30 animate-slide-down-in">
              <IconAlertCircle size={13} className="shrink-0 text-critical" />
              <span>{timeError}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
