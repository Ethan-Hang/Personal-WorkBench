/**
 * 领域错误：调用方做错了事，不是服务端坏了。
 *
 * 校验放在 service 而不是 route，是为了让它能被集成测试直接覆盖到；代价是
 * service 抛出的错误默认会落到统一错误出口变成 **500**——那会把「习惯重名」
 * 「补卡超窗」这类普通的用户输入问题报成服务器故障，并白白生成一个请求编号。
 * 这个类与 `toHttp` 就是那座桥。
 *
 * 与 `modules/todo/src/server/errors.ts` 刻意各写一份：铁律 1 禁止模块间依赖，
 * 而这段代码短到不值得为它在 core 里开一个能力槽。
 */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

/** 目标不存在。 */
export function notFound(message: string): DomainError {
  return new DomainError(message, 404);
}

/** 与既有数据冲突（重名等）。 */
export function conflict(message: string): DomainError {
  return new DomainError(message, 409);
}

/** 入参本身不合法。 */
export function invalid(message: string): DomainError {
  return new DomainError(message, 400);
}

/**
 * 把领域错误变成 4xx 响应，其余错误原样抛出交给统一错误出口。
 *
 * **不要在这里吞掉未知错误**——真正的服务端故障必须继续冒泡，
 * 才能拿到请求编号并落进日志。
 */
export async function toHttp<T>(
  reply: { code(status: number): { send(body: unknown): unknown } },
  run: () => Promise<T>,
): Promise<T | unknown> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof DomainError) {
      return reply.code(error.status).send({ error: error.message });
    }
    throw error;
  }
}
