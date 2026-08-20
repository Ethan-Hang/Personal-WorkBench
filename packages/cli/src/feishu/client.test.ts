import { describe, expect, it, vi } from 'vitest';
import { FeishuClient } from './client.js';

describe('FeishuClient', () => {
  it('优先使用 userToken 若已提供', async () => {
    const client = new FeishuClient({
      appId: 'test_app_id',
      appSecret: 'test_app_secret',
      userToken: 'u-custom-token-12345',
    });

    const token = await client.getTenantAccessToken();
    expect(token).toBe('u-custom-token-12345');
  });

  it('正确拉取并转换飞书待办结构', async () => {
    const client = new FeishuClient({
      appId: 'test_app_id',
      appSecret: 'test_app_secret',
      userToken: 'test_token',
    });

    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
      return new Response(
        JSON.stringify({
          code: 0,
          msg: 'ok',
          data: {
            items: [
              {
                guid: 'task-001',
                summary: '准备字节跳动技术面',
                description: '复习操作系统与网络',
                due: { timestamp: '1787123400000' },
                completed_at: '0',
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const tasks = await client.listTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.id).toBe('task-001');
    expect(tasks[0]?.summary).toBe('准备字节跳动技术面');
    expect(tasks[0]?.isCompleted).toBe(false);
  });
});
