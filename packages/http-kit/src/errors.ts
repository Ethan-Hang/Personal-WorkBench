/**
 * 领域错误：调用方做错了事，不是服务端坏了。
 *
 * 校验放在 service 而不是 route，是为了让它能被集成测试直接覆盖到；代价是
 * service 抛出的错误默认会落到统一错误出口变成 **500**——那会把「标签重名」
 * 「文件夹重名」「补卡超窗」这类普通的用户输入问题报成服务器故障，
 * 并白白生成一个请求编号。这个类与 `toHttp` 就是那座桥。
 *
 * 本文件此前在 todo / habit / notes 三个模块里各存一份、逐字节相同，
 * 而 campus-recruit 又自成一套（自定义错误类 + 内联 helper，且没有 conflict）。
 * 「刻意各写一份」保住了铁律 1，代价却是**模板长出了两种形状**——下一个模块
 * 照抄时有一半概率抄错那一份。收敛到本包后依赖方向是
 * `modules → http-kit → core`，无环，铁律 1 的措辞随之从「只能依赖 core」
 * 改为「只能依赖 core 与 http-kit」（见 ADR-0024）。
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

/** 与既有数据冲突（重名、版本对不上等）。 */
export function conflict(message: string): DomainError {
  return new DomainError(message, 409);
}

/** 入参本身不合法。 */
export function invalid(message: string): DomainError {
  return new DomainError(message, 400);
}

/**
 * Fastify reply 的最小结构性形状。
 *
 * 刻意不 import fastify 的类型：http-kit 只需要 `code().send()` 这一条能力，
 * 结构类型足以表达，也就不必让本包多背一个运行时依赖。
 */
export interface ReplyLike {
  /** `body` 可省略：204 要发的正是一个空 body。 */
  code(status: number): { send(body?: unknown): unknown };
}

/**
 * 把领域错误变成 4xx 响应，其余错误原样抛出交给统一错误出口。
 *
 * **不要在这里吞掉未知错误**——真正的服务端故障必须继续冒泡，
 * 才能拿到请求编号并落进日志。
 */
export async function toHttp<T>(reply: ReplyLike, run: () => Promise<T>): Promise<T | unknown> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof DomainError) {
      return reply.code(error.status).send({ error: error.message });
    }
    throw error;
  }
}
