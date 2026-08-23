import { useState, type FormEvent } from 'react';
import { Button, DatePicker, Field, IconChevronDown, Modal, controlClass } from '@workbench/ui';
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
  companyType: '',
  industry: '',
  referral: '',
  applyEmail: '',
  applyPhone: '',
  salary: '',
  link: '',
};

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function QuickAddApplicationModal({
  isOpen,
  onClose,
  onSubmit,
  isBusy,
  error,
}: QuickAddApplicationModalProps) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [showMore, setShowMore] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.company.trim() || !form.position.trim()) return;

    try {
      await onSubmit({
        company: form.company.trim(),
        position: form.position.trim(),
        priority: form.priority,
        applyDeadlineDate: form.applyDeadlineDate === '' ? null : form.applyDeadlineDate,
        city: nullableText(form.city),
        channel: nullableText(form.channel),
        notes: nullableText(form.notes),
        companyType: nullableText(form.companyType),
        industry: nullableText(form.industry),
        referral: nullableText(form.referral),
        applyEmail: nullableText(form.applyEmail),
        applyPhone: nullableText(form.applyPhone),
        salary: nullableText(form.salary),
        link: nullableText(form.link),
      });
      setForm(INITIAL_FORM);
      setShowMore(false);
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
      description="填写公司与岗位基本信息；展开「更多信息」可一次录完档案，后续也能在详情抽屉中补充。"
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

        <Field label="备注 / 关键信息 (可选)">
          <input
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="例如：投递账号、进度交流群、意向度说明"
            className={controlClass}
          />
        </Field>

        {/* 更多信息：默认收起。收起不清值——填过再折叠依然随表单提交 */}
        <div className="rounded-lg border border-line">
          <button
            type="button"
            onClick={() => setShowMore((prev) => !prev)}
            aria-expanded={showMore}
            className="flex w-full items-center justify-between px-3 py-2 text-[13px] font-medium text-secondary hover:text-ink"
          >
            <span>更多信息（选填）</span>
            <IconChevronDown
              size={15}
              className={`transition-transform ${showMore ? 'rotate-180' : ''}`}
            />
          </button>

          {showMore && (
            <div className="space-y-3.5 border-t border-line px-3 py-3.5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="公司类型">
                  <input
                    value={form.companyType}
                    onChange={(e) => set('companyType', e.target.value)}
                    placeholder="例如：外企 / 国企 / 独角兽"
                    className={controlClass}
                  />
                </Field>
                <Field label="行业">
                  <input
                    value={form.industry}
                    onChange={(e) => set('industry', e.target.value)}
                    placeholder="例如：消费电子 / 新能源 / 互联网"
                    className={controlClass}
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="内推码 / 内推人">
                  <input
                    value={form.referral}
                    onChange={(e) => set('referral', e.target.value)}
                    placeholder="例如：NTAXXXXX"
                    className={controlClass}
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
                <Field label="投递邮箱">
                  <input
                    value={form.applyEmail}
                    onChange={(e) => set('applyEmail', e.target.value)}
                    placeholder="投这家用的邮箱"
                    className={controlClass}
                  />
                </Field>
                <Field label="投递手机号">
                  <input
                    value={form.applyPhone}
                    onChange={(e) => set('applyPhone', e.target.value)}
                    placeholder="投这家用的手机号"
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
            </div>
          )}
        </div>

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
