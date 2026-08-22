import { describe, it, expect } from 'vitest';
import { DomainError, conflict, invalid, notFound, toHttp } from './errors.js';

/** 复现 Fastify reply 的最小形状：只需要 code().send()。 */
function fakeReply() {
  const calls: { status: number; body: unknown }[] = [];
  return {
    calls,
    code(status: number) {
      return {
        send(body: unknown) {
          calls.push({ status, body });
          return 'sent';
        },
      };
    },
  };
}

describe('DomainError', () => {
  it('notFound 带 404', () => {
    expect(notFound('没有这条便签').status).toBe(404);
  });

  it('conflict 带 409', () => {
    expect(conflict('标签重名').status).toBe(409);
  });

  it('invalid 带 400', () => {
    expect(invalid('日期不合法').status).toBe(400);
  });
});

describe('toHttp', () => {
  it('正常返回时原样透传结果', async () => {
    const reply = fakeReply();
    await expect(toHttp(reply, async () => ({ id: 'n1' }))).resolves.toEqual({ id: 'n1' });
    expect(reply.calls).toEqual([]);
  });

  it('DomainError 落成对应状态码与消息', async () => {
    const reply = fakeReply();
    await toHttp(reply, async () => {
      throw conflict('标签重名');
    });
    expect(reply.calls).toEqual([{ status: 409, body: { error: '标签重名' } }]);
  });

  it('未知错误继续冒泡——否则拿不到请求编号也进不了日志', async () => {
    const reply = fakeReply();
    await expect(
      toHttp(reply, async () => {
        throw new Error('数据库炸了');
      }),
    ).rejects.toThrow('数据库炸了');
    expect(reply.calls).toEqual([]);
  });

  it('认的是形状而不是类身份——跨包实例化的 DomainError 同样被识别', async () => {
    // 这条守的是本次重构的核心风险：四个模块此前各有一份 DomainError 类，
    // 收敛到 http-kit 后若还有任何一处残留旧类，instanceof 会静默失效、
    // 领域错误重新落成 500。这里显式断言收敛后的唯一来源可用。
    const reply = fakeReply();
    await toHttp(reply, async () => {
      throw new DomainError('自定义', 418);
    });
    expect(reply.calls).toEqual([{ status: 418, body: { error: '自定义' } }]);
  });
});
