import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { backupMetaSchema, type BackupListItem, type BackupMeta } from '../contract.js';
import { SyncError } from './errors.js';

const META_SUFFIX = '.meta.json';
const DATA_SUFFIX = '.db.gz';
const BACKUP_NAME = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.db\.gz$/;

/**
 * 备份文件名是 `createSnapshot` 产出的时间戳形状，此外一律拒绝。
 *
 * 这不是格式洁癖：名字会直接拼进路径，放行 `../` 就等于让调用方读写备份目录以外的文件。
 */
function assertBackupName(name: string): void {
  if (!BACKUP_NAME.test(name)) {
    throw new SyncError(`不是合法的备份文件名：${name}`, 400);
  }
}

/**
 * `BackupStore` 的本地文件系统实现。
 *
 * 产物与 `WebdavBackupStore` **完全同形**（`<ts>.db.gz` + `<ts>.db.gz.meta.json`），
 * 因此一份本地备份可以直接传上 WebDAV，反之亦然。两者行为上的唯一差别是本地
 * 没有网络错误可映射。
 */
export class LocalBackupStore {
  readonly #dir: string;

  constructor(dir: string) {
    this.#dir = dir;
  }

  private path(name: string): string {
    return join(this.#dir, name);
  }

  /**
   * 先写数据再写元数据；meta 存在才表示这份备份完整。
   *
   * WebDAV 侧这么做是因为协议给不了原子性，本地同样成立——进程随时可能被 kill，
   * 中断只应留下一个显示为「不完整」的孤儿，而不是半截可信数据。
   */
  async upload(name: string, gz: Buffer, meta: BackupMeta): Promise<void> {
    assertBackupName(name);
    mkdirSync(this.#dir, { recursive: true });
    // `wx` 是排他创建：撞名直接失败，不给 exists 检查与写入之间留竞态窗口。
    this.writeNew(this.path(name), gz, name);
    this.writeNew(this.path(`${name}${META_SUFFIX}`), JSON.stringify(meta), name);
  }

  private writeNew(path: string, data: Buffer | string, name: string): void {
    try {
      writeFileSync(path, data, { flag: 'wx' });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new SyncError(`备份已存在，不覆盖：${name}`, 409);
      }
      throw err;
    }
  }

  async list(): Promise<BackupListItem[]> {
    if (!existsSync(this.#dir)) return [];

    const entries = readdirSync(this.#dir);
    const names = entries
      .filter((entry) => entry.endsWith(DATA_SUFFIX))
      .sort()
      .reverse();

    return names.map((name) => ({ name, ...this.readMeta(name) }));
  }

  /** meta 读不出或形状不对，一律算不完整——绝不当作可恢复的备份。 */
  private readMeta(name: string): { complete: boolean; meta: BackupMeta | null } {
    const metaPath = this.path(`${name}${META_SUFFIX}`);
    if (!existsSync(metaPath)) return { complete: false, meta: null };

    let json: unknown;
    try {
      json = JSON.parse(readFileSync(metaPath, 'utf8'));
    } catch {
      return { complete: false, meta: null };
    }
    const parsed = backupMetaSchema.safeParse(json);
    return parsed.success ? { complete: true, meta: parsed.data } : { complete: false, meta: null };
  }

  /** 先删 meta，让「删到一半」表现为孤儿而非可恢复的假象。 */
  async remove(name: string): Promise<void> {
    assertBackupName(name);
    rmSync(this.path(`${name}${META_SUFFIX}`), { force: true });
    rmSync(this.path(name), { force: true });
  }

  async download(name: string): Promise<Buffer> {
    assertBackupName(name);
    const path = this.path(name);
    if (!existsSync(path)) {
      throw new SyncError(`备份不存在：${name}`, 404);
    }
    return readFileSync(path);
  }
}
