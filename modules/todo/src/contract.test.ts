import { describe, it, expect } from 'vitest';
import {
  ID_PARAM,
  TODO_API,
  batchIdsInputSchema,
  createTaskInputSchema,
  updateTaskInputSchema,
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

  it('接受合法日期', () => {
    expect(createTaskInputSchema.parse({ title: 'x', dueDate: '2026-09-20' }).dueDate).toBe(
      '2026-09-20',
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
