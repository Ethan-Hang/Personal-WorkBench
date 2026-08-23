/**
 * 模块 UI 的共享传输层。
 *
 * 此前五个模块的 `ui/api.ts` 各写一份 `request()`，实测差异 100% 是写法层面
 * （campus-recruit 用三元求 body、可选链取 `payload?.error`，todo 用早返回、
 * 非可选链；habit 那份与 todo 逐字节相同），0% 是行为层面。
 * CLAUDE.md 自己定的抽取门槛是「第三个模块出现时」，实际拖到了第五个。
 *
 * 收敛的实际收益不是少写几行，而是**那条 415 教训只需要守一次**：
 * 无 body 的 POST 若被无条件加上 `Content-Type: application/json`，
 * Fastify 的默认 JSON 解析器会以 FST_ERR_CTP_EMPTY_JSON_BODY 拒绝（400），
 * 而 `app.inject({ method, url })` 复现不了这个形状——服务端测试一路绿灯，
 * 浏览器里必挂。守卫因此必须在客户端这一侧，见 http.test.ts。
 *
 * 它放在 `packages/ui` 而不是新开一个包：模块本就依赖 ui，不必再开第二个
 * 铁律 1 的例外（ADR-0024 已写明 http-kit 是唯一的那个）。
 *
 * **本模块不做 schema 校验。** 响应形状的校验属于各模块 `contract.ts` 的
 * Zod schema，调用方拿到结果后自己 `.parse()`——那是前后端接缝的位置，
 * 不该被传输层吞掉。
 */

interface ErrorPayload {
  error?: string;
  requestId?: string;
}

/**
 * 发一个 JSON API 请求。
 *
 * - 有 body 才加 `Content-Type`，且不覆盖调用方已经给出的 header；
 * - `204` 返回 `null`（没有 body 可解析）；
 * - 失败时抛 `Error`，消息里带上服务端的请求编号（若有）。
 */
export async function apiRequest(url: string, init: RequestInit = {}): Promise<unknown> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...init, headers });
  if (res.status === 204) return null;

  // 响应体可能根本不是 JSON（网关的 HTML 错误页）。让解析异常冒出去的话，
  // 用户看到的会是 "Unexpected token <"，与真正的故障毫无关系。
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const payload = body as ErrorPayload;
    const message = payload.error ?? `请求失败（${res.status}）`;
    throw new Error(
      payload.requestId === undefined ? message : `${message}（编号 ${payload.requestId}）`,
    );
  }

  return body;
}

/** `POST` / `PATCH` / `PUT` 的 JSON body 快捷构造。 */
export function jsonBody(method: 'POST' | 'PATCH' | 'PUT', body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}
