import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { conflict } from './errors.js';
import { defineRoute } from './defineRoute.js';

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

const idParams = z.object({ id: z.string().min(1) });
const titleBody = z.object({ title: z.string().min(1, '标题不能为空') });

describe('defineRoute', () => {
  it('无 schema 时直接透传 handler 结果', async () => {
    const handler = defineRoute({}, async () => ({ ok: true }));
    const reply = fakeReply();
    await expect(handler({}, reply)).resolves.toEqual({ ok: true });
    expect(reply.calls).toEqual([]);
  });

  it('把校验过的 params 与 body 交给 handler', async () => {
    const handler = defineRoute(
      { params: idParams, body: titleBody },
      async ({ params, body }) => ({
        id: params.id,
        title: body.title,
      }),
    );
    const reply = fakeReply();
    await expect(
      handler({ params: { id: 'n1' }, body: { title: '会议纪要' } }, reply),
    ).resolves.toEqual({ id: 'n1', title: '会议纪要' });
  });

  it('body 不合法时回 400，并用第一条 issue 的消息', async () => {
    const handler = defineRoute({ body: titleBody }, async () => 'never');
    const reply = fakeReply();
    await handler({ body: { title: '' } }, reply);
    expect(reply.calls).toEqual([{ status: 400, body: { error: '标题不能为空' } }]);
  });

  it('params 不合法时回 400，且不执行 handler', async () => {
    let ran = false;
    const handler = defineRoute({ params: idParams }, async () => {
      ran = true;
      return 'never';
    });
    const reply = fakeReply();
    await handler({ params: { id: '' } }, reply);
    expect(reply.calls[0]?.status).toBe(400);
    expect(ran).toBe(false);
  });

  it('params 先于 body 校验——路径错时不该报 body 的错', async () => {
    const handler = defineRoute({ params: idParams, body: titleBody }, async () => 'never');
    const reply = fakeReply();
    await handler({ params: { id: '' }, body: { title: '' } }, reply);
    expect(reply.calls[0]?.body).not.toEqual({ error: '标题不能为空' });
  });

  it('缺 body 与传空对象走同一条路——报字段级错误，而不是「期望对象，收到 undefined」', async () => {
    // notes 的 createTodo 原本手写 `request.body ?? {}` 才拿到这个行为；
    // 收进 defineRoute 后所有路由一致。
    const handler = defineRoute({ body: titleBody }, async () => 'never');

    const missing = fakeReply();
    await handler({}, missing);
    const empty = fakeReply();
    await handler({ body: {} }, empty);

    expect(missing.calls).toEqual(empty.calls);
    expect(missing.calls[0]?.status).toBe(400);
    expect(String((missing.calls[0]?.body as { error: string }).error)).not.toContain('object');
  });

  it('可选 body 全缺省时 handler 照常执行', async () => {
    const optionalBody = z.object({ title: z.string().optional() });
    const handler = defineRoute({ body: optionalBody }, async ({ body }) => body);
    const reply = fakeReply();
    await expect(handler({}, reply)).resolves.toEqual({});
  });

  it('校验 query', async () => {
    const handler = defineRoute(
      { query: z.object({ keyword: z.string() }) },
      async ({ query }) => query.keyword,
    );
    const reply = fakeReply();
    await expect(handler({ query: { keyword: '周报' } }, reply)).resolves.toBe('周报');
  });

  it('status 201 时用 reply.code(201).send(结果)', async () => {
    const handler = defineRoute({ body: titleBody, status: 201 }, async ({ body }) => ({
      title: body.title,
    }));
    const reply = fakeReply();
    await handler({ body: { title: '新便签' } }, reply);
    expect(reply.calls).toEqual([{ status: 201, body: { title: '新便签' } }]);
  });

  it('status 204 时发空 body', async () => {
    const handler = defineRoute({ params: idParams, status: 204 }, async () => undefined);
    const reply = fakeReply();
    await handler({ params: { id: 'n1' } }, reply);
    expect(reply.calls).toEqual([{ status: 204, body: undefined }]);
  });

  it('handler 抛 DomainError 时落成 4xx', async () => {
    const handler = defineRoute({}, async () => {
      throw conflict('标签重名');
    });
    const reply = fakeReply();
    await handler({}, reply);
    expect(reply.calls).toEqual([{ status: 409, body: { error: '标签重名' } }]);
  });

  it('handler 抛未知错误时继续冒泡', async () => {
    const handler = defineRoute({}, async () => {
      throw new Error('数据库炸了');
    });
    const reply = fakeReply();
    await expect(handler({}, reply)).rejects.toThrow('数据库炸了');
    expect(reply.calls).toEqual([]);
  });
});
