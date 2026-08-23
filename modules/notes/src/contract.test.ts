import { describe, expect, it } from 'vitest';
import {
  BATCH_MAX_IDS,
  ID_PARAM,
  NOTES_API_V1,
  NOTES_MODULE_ID,
  NOTES_PAGE_LIMIT_MAX,
  TODO_ID_PARAM,
  batchInputSchema,
  createNoteInputSchema,
  listNotesQuerySchema,
  updateNoteInputSchema,
} from './contract.js';

describe('NOTES_API_V1', () => {
  it('把 ID_PARAM 原样透出，作为 Fastify 注册模式', () => {
    expect(NOTES_API_V1.note(ID_PARAM)).toBe('/api/v1/notes/:id');
    expect(NOTES_API_V1.todoLink(ID_PARAM, TODO_ID_PARAM)).toBe('/api/v1/notes/:id/todos/:todoId');
  });

  it('把真实 id 转义，作为客户端请求路径', () => {
    expect(NOTES_API_V1.note('a/b')).toBe('/api/v1/notes/a%2Fb');
    expect(NOTES_API_V1.createTodo('a b')).toBe('/api/v1/notes/a%20b/create-todo');
  });

  it('所有路径都带版本段并挂在本模块的命名空间下', () => {
    expect(NOTES_MODULE_ID).toBe('notes');
    for (const path of [
      NOTES_API_V1.notes,
      NOTES_API_V1.folders,
      NOTES_API_V1.batch,
      NOTES_API_V1.trash,
      NOTES_API_V1.tags,
      NOTES_API_V1.stats,
    ]) {
      expect(path).toMatch(/^\/api\/v1\/notes/);
    }
  });

  it('静态段与参数段不会撞车：folders / tags / stats 都是具体路径', () => {
    // Fastify 的基数树把静态段排在参数段之前，所以这几条不会被 :id 抢走。
    // 真正会出事的是它们**长得像** id——这条断言把「有人把 folders 改成
    // /api/v1/notes/:id/folders」挡在门外。
    expect(NOTES_API_V1.folders).not.toContain(':');
    expect(NOTES_API_V1.tags).not.toContain(':');
  });
});

describe('入参形状', () => {
  it('列表 limit 有上限，挡住 ?limit=100000', () => {
    expect(listNotesQuerySchema.safeParse({ limit: '999999' }).success).toBe(false);
    expect(listNotesQuerySchema.parse({ limit: String(NOTES_PAGE_LIMIT_MAX) }).limit).toBe(
      NOTES_PAGE_LIMIT_MAX,
    );
  });

  it('列表的布尔开关来自 query string，是字符串不是布尔', () => {
    const parsed = listNotesQuerySchema.parse({ includeDescendants: 'true', pinnedOnly: 'false' });
    expect(parsed.includeDescendants).toBe(true);
    expect(parsed.pinnedOnly).toBe(false);
  });

  it('不传任何东西时 limit 有默认值', () => {
    expect(listNotesQuerySchema.parse({}).limit).toBeGreaterThan(0);
  });

  it('更新至少要改一个字段——只带 revision 不算', () => {
    expect(updateNoteInputSchema.safeParse({ revision: 3 }).success).toBe(false);
    expect(updateNoteInputSchema.safeParse({ revision: 3, title: '改了' }).success).toBe(true);
  });

  it('批量管道的 ids 有上限，且动作是 discriminated union', () => {
    const tooMany = Array.from({ length: BATCH_MAX_IDS + 1 }, (_, index) => `n${index}`);
    expect(batchInputSchema.safeParse({ ids: tooMany, action: { kind: 'trash' } }).success).toBe(
      false,
    );
    // move 必须带 folderId（可以是 null，但不能缺）
    expect(batchInputSchema.safeParse({ ids: ['a'], action: { kind: 'move' } }).success).toBe(
      false,
    );
    expect(
      batchInputSchema.safeParse({ ids: ['a'], action: { kind: 'move', folderId: null } }).success,
    ).toBe(true);
    expect(batchInputSchema.safeParse({ ids: ['a'], action: { kind: '不存在' } }).success).toBe(
      false,
    );
  });

  it('metadata 必须是 JSON 对象，不是任意字符串', () => {
    expect(createNoteInputSchema.safeParse({ metadata: '随便什么' }).success).toBe(false);
    expect(createNoteInputSchema.safeParse({ metadata: { caret: 12 } }).success).toBe(true);
  });

  it('颜色是白名单，拼错会在接缝处大声失败', () => {
    expect(createNoteInputSchema.safeParse({ color: 'chartreuse' }).success).toBe(false);
    expect(createNoteInputSchema.safeParse({ color: 'blue' }).success).toBe(true);
  });
});
