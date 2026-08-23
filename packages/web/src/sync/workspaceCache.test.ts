import { describe, it, expect } from 'vitest';
import {
  invalidateFor,
  WORKSPACE_CHANGE_POLICY,
  type WorkspaceChange,
  type InvalidatingClient,
} from './workspaceCache.js';

function fakeClient() {
  const calls: (unknown[] | undefined)[] = [];
  const client: InvalidatingClient = {
    invalidateQueries(...args: unknown[]) {
      calls.push(args.length === 0 ? undefined : args);
      return Promise.resolve();
    },
  };
  return { client, calls };
}

describe('工作区缓存失效策略', () => {
  it('每一种变化都必须有明文策略——不许有漏网的事件', () => {
    // 这条守的是「新加一种变化时忘了定策略」：TypeScript 的 Record 会要求补齐，
    // 这里再断言一次运行期确实每个键都在。
    const changes: WorkspaceChange[] = [
      'active-database-changed',
      'account-metadata-changed',
      'settings-pulled',
      'manual-cache-clear',
    ];
    for (const change of changes) {
      expect(WORKSPACE_CHANGE_POLICY[change]).toBeDefined();
    }
  });

  it('换库一律全量失效——缓存里每一条都属于另一个库了', async () => {
    const { client, calls } = fakeClient();
    await invalidateFor(client, 'active-database-changed');

    // 不带 filters 即全量。漏掉这一次的症状是「数据串了」，
    // 且因乐观更新会以很难复现的方式间歇出现。
    expect(calls).toEqual([undefined]);
  });

  it('账号元数据变化目前同样全量失效', async () => {
    // ADR-0019：绑定 / 解绑 GitHub 是纯元数据操作，一个库文件都不动，
    // 理论上只需失效 ['accounts']。这里刻意维持现状的全量失效，
    // 因为收窄需要先确认没有派生查询依赖账号元数据——那是一次单独的、
    // 需要验证的改动，不该混在本次收敛里悄悄发生。
    const { client, calls } = fakeClient();
    await invalidateFor(client, 'account-metadata-changed');

    expect(calls).toEqual([undefined]);
  });

  it('拉取云端设置后全量失效', async () => {
    const { client, calls } = fakeClient();
    await invalidateFor(client, 'settings-pulled');

    expect(calls).toEqual([undefined]);
  });

  it('用户手动清缓存是一次显式的全量失效', async () => {
    const { client, calls } = fakeClient();
    await invalidateFor(client, 'manual-cache-clear');

    expect(calls).toEqual([undefined]);
  });

  it('返回的是 promise，调用方 await 得到的是「失效已完成」', async () => {
    // 切账号后若不等失效完成就渲染，会闪一下上一个账号的数据。
    const { client } = fakeClient();
    await expect(invalidateFor(client, 'active-database-changed')).resolves.toBeUndefined();
  });
});
