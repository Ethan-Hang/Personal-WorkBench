import type { ZodError, ZodType, output } from 'zod';
import { type ReplyLike, toHttp } from './errors.js';

/**
 * Fastify request 的最小结构性形状。与 `ReplyLike` 同理，只取用得到的三个槽。
 */
export interface RequestLike {
  params?: unknown;
  body?: unknown;
  query?: unknown;
}

/** 有 schema 就是它的输出类型，没有就是 undefined。 */
type Parsed<S> = S extends ZodType ? output<S> : undefined;

export interface RouteSpec<P extends ZodType, B extends ZodType, Q extends ZodType> {
  params?: P;
  body?: B;
  query?: Q;
  /**
   * 成功时的状态码。
   *
   * 省略 = 直接返回 handler 的结果，由 Fastify 按 200 序列化；
   * `201` = `reply.code(201).send(结果)`；
   * `204` = `reply.code(204).send()`，handler 的返回值被丢弃。
   */
  status?: number;
}

function badRequest(reply: ReplyLike, error: ZodError): unknown {
  return reply.code(400).send({ error: error.issues[0]?.message ?? '请求不合法' });
}

/**
 * 把「校验入参 → 不合法回 400 → 调 service → 领域错误落 4xx」这套四步样板收成一个接缝。
 *
 * 收敛前五个模块的 `routes.ts` 合计 843 行、`safeParse` 出现 72 处，每个 handler
 * 都是同一套动作的手抄；路由层因此是 shallow 的——interface 与 implementation
 * 几乎一样宽。收敛后 `routes.ts` 退化成「路径 ↔ service」的对照表，400 的响应形状
 * 也不可能再各写各的。
 *
 * 三条承重细节：
 *
 * - **params 先于 query 先于 body 校验。** 路径就错了还去报 body 的错，
 *   会把调用方引向错误的地方。
 * - **缺 body 时按 `{}` 校验**，因而报的是字段级消息而不是「期望对象，收到 undefined」。
 *   notes 的 `createTodo` 原本手写 `request.body ?? {}` 才拿到这个行为，现在是所有路由的默认。
 * - **未知错误继续冒泡**（经 `toHttp`），否则拿不到请求编号也进不了日志。
 */
export function defineRoute<
  P extends ZodType = never,
  B extends ZodType = never,
  Q extends ZodType = never,
  R = unknown,
>(
  spec: RouteSpec<P, B, Q>,
  handler: (input: { params: Parsed<P>; body: Parsed<B>; query: Parsed<Q> }) => Promise<R>,
): (request: RequestLike, reply: ReplyLike) => Promise<unknown> {
  return async (request, reply) => {
    let params: unknown;
    let query: unknown;
    let body: unknown;

    if (spec.params) {
      const result = spec.params.safeParse(request.params);
      if (!result.success) return badRequest(reply, result.error);
      params = result.data;
    }
    if (spec.query) {
      const result = spec.query.safeParse(request.query);
      if (!result.success) return badRequest(reply, result.error);
      query = result.data;
    }
    if (spec.body) {
      const result = spec.body.safeParse(request.body ?? {});
      if (!result.success) return badRequest(reply, result.error);
      body = result.data;
    }

    return toHttp(reply, async () => {
      const value = await handler({
        params,
        query,
        body,
      } as { params: Parsed<P>; body: Parsed<B>; query: Parsed<Q> });

      if (spec.status === undefined) return value;
      if (spec.status === 204) return reply.code(204).send();
      return reply.code(spec.status).send(value);
    });
  };
}
