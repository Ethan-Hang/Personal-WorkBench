import { describe, it, expect } from 'vitest';
import { RETENTION_MAX, RETENTION_MIN, parseRetentionCount } from './backupForm.js';

describe('parseRetentionCount', () => {
  it('正常数字原样通过', () => {
    expect(parseRetentionCount('7', 10)).toEqual({ ok: true, value: 7 });
    expect(parseRetentionCount(7, 10)).toEqual({ ok: true, value: 7 });
  });

  it('留空视为「用默认值」——这是唯一一种该回退的情形', () => {
    expect(parseRetentionCount('', 10)).toEqual({ ok: true, value: 10 });
    expect(parseRetentionCount('   ', 5)).toEqual({ ok: true, value: 5 });
  });

  it('0 报错，而不是被静默改写成默认值', () => {
    // 收敛前两个面板都写 `Number(formRetention) || 10`：0 是 falsy，
    // 于是用户输入 0 会被悄悄存成 10，界面还弹「已保存」。
    // 服务端 schema 是 min(1)，它本会拒绝——但请求根本没带着 0 发出去。
    expect(parseRetentionCount('0', 10)).toMatchObject({ ok: false });
  });

  it('非数字报错，而不是被静默改写成默认值', () => {
    // 同上：Number('abc') 是 NaN，NaN || 10 得到 10。
    expect(parseRetentionCount('abc', 10)).toMatchObject({ ok: false });
  });

  it('小数报错——保留份数只能是整数', () => {
    expect(parseRetentionCount('2.5', 10)).toMatchObject({ ok: false });
  });

  it('越界报错，边界与服务端 schema 一致', () => {
    // packages/sync/src/contract.ts: z.number().int().min(1).max(100)
    // 客户端先挡一道，用户不必等一个 400 才知道填错了。
    expect(parseRetentionCount(String(RETENTION_MIN), 10)).toEqual({
      ok: true,
      value: RETENTION_MIN,
    });
    expect(parseRetentionCount(String(RETENTION_MAX), 10)).toEqual({
      ok: true,
      value: RETENTION_MAX,
    });
    expect(parseRetentionCount(String(RETENTION_MIN - 1), 10)).toMatchObject({ ok: false });
    expect(parseRetentionCount(String(RETENTION_MAX + 1), 10)).toMatchObject({ ok: false });
  });

  it('负数报错', () => {
    expect(parseRetentionCount('-3', 10)).toMatchObject({ ok: false });
  });

  it('报错时给的是能直接显示的中文消息', () => {
    const result = parseRetentionCount('0', 10);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('保留份数');
      expect(result.error).toContain(String(RETENTION_MIN));
    }
  });
});
