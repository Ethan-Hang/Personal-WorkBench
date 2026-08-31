import { useState, type FormEvent } from 'react';
import { Button } from '@workbench/ui';

export function PasswordPrompt({
  incorrect,
  onCancel,
  onSubmit,
}: {
  incorrect: boolean;
  onCancel: () => void;
  onSubmit: (password: string) => void;
}) {
  const [password, setPassword] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!password) return;
    onSubmit(password);
    setPassword('');
  };

  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-page/80 px-4 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="w-full max-w-sm border-y border-line bg-surface px-1 py-6 shadow-xl sm:border sm:px-6"
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent">加密 PDF</p>
        <h2 className="mt-2 text-lg font-bold text-ink">输入文档密码</h2>
        <p className="mt-2 text-xs leading-5 text-secondary">
          密码只保存在当前阅读会话，关闭标签后即清除。
        </p>
        <label className="mt-5 block text-xs font-semibold text-ink" htmlFor="reader-password">
          密码
        </label>
        <input
          id="reader-password"
          type="password"
          autoFocus
          autoComplete="off"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-2 w-full rounded-control border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
        {incorrect && <p className="mt-2 text-xs text-critical">密码不正确，请重试。</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" onClick={onCancel}>
            返回
          </Button>
          <Button type="submit" variant="primary" disabled={!password}>
            打开文档
          </Button>
        </div>
      </form>
    </div>
  );
}
