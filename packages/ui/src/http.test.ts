import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { apiRequest } from './http.js';

/**
 * 共享传输层的契约测试。
 *
 * 这份契约此前在五个模块的 `ui/api.ts` 里各存一份实现，只有 todo 那份带着
 * 守卫测试（modules/todo/src/ui/api.test.ts）。收敛到这里之后，下面每一条
 * 都一次性覆盖全部模块。
 *
 * 最要紧的一条起因：complete 请求没有 body，但 request() 曾无条件加上
 * `Content-Type: application/json`，Fastify 的默认 JSON 解析器因此以
 * FST_ERR_CTP_EMPTY_JSON_BODY 拒绝（400），页面上表现为「勾选没反应」。
 * 路由测试没抓到，是因为 `app.inject({ method, url })` 不带任何 header，
 * 跑的是浏览器永远不会发出的请求形状——所以守卫必须在客户端这一侧。
 */

type CapturedCall = { url: string; init: RequestInit | undefined };

let calls: CapturedCall[];
let originalFetch: typeof globalThis.fetch;

function headerOf(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

function respondWith(status: number, payload: unknown, contentType = 'application/json'): void {
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const body = status === 204 ? null : JSON.stringify(payload);
    return Promise.resolve(
      new Response(body, { status, headers: { 'Content-Type': contentType } }),
    );
  }) as typeof globalThis.fetch;
}

beforeEach(() => {
  calls = [];
  originalFetch = globalThis.fetch;
  respondWith(200, { ok: true });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('apiRequest 的 content-type 处理', () => {
  it('无 body 的请求不得声明 JSON content-type', async () => {
    await apiRequest('/api/todo/tasks/x1/complete', { method: 'POST' });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.init?.body).toBeUndefined();
    expect(headerOf(calls[0]!.init, 'Content-Type')).toBeNull();
  });

  it('有 body 的请求必须声明 JSON content-type', async () => {
    await apiRequest('/api/todo/tasks', { method: 'POST', body: JSON.stringify({ title: 'x' }) });

    expect(headerOf(calls[0]!.init, 'Content-Type')).toBe('application/json');
  });

  it('调用方显式给的 header 不被覆盖', async () => {
    await apiRequest('/api/x', { method: 'POST', body: '<xml/>', headers: { 'X-Trace': 'abc' } });

    expect(headerOf(calls[0]!.init, 'X-Trace')).toBe('abc');
  });
});

describe('apiRequest 的响应处理', () => {
  it('204 返回 null——没有 body 可解析', async () => {
    respondWith(204, null);

    await expect(apiRequest('/api/notes/n1', { method: 'DELETE' })).resolves.toBeNull();
  });

  it('成功时原样返回解析后的 JSON', async () => {
    respondWith(200, { id: 'n1', title: '会议纪要' });

    await expect(apiRequest('/api/notes/n1')).resolves.toEqual({ id: 'n1', title: '会议纪要' });
  });
});

describe('apiRequest 的错误信息', () => {
  it('服务端给了编号时，把编号带进错误消息', async () => {
    // 编号是界面报错与日志堆栈之间唯一的桥，丢了它就只能靠猜。
    respondWith(500, { error: '数据库连接断了', requestId: 'req-42' });

    await expect(apiRequest('/api/x')).rejects.toThrow('数据库连接断了（编号 req-42）');
  });

  it('没有编号时不凭空编造', async () => {
    respondWith(400, { error: '标题不能为空' });

    await expect(apiRequest('/api/x')).rejects.toThrow('标题不能为空');
    await expect(apiRequest('/api/x')).rejects.not.toThrow('编号');
  });

  it('响应体不是 JSON 时退回状态码文案，而不是抛解析错误', async () => {
    // 网关返回 HTML 错误页是常见情形；此时若让 res.json() 的异常冒出去，
    // 用户看到的会是 "Unexpected token <"，与真正的故障毫无关系。
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response('<html>502 Bad Gateway</html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        }),
      )) as typeof globalThis.fetch;

    await expect(apiRequest('/api/x')).rejects.toThrow('请求失败（502）');
  });
});
