import { describe, it, expect } from 'vitest';
import {
  ID_PARAM,
  TODO_API,
  batchIdsInputSchema,
  createTaskInputSchema,
  taskViewSchema,
  updateTaskInputSchema,
  taskViewSchema,
} from './contract.js';

describe('createTaskInputSchema', () => {
  it('填上默认值', () => {
    expect(createTaskInputSchema.parse({ title: '写周报' })).toEqual({
      title: '写周报',
      importance: 'normal',
      dueDate: null,
    });
  });

  it('去掉标题首尾空白', () => {
    expect(createTaskInputSchema.parse({ title: '  写周报  ' }).title).toBe('写周报');
  });

  it('拒绝空标题', () => {
    expect(() => createTaskInputSchema.parse({ title: '   ' })).toThrow();
  });

  it('拒绝非 YYYY-MM-DD 的日期', () => {
    expect(() => createTaskInputSchema.parse({ title: 'x', dueDate: '2026/09/20' })).toThrow();
  });

  it('接受合法日期 YYYY-MM-DD', () => {
    expect(createTaskInputSchema.parse({ title: 'x', dueDate: '2026-09-20' }).dueDate).toBe(
      '2026-09-20',
    );
  });

  it('接受带时分的截止时间 YYYY-MM-DD HH:mm', () => {
    expect(createTaskInputSchema.parse({ title: 'x', dueDate: '2026-09-20 15:30' }).dueDate).toBe(
      '2026-09-20 15:30',
    );
  });
});

describe('updateTaskInputSchema', () => {
  it('接受部分更新', () => {
    expect(updateTaskInputSchema.parse({ title: '新标题', importance: 'high' })).toEqual({
      title: '新标题',
      importance: 'high',
    });
  });

  it('接受置空 dueDate', () => {
    expect(updateTaskInputSchema.parse({ dueDate: null })).toEqual({
      dueDate: null,
    });
  });
});

describe('batchIdsInputSchema', () => {
  it('至少需要 1 个 id', () => {
    expect(() => batchIdsInputSchema.parse({ ids: [] })).toThrow();
    expect(batchIdsInputSchema.parse({ ids: ['id-1', 'id-2'] })).toEqual({
      ids: ['id-1', 'id-2'],
    });
  });
});

describe('taskViewSchema', () => {
  it('支持包含 kind 字段，并默认回退为 task', () => {
    const raw = {
      id: 't-1',
      title: '测试任务',
      sourceModule: 'todo',
      status: 'todo',
      importance: 'normal',
      dueAt: null,
      scheduled: null,
      urgency: 'none',
      priorityScore: 0,
      isImportantQuadrant: false,
      isUrgentQuadrant: false,
    };
    const parsed = taskViewSchema.parse(raw);
    expect(parsed.kind).toBe('task');
  });
});

describe('TODO_API 端点定义', () => {
  it('传占位符得到 Fastify 注册用的模式', () => {
    expect(TODO_API.completeTask(ID_PARAM)).toBe('/api/todo/tasks/:id/complete');
    expect(TODO_API.uncompleteTask(ID_PARAM)).toBe('/api/todo/tasks/:id/uncomplete');
    expect(TODO_API.trashTask(ID_PARAM)).toBe('/api/todo/tasks/:id/trash');
    expect(TODO_API.restoreTask(ID_PARAM)).toBe('/api/todo/tasks/:id/restore');
    expect(TODO_API.task(ID_PARAM)).toBe('/api/todo/tasks/:id');
  });

  it('传真实 id 得到转义后的请求路径', () => {
    expect(TODO_API.completeTask('a b/c')).toBe('/api/todo/tasks/a%20b%2Fc/complete');
    expect(TODO_API.uncompleteTask('a b/c')).toBe('/api/todo/tasks/a%20b%2Fc/uncomplete');
    expect(TODO_API.task('a b/c')).toBe('/api/todo/tasks/a%20b%2Fc');
  });

  it('占位符不得被转义', () => {
    expect(TODO_API.completeTask(ID_PARAM)).toContain(':id');
    expect(TODO_API.completeTask(ID_PARAM)).not.toContain('%3A');
  });
});

describe('taskViewSchema 的 kind 字段', () => {
  it('接受带 kind 的形状', () => {
    const parsed = taskViewSchema.parse({
      id: 'a',
      title: '写周报',
      sourceModule: 'todo',
      kind: 'task',
      status: 'todo',
      importance: 'normal',
      notes: null,
      dueAt: null,
      scheduled: { kind: 'all-day', date: '2026-08-18' },
      subtasks: [],
      tags: [],
      recurrenceId: null,
      urgency: 'none',
      priorityScore: 1,
      isImportantQuadrant: false,
      isUrgentQuadrant: false,
    });
    expect(parsed.kind).toBe('task');
  });

  it('缺少 kind 时拒绝——这正是六个写操作曾经必抛的那道缝', () => {
    const withoutKind = {
      id: 'a',
      title: '写周报',
      sourceModule: 'todo',
      status: 'todo',
      importance: 'normal',
      dueAt: null,
      scheduled: null,
      urgency: 'none',
      priorityScore: 1,
      isImportantQuadrant: false,
      isUrgentQuadrant: false,
    };
    expect(taskViewSchema.safeParse(withoutKind).success).toBe(false);
  });
});

describe('备注（notes）', () => {
  it('createTaskInputSchema 不传 notes 时为 undefined，服务端会归一成 null', () => {
    expect(createTaskInputSchema.parse({ title: '写周报' }).notes).toBeUndefined();
  });

  it('备注会被 trim', () => {
    expect(createTaskInputSchema.parse({ title: '写周报', notes: '  带身份证  ' }).notes).toBe(
      '带身份证',
    );
  });

  it('超过 2000 字被拒', () => {
    const tooLong = 'x'.repeat(2001);
    expect(createTaskInputSchema.safeParse({ title: '写周报', notes: tooLong }).success).toBe(
      false,
    );
  });

  it('updateTaskInputSchema 缺省时 notes 为 undefined，表示不动它', () => {
    expect(updateTaskInputSchema.parse({ title: '改标题' }).notes).toBeUndefined();
  });

  it('updateTaskInputSchema 允许显式传 null 以清空', () => {
    expect(updateTaskInputSchema.parse({ notes: null }).notes).toBeNull();
  });

  it('taskViewSchema 透出 notes', () => {
    const parsed = taskViewSchema.parse({
      id: 'a',
      title: '写周报',
      sourceModule: 'todo',
      kind: 'task',
      status: 'todo',
      importance: 'normal',
      dueAt: null,
      notes: '带身份证',
      scheduled: null,
      subtasks: [],
      tags: [],
      recurrenceId: null,
      urgency: 'none',
      priorityScore: 1,
      isImportantQuadrant: false,
      isUrgentQuadrant: false,
    });
    expect(parsed.notes).toBe('带身份证');
  });
});
