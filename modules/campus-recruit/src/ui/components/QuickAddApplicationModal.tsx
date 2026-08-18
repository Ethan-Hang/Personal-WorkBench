import { useState, type FormEvent } from 'react';
import { Button, DatePicker, Field, Modal, controlClass } from '@workbench/ui';
import {
  APPLICATION_PRIORITIES,
  type ApplicationPriority,
  type CreateApplicationInput,
} from '../../contract.js';

interface QuickAddApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: CreateApplicationInput) => Promise<void>;
  isBusy: boolean;
  error: Error | null;
}

const INITIAL_FORM = {
  company: '',
  position: '',
  priority: 'B' as ApplicationPriority,
  applyDeadlineDate: '',
  city: '',
  channel: '',
  notes: '',
};

export function QuickAddApplicationModal({
  isOpen,
  onClose,
  onSubmit,
  isBusy,
  error,
}: QuickAddApplicationModalProps) {
  const [form, setForm] = useState(INITIAL_FORM);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.company.trim() || !form.position.trim()) return;

    try {
      await onSubmit({
        company: form.company.trim(),
        position: form.position.trim(),
        priority: form.priority,
        applyDeadlineDate: form.applyDeadlineDate === '' ? null : form.applyDeadlineDate,
        city: form.city.trim() === '' ? null : form.city.trim(),
        channel: form.channel.trim() === '' ? null : form.channel.trim(),
        notes: form.notes.trim() === '' ? null : form.notes.trim(),
      });
      setForm(INITIAL_FORM);
      onClose();
    } catch {
      // handled by parent query error
    }
  }

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="记录新投递机会"
      description="先填写公司与岗位基本信息，后续可在详情抽屉中补充面试轮次与复盘笔记。"
      maxWidth="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {error && (
          <p
            role="alert"
            className="rounded-control bg-critical-soft px-3 py-2 text-[12px] text-critical"
          >
            添加失败：{error.message}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="目标公司 *">
            <input
              required
              autoFocus
              value={form.company}
              onChange={(e) => set('company', e.target.value)}
              placeholder="例如：华为 / 字节跳动 / 大疆"
              className={controlClass}
            />
          </Field>
          <Field label="申请岗位 *">
            <input
              required
              value={form.position}
              onChange={(e) => set('position', e.target.value)}
              placeholder="例如：嵌入式软件 / 后端开发"
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
          <Field label="意向城市">
            <input
              value={form.city}
              onChange={(e) => set('city', e.target.value)}
              placeholder="深圳 / 北京 / 上海"
              className={controlClass}
            />
          </Field>
          <Field label="投递渠道">
            <input
              value={form.channel}
              onChange={(e) => set('channel', e.target.value)}
              placeholder="官网 / 牛客 / 内推"
              className={controlClass}
            />
          </Field>
        </div>

        <Field label="网申截止日 (可选)">
          <DatePicker
            value={form.applyDeadlineDate}
            onChange={(val) => set('applyDeadlineDate', val)}
            placeholder="年 / 月 / 日  时 : 分"
            showTime={true}
            className="w-full"
          />
        </Field>

        <Field label="备注 / 内推码 (可选)">
          <input
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="例如：内推码 NTA1234，关注嵌入式底层方向"
            className={controlClass}
          />
        </Field>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-line">
          <Button type="button" onClick={onClose} className="text-[13px]">
            取消
          </Button>
          <Button type="submit" variant="primary" disabled={isBusy} className="text-[13px]">
            确认添加
          </Button>
        </div>
      </form>
    </Modal>
  );
}
