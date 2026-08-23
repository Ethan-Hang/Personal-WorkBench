import { describe, it, expect } from 'vitest';
import { createAutosave, type SaveStatus } from './autosave.js';

/** 手动控制的 promise，用来把「请求在途」这一刻钉死。 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface Draft {
  title: string;
}
interface Result {
  revision: number;
}

/** 记录每次 save 收到的入参，并让测试逐个决定何时完成。 */
function makeHarness(initialRevision = 1) {
  const calls: { draft: Draft; revision: number }[] = [];
  const gates: ReturnType<typeof deferred<Result>>[] = [];
  const statuses: SaveStatus[] = [];
  const saved: Result[] = [];

  const autosave = createAutosave<Draft, Result>({
    initialRevision,
    save(draft, revision) {
      calls.push({ draft, revision });
      const gate = deferred<Result>();
      gates.push(gate);
      return gate.promise;
    },
    revisionOf: (result) => result.revision,
    onStatus: (status) => statuses.push(status),
    onSaved: (result) => saved.push(result),
    isConflict: (error) => String(error).includes('409'),
  });

  return { autosave, calls, gates, statuses, saved };
}

describe('createAutosave', () => {
  it('一次保存把当前 revision 发出去，成功后采纳服务端返回的新 revision', async () => {
    const h = makeHarness(1);

    const done = h.autosave.save({ title: 'a' });
    expect(h.calls).toEqual([{ draft: { title: 'a' }, revision: 1 }]);

    h.gates[0]!.resolve({ revision: 2 });
    await done;

    expect(h.autosave.revision).toBe(2);
    expect(h.saved).toEqual([{ revision: 2 }]);
    expect(h.statuses).toEqual(['saving', 'saved']);
  });

  it('请求在途时再次保存不会并发发第二个请求', async () => {
    const h = makeHarness(1);

    const first = h.autosave.save({ title: 'a' });
    void h.autosave.save({ title: 'b' });

    // 第一个还没完成，此刻只应有一个在途请求
    expect(h.calls).toHaveLength(1);

    h.gates[0]!.resolve({ revision: 2 });
    await first;
    await Promise.resolve();

    expect(h.calls).toHaveLength(2);
  });

  it('合并后的那次重试必须带上服务端刚返回的 revision——这正是 094e103 修的竞态', async () => {
    // 回归守卫：若重试沿用发起时草稿里的 revision 快照（旧实现的写法），
    // 第二次请求会带着 1 发出去，服务端以 409 版本冲突拒绝，
    // 症状是「连打两下保存，第二下报版本冲突」。
    const h = makeHarness(1);

    const first = h.autosave.save({ title: 'a' });
    void h.autosave.save({ title: 'b' });

    h.gates[0]!.resolve({ revision: 2 });
    await first;
    await Promise.resolve();

    expect(h.calls[1]?.revision).toBe(2);
  });

  it('在途期间连按多次，只补发一次——pending 是标记不是队列', async () => {
    const h = makeHarness(1);

    const first = h.autosave.save({ title: 'a' });
    void h.autosave.save({ title: 'b' });
    void h.autosave.save({ title: 'c' });
    void h.autosave.save({ title: 'd' });

    h.gates[0]!.resolve({ revision: 2 });
    await first;
    await Promise.resolve();

    expect(h.calls).toHaveLength(2);
  });

  it('补发的是最新草稿，不是排队时的那一份', async () => {
    const h = makeHarness(1);

    const first = h.autosave.save({ title: 'a' });
    void h.autosave.save({ title: 'b' });
    void h.autosave.save({ title: 'd' });

    h.gates[0]!.resolve({ revision: 2 });
    await first;
    await Promise.resolve();

    expect(h.calls[1]?.draft).toEqual({ title: 'd' });
  });

  it('409 落成 conflict 状态，并保留本地 revision 不前进', async () => {
    const h = makeHarness(1);

    const done = h.autosave.save({ title: 'a' });
    h.gates[0]!.reject(new Error('请求失败 409'));
    await done;

    expect(h.statuses).toEqual(['saving', 'conflict']);
    expect(h.autosave.revision).toBe(1);
  });

  it('其他错误落成 error 状态', async () => {
    const h = makeHarness(1);

    const done = h.autosave.save({ title: 'a' });
    h.gates[0]!.reject(new Error('网络断了'));
    await done;

    expect(h.statuses).toEqual(['saving', 'error']);
  });

  it('保存失败后不会把编辑器永久卡在「保存中」——下一次保存照常发出', async () => {
    // finally 里释放 in-flight 标记；漏了这一句的症状是失败一次之后再也存不上，
    // 且没有任何报错。
    const h = makeHarness(1);

    const first = h.autosave.save({ title: 'a' });
    h.gates[0]!.reject(new Error('网络断了'));
    await first;

    expect(h.autosave.isSaving).toBe(false);

    void h.autosave.save({ title: 'b' });
    expect(h.calls).toHaveLength(2);
  });

  it('采纳外部更新的 revision（其他端写入后由父组件传入）', () => {
    const h = makeHarness(1);
    h.autosave.adoptRevision(5);
    expect(h.autosave.revision).toBe(5);
  });

  it('外部 revision 只前进不后退——否则回退会立刻制造版本冲突', () => {
    const h = makeHarness(5);
    h.autosave.adoptRevision(3);
    expect(h.autosave.revision).toBe(5);
  });
});
