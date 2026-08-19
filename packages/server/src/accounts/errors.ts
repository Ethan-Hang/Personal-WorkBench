/**
 * 账号领域错误。
 *
 * 与 `modules/todo/src/server/errors.ts` 同源的判断：校验放在 service（好被集成测试
 * 直接覆盖），代价是抛出的错误默认会落到统一错误出口变成 500。这里给它带上
 * `statusCode`，app.ts 的错误出口照常带上请求编号返回。
 *
 * **未知错误必须继续冒泡**——不要在 service 里 catch 成通用消息。
 */
export class AccountError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AccountError';
  }
}

export function notFound(message: string): AccountError {
  return new AccountError(404, message);
}

export function conflict(message: string): AccountError {
  return new AccountError(409, message);
}

export function badRequest(message: string): AccountError {
  return new AccountError(400, message);
}
