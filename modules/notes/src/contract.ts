/**
 * 便签模块的前后端接缝。**服务端与客户端共用这一份**——端点路径与请求/响应形状
 * 都只在这里定义，因此不可能各改一半（设计 §3）。
 *
 * TASK-060 只落地「数据层需要的常量」；端点与 Zod 形状由 TASK-061 补齐。
 */

export const NOTES_MODULE_ID = 'notes';

/**
 * 便签的三种生命状态。
 *
 * - `active`：正常可见
 * - `archived`：归档，退出主列表但不进回收站
 * - `trashed`：在回收站中，`trashedAt` 记录进站时刻
 *
 * **刻意不借用 core 的 `cancelled`。** todo 的回收站借了那个枚举值，代价是
 * `cancelled` 的含义变成依模块而定（ADR-0009 明确写着「这不是可以照抄的模式」）。
 * 便签有自己的主表，状态就存在自己的列里，core 一个字都不用知道。
 */
export const NOTE_STATUSES = ['active', 'archived', 'trashed'] as const;
export type NoteStatus = (typeof NOTE_STATUSES)[number];

/**
 * 便签主题色。存的是**语义色名**而不是十六进制——具体颜色由主题层决定，
 * 深浅色主题各自解释（与 habit 的 `colorToken` 同一条约定）。
 */
export const NOTE_COLORS = ['yellow', 'green', 'blue', 'purple', 'pink', 'gray'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

/** 摘要长度：正文去掉 Markdown 标记后的前 120 个字符。 */
export const EXCERPT_LENGTH = 120;

export const NOTE_TITLE_MAX = 200;
export const FOLDER_NAME_MAX = 60;
export const TAG_NAME_MAX = 32;
