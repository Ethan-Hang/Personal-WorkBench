/**
 * `@workbench/http-kit` —— 模块服务端的路由胶水。
 *
 * 这是**模块被允许依赖的第二个包**（第一个是 `@workbench/core`）。
 * 依赖方向 `modules → http-kit → core`，与组合根的 `server → modules` 不成环。
 *
 * 它只装两样东西，都是原先在四个模块里各写一份的：
 *
 * - `DomainError` 与 `toHttp`：让领域校验错误落成 4xx 而不是 500；
 * - `defineRoute`：吃掉「safeParse → 400 → 调 service → toHttp」这套四步样板。
 *
 * **不要往这里塞业务。** 它对任何模块的领域概念都应当一无所知——一旦这里出现
 * 「便签」「习惯」这类词，铁律 2「core 永不感知模块」的同一条道理就在本包破了。
 * 判据见 ADR-0024。
 */
export { DomainError, conflict, invalid, notFound, toHttp, type ReplyLike } from './errors.js';
export { defineRoute, type RequestLike, type RouteSpec } from './defineRoute.js';
