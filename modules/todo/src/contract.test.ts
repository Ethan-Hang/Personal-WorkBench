import { describe, it, expect } from 'vitest';
import { ID_PARAM, TODO_API, createTaskInputSchema } from './contract.js';

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

describe('TODO_API 端点定义', () => {
  it('传占位符得到 Fastify 注册用的模式', () => {
    expect(TODO_API.completeTask(ID_PARAM)).toBe('/api/todo/tasks/:id/complete');
  });

  it('传真实 id 得到转义后的请求路径', () => {
    expect(TODO_API.completeTask('a b/c')).toBe('/api/todo/tasks/a%20b%2Fc/complete');
  });

  /**
   * 这条守的是一个会静默炸掉的改动：若有人「简化」segment() 去掉占位符直通，
   * ':id' 会被转义成 '%3Aid'，Fastify 于是注册了一个字面量路径——
   * 所有带参数的路由全部失效，且不报任何错。
   */
  it('占位符不得被转义', () => {
    expect(TODO_API.completeTask(ID_PARAM)).toContain(':id');
    expect(TODO_API.completeTask(ID_PARAM)).not.toContain('%3A');
  });
});
