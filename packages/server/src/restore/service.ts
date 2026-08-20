import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type Database from 'better-sqlite3';
import { openSqliteConnection, readJsonFile, type ConnectionHolder } from '@workbench/data';
import type {
  BackupListItem,
  RestoreDiff,
  RestorePreflightResponse,
  RestoreState,
} from '@workbench/sync/contract';
import { migrationWatermarks, SyncError } from '@workbench/sync/node';
import type { ServiceState } from '../service-state.js';
import { compareWatermarks } from './compatibility.js';
import { computeRestoreDiff } from './diff.js';

/** 恢复只需要云端的这两件事；完整的备份服务能力用不上。 */
export interface RestoreBackupSource {
  list(): Promise<BackupListItem[]>;
  download(name: string): Promise<Buffer>;
}

export interface RestoreServiceDeps {
  holder: ConnectionHolder;
  state: ServiceState;
  dataDir: string;
  dbPath: () => string;
  source: RestoreBackupSource;
  migrate: (sqlite: Database.Database) => void;
  moduleIds: readonly string[];
  /**
   * 换库之前的强制本地快照（TASK-045）。回退点之外再多一层网：`rollback.db`
   * 只有一个槽位、会被下一次恢复覆盖，而这一份是可列出、可长期保留的。
   *
   * 不传则跳过——`WORKBENCH_DB` 逃生舱下就没有本地备份服务。
   */
  snapshotBefore?: (reason: string) => Promise<unknown>;
}

const EMPTY_DIFF: RestoreDiff = { core: { added: [], removed: [], modified: [] }, modules: [] };

interface InterruptedState {
  step: string;
  name: string;
}

/**
 * 恢复的五态机（设计 §6.3）。
 *
 * 四个承重细节，每一个都对应一条测试：
 *
 * 1. **没有回退点就不动手**——`backup(rollback.db)` 失败则整个恢复拒绝开始。
 * 2. **换库必须显式删 `-wal` 与 `-shm`**。只换主库而留下旧 WAL，旧数据会在下次打开时
 *    复活并覆盖刚恢复的内容，**而且不报错**。
 * 3. **备份比代码新则拒绝**——向下迁移不存在，硬恢复的症状是运行时 `no such column`。
 * 4. **恢复中断电不能变砖**——`.restore/state.json` 记录当前步骤，启动时读到就直接
 *    进入错误态，让人选择回退或重试。
 */
export class RestoreService {
  constructor(private readonly deps: RestoreServiceDeps) {}

  private get restoreDir(): string {
    return join(this.deps.dataDir, '.restore');
  }

  private get statePath(): string {
    return join(this.restoreDir, 'state.json');
  }

  private get incomingPath(): string {
    return join(this.restoreDir, 'incoming.db');
  }

  private get rollbackPath(): string {
    return join(this.restoreDir, 'rollback.db');
  }

  current(): RestoreState {
    const snapshot = this.deps.state.current();
    return {
      state: snapshot.state,
      ...(snapshot.step === undefined ? {} : { step: snapshot.step }),
      canRollback: existsSync(this.rollbackPath),
      generation: this.deps.holder.generation(),
    };
  }

  /** 进程启动时调用。`.restore/state.json` 还在 = 上一次恢复没走完。 */
  resumeIfInterrupted(): void {
    if (!existsSync(this.statePath)) return;
    const interrupted = readJsonFile(this.statePath) as InterruptedState;
    this.deps.state.fail(`上次恢复停在 ${interrupted.step}（${interrupted.name}），可回退或重试`);
  }

  /**
   * 预检：下载 → 解压 → integrity_check → 水位比对 → 算差异。
   *
   * **刻意不进入忙碌态**：它对本地库只读，没有副作用，随时可以取消。
   * 全服务 503 从 `confirm` 才开始（设计 §6.3）。
   */
  async preflight(name: string): Promise<RestorePreflightResponse> {
    const listed = (await this.deps.source.list()).find((item) => item.name === name);
    if (listed === undefined || !listed.complete || listed.meta === null) {
      throw new SyncError(`云端没有这份可恢复的备份：${name}`, 409);
    }

    mkdirSync(this.restoreDir, { recursive: true });
    rmSync(this.incomingPath, { force: true });
    writeFileSync(this.incomingPath, gunzipSync(await this.deps.source.download(name)));

    const incoming = openSqliteConnection(this.incomingPath);
    try {
      const integrity = incoming.pragma('integrity_check', { simple: true });
      if (integrity !== 'ok') {
        throw new SyncError(`备份文件损坏（integrity_check: ${String(integrity)}）`, 409);
      }
    } finally {
      // 必须先关掉：ATTACH 一个还开着的库会读到不一致的中间状态。
      incoming.close();
    }

    const comparison = compareWatermarks(
      migrationWatermarks(this.deps.holder.current()),
      listed.meta.migrations,
    );
    if (comparison.verdict === 'backup-newer') {
      this.rememberPreflight(name, false);
      return {
        name,
        compatible: false,
        ...(comparison.reason === undefined ? {} : { reason: comparison.reason }),
        meta: listed.meta,
        diff: EMPTY_DIFF,
      };
    }

    const diff = computeRestoreDiff(
      this.deps.holder.current(),
      this.incomingPath,
      this.deps.moduleIds,
    );
    this.rememberPreflight(name, true);
    return { name, compatible: true, meta: listed.meta, diff };
  }

  /** 确认恢复：从这里开始全服务 503。 */
  async confirm(name: string): Promise<RestoreState> {
    const remembered = this.readPreflight();
    if (remembered?.name !== name || !existsSync(this.incomingPath)) {
      throw new SyncError('请先对这份备份做一次预检，再确认恢复', 409);
    }
    if (!remembered.compatible) {
      throw new SyncError('这份备份比当前代码新，拒绝恢复', 409);
    }

    // 安全快照在**进入忙碌态之前**打：这一刻本地库还一个字节都没被碰过，
    // 失败了就当无事发生。与「没有回退点就不动手」是同一条原则——快照写不下去
    // 通常意味着磁盘满或备份目录坏了，那正是最不该去换数据库文件的时候。
    if (this.deps.snapshotBefore !== undefined) {
      try {
        await this.deps.snapshotBefore('恢复');
      } catch (cause) {
        throw new SyncError('恢复前的安全快照失败，恢复拒绝开始', 500, { cause });
      }
    }

    const dbPath = this.deps.dbPath();
    this.deps.state.enter('restoring', '正在备份回退点');
    try {
      this.writeStep('snapshot-local', name);
      try {
        await this.deps.holder.current().backup(this.rollbackPath);
      } catch (cause) {
        // 没有回退点就不动手。这一步失败时本地库一个字节都没被碰过。
        throw new SyncError('无法建立回退点，恢复拒绝开始', 500, { cause });
      }

      try {
        this.deps.state.advance('正在换库');
        this.writeStep('swap', name);
        this.swapTo(this.incomingPath, dbPath, 'move');

        this.deps.state.advance('正在校验');
        this.writeStep('verify', name);
        this.verify();
      } catch (error) {
        this.rollbackTo(dbPath, error);
        throw error;
      }

      rmSync(this.statePath, { force: true });
      return { state: 'idle', canRollback: true, generation: this.deps.holder.generation() };
    } finally {
      if (this.deps.state.current().state === 'restoring') this.deps.state.reset();
    }
  }

  /** 手动回退。恢复完成之后、以及回退失败留下的错误态里都可以调。 */
  async rollback(): Promise<RestoreState> {
    if (!existsSync(this.rollbackPath)) {
      throw new SyncError('没有可用的回退点', 409);
    }
    const dbPath = this.deps.dbPath();
    this.swapTo(this.rollbackPath, dbPath, 'copy');
    this.verify();
    rmSync(this.statePath, { force: true });
    this.deps.state.reset();
    return { state: 'idle', message: '已回到恢复前', generation: this.deps.holder.generation() };
  }

  /**
   * 换库。**`-wal` 与 `-shm` 必须显式删掉**——只换主库而留下旧 WAL，
   * 旧数据会在下次打开时复活并覆盖刚恢复的内容，且不报错。
   *
   * `copy` 用于回退：回退点要留着，不能被 rename 消耗掉。复制的是一个
   * 由 `backup()` 产出、已经没有连接也没有 WAL 的独立文件——与「禁止 fs.copyFile
   * 复制在用的数据库」说的不是一回事。
   */
  private swapTo(source: string, dbPath: string, mode: 'move' | 'copy'): void {
    this.deps.holder.close();
    for (const suffix of ['', '-wal', '-shm']) {
      rmSync(`${dbPath}${suffix}`, { force: true });
    }
    if (mode === 'move') {
      renameSync(source, dbPath);
    } else {
      copyFileSync(source, dbPath);
    }
    this.deps.holder.open(dbPath);
  }

  private verify(): void {
    const sqlite = this.deps.holder.current();
    const integrity = sqlite.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') throw new Error(`恢复后 integrity_check 失败：${String(integrity)}`);

    const violations = sqlite.pragma('foreign_key_check') as unknown[];
    if (violations.length > 0) {
      throw new Error(`恢复后外键校验失败，共 ${violations.length} 处`);
    }

    // 备份可能来自更旧的代码，恢复后必须把迁移补齐。
    this.deps.migrate(sqlite);

    // 探针查询：跑得通才说明这个库真的能用，而不只是文件完整。
    sqlite.prepare('SELECT count(*) AS c FROM items').get();
  }

  private rollbackTo(dbPath: string, cause: unknown): void {
    this.deps.state.advance('恢复失败，正在回退');
    try {
      this.swapTo(this.rollbackPath, dbPath, 'copy');
      this.verify();
      rmSync(this.statePath, { force: true });
      this.deps.state.reset();
    } catch (rollbackError) {
      // 回退也失败：**不自动重试**，停在错误态等人处理。
      this.deps.state.fail(
        `恢复失败且回退也失败（${String((rollbackError as Error).message)}）；` +
          `原始错误：${String((cause as Error).message)}。回退点仍在 ${this.rollbackPath}`,
      );
    }
  }

  private rememberPreflight(name: string, compatible: boolean): void {
    mkdirSync(this.restoreDir, { recursive: true });
    writeFileSync(
      join(this.restoreDir, 'preflight.json'),
      JSON.stringify({ name, compatible }),
      'utf8',
    );
  }

  private readPreflight(): { name: string; compatible: boolean } | undefined {
    const path = join(this.restoreDir, 'preflight.json');
    if (!existsSync(path)) return undefined;
    return readJsonFile(path) as { name: string; compatible: boolean };
  }

  private writeStep(step: string, name: string): void {
    mkdirSync(this.restoreDir, { recursive: true });
    writeFileSync(
      this.statePath,
      JSON.stringify({ step, name } satisfies InterruptedState),
      'utf8',
    );
  }
}
