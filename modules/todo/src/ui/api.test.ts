import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { postComplete, postTask } from './api.js';

/**
 * 传输层契约测试。
 *
 * 起因：complete 请求没有 body，但 request() 曾无条件加上
 * `Content-Type: application/json`，Fastify 的默认 JSON 解析器因此以
 * FST_ERR_CTP_EMPTY_JSON_BODY 拒绝（400）。页面上表现为「勾选没反应」——
 * 因为 complete 的 mutation 当时没有错误出口。
 *
 * 路由测试没抓到，是因为 `app.inject({ method, url })` 不带任何 header，
 * 跑的是浏览器永远不会发出的请求形状。所以守卫必须放在客户端这一侧。
 */

type CapturedCall = { url: string; init: RequestInit | undefined };

let calls: CapturedCall[];
let originalFetch: typeof globalThis.fetch;

function headerOf(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

beforeEach(() => {
  calls = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(
      new Response(
        JSON.stringify({
          id: 'x1',
          title: '做完它',
          sourceModule: 'todo',
          kind: 'task',
          status: 'done',
          importance: 'normal',
          dueAt: null,
          scheduled: { kind: 'all-day', date: '2026-09-20' },
          urgency: 'none',
          priorityScore: 10,
          isImportantQuadrant: false,
          isUrgentQuadrant: false,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('request 的 Content-Type 处理', () => {
  it('无 body 的请求不得声明 JSON content-type', async () => {
    await postComplete('x1');

    expect(calls).toHaveLength(1);
    expect(calls[0]!.init?.body).toBeUndefined();
    expect(headerOf(calls[0]!.init, 'Content-Type')).toBeNull();
  });

  it('有 body 的请求必须声明 JSON content-type', async () => {
    await postTask({ title: '写周报', importance: 'high', dueDate: null });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.init?.body).toBe(
      JSON.stringify({ title: '写周报', importance: 'high', dueDate: null }),
    );
    expect(headerOf(calls[0]!.init, 'Content-Type')).toBe('application/json');
  });

  it('响应视图包含来源模块', async () => {
    const task = await postComplete('x1');

    expect(task.sourceModule).toBe('todo');
  });
});

describe('错误信息携带请求编号', () => {
  function respondWith(status: number, payload: unknown): void {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify(payload), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      )) as typeof globalThis.fetch;
  }

  it('服务端给了编号时，把编号带进错误消息', async () => {
    respondWith(500, { error: '数据库连接断了', requestId: 'req-42' });

    // 编号是界面报错与日志堆栈之间唯一的桥，丢了它就只能靠猜。
    await expect(postComplete('x1')).rejects.toThrow('数据库连接断了（编号 req-42）');
  });

  it('没有编号时不凭空编造', async () => {
    respondWith(400, { error: '标题不能为空' });

    await expect(postComplete('x1')).rejects.toThrow('标题不能为空');
    await expect(postComplete('x1')).rejects.not.toThrow('编号');
  });
});
