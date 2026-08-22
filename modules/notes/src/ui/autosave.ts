/**
 * 便签编辑器的自动保存状态机。
 *
 * 这段逻辑原先埋在 `NoteEditor.tsx`（1210 行）的 render 函数里，由三个 ref
 * 与若干 useState 交织而成。Vitest 的 include 刻意不收 `.tsx`，于是它一行测试都没有——
 * 而 `094e103「fix: 修复保存竞态」` 修的恰恰是这里。提出来之后 interface 就是测试面，
 * 不必挂载 React 就能把下面四条不变量钉死。
 *
 * 四条承重的不变量：
 *
 * 1. **同一时刻只有一个在途请求。** 在途期间再次保存不会并发发第二个，
 *    而是置一个 pending 标记，等当前这次落地后补发。
 * 2. **补发必须带服务端刚返回的 revision。** 这是 094e103 的核心：
 *    若沿用发起时草稿里的 revision 快照，第二次请求会带着旧版本号发出，
 *    服务端以 409 拒绝，症状是「连打两下保存，第二下报版本冲突」。
 * 3. **pending 是标记，不是队列。** 在途期间连按多次只补发一次，且补发的是
 *    最新草稿——排队重放中间那些已经过时的草稿没有意义，只会多打几个来回。
 * 4. **失败也要释放在途标记。** 漏掉 `finally` 的症状是失败一次之后再也存不上，
 *    且没有任何报错。
 *
 * 本模块不认识 React、不认识 fetch：保存动作由调用方注入，因此测试里可以用
 * 手动控制的 promise 精确地钉住「请求在途」那一刻。
 */

/**
 * `unsaved` 由调用方在防抖计时期间置上，本模块自己只会发出其余四个——
 * 它不认识防抖，只认识「一次保存的生命周期」。
 */
export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error' | 'conflict';

export interface AutosaveOptions<D, R> {
  /** 初始版本号，通常来自服务端返回的 note.revision。 */
  initialRevision: number;
  /** 真正发请求的动作。`revision` 由本模块决定，调用方不要自己传草稿里的。 */
  save(draft: D, revision: number): Promise<R>;
  /** 从保存结果里取出新的版本号。 */
  revisionOf(result: R): number;
  /** 状态变化回调，接到界面上。 */
  onStatus(status: SaveStatus): void;
  /** 保存成功回调，交给调用方更新「最后保存时间」等派生显示。 */
  onSaved(result: R): void;
  /** 判定某个错误是否为版本冲突。放在外面是因为错误形状属于传输层的事。 */
  isConflict(error: unknown): boolean;
}

export interface Autosave<D> {
  /** 请求保存。若已有在途请求，则合并为一次补发。 */
  save(draft: D): Promise<void>;
  /** 采纳外部传入的版本号（其他端写入后由父组件传下来）。只前进，不后退。 */
  adoptRevision(next: number): void;
  readonly revision: number;
  readonly isSaving: boolean;
}

export function createAutosave<D, R>(options: AutosaveOptions<D, R>): Autosave<D> {
  let revision = options.initialRevision;
  let inFlight = false;
  let pending = false;
  let latestDraft: D | undefined;

  async function run(draft: D): Promise<void> {
    latestDraft = draft;

    // 不变量 1 + 3：在途期间只记一个标记，不排队，不并发。
    if (inFlight) {
      pending = true;
      return;
    }

    inFlight = true;
    options.onStatus('saving');

    try {
      // 不变量 2：版本号取自本模块持有的最新值，而不是草稿里的快照。
      const result = await options.save(latestDraft, revision);
      revision = options.revisionOf(result);
      options.onStatus('saved');
      options.onSaved(result);
    } catch (error) {
      options.onStatus(options.isConflict(error) ? 'conflict' : 'error');
    } finally {
      // 不变量 4：无论成败都要释放，否则编辑器会永久卡在「保存中」。
      inFlight = false;
      if (pending) {
        pending = false;
        // 补发最新草稿；此时 revision 已是服务端刚返回的那个。
        void run(latestDraft as D);
      }
    }
  }

  return {
    save: run,
    adoptRevision(next: number) {
      // 只前进：回退版本号会立刻制造一次必然失败的 409。
      if (next > revision) revision = next;
    },
    get revision() {
      return revision;
    },
    get isSaving() {
      return inFlight;
    },
  };
}
