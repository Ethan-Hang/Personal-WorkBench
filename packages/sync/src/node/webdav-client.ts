import { createClient, type WebDAVClient } from 'webdav';
import { backupMetaSchema, type BackupListItem, type BackupMeta } from '../contract.js';
import { SyncError, toSyncError } from './errors.js';

export interface WebdavCredentials {
  url: string;
  username: string;
  password: string;
}

const META_SUFFIX = '.meta.json';
const DATA_SUFFIX = '.db.gz';
const BACKUP_NAME = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.db\.gz$/;

async function guard<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    const mapped = toSyncError(err);
    if (mapped) throw mapped;
    throw err;
  }
}

function assertBackupName(name: string): void {
  if (!BACKUP_NAME.test(name)) {
    throw new SyncError(`不是合法的备份文件名：${name}`, 400);
  }
}

export class WebdavBackupStore {
  readonly #client: WebDAVClient;
  readonly #dir: string;

  constructor(creds: WebdavCredentials, dir = '/workbench-backups') {
    this.#client = createClient(creds.url, {
      username: creds.username,
      password: creds.password,
    });
    this.#dir = dir;
  }

  async ensureDir(): Promise<void> {
    await guard(async () => {
      if ((await this.#client.exists(this.#dir)) === false) {
        await this.#client.createDirectory(this.#dir, { recursive: true });
      }
    });
  }

  /** 先传数据再传元数据；meta 存在才表示该备份完整。 */
  async upload(name: string, gz: Buffer, meta: BackupMeta): Promise<void> {
    assertBackupName(name);
    await this.ensureDir();
    await guard(async () => {
      await this.#client.putFileContents(`${this.#dir}/${name}`, gz, { overwrite: false });
      await this.#client.putFileContents(
        `${this.#dir}/${name}${META_SUFFIX}`,
        JSON.stringify(meta),
        { overwrite: false },
      );
    });
  }

  async list(): Promise<BackupListItem[]> {
    await this.ensureDir();
    const entries = await guard(() => this.#client.getDirectoryContents(this.#dir));

    const names = entries
      .filter((entry) => entry.type === 'file' && entry.basename.endsWith(DATA_SUFFIX))
      .map((entry) => entry.basename)
      .sort()
      .reverse();
    const metaNames = new Set(
      entries
        .filter((entry) => entry.basename.endsWith(META_SUFFIX))
        .map((entry) => entry.basename),
    );

    const out: BackupListItem[] = [];
    for (const name of names) {
      if (!metaNames.has(`${name}${META_SUFFIX}`)) {
        out.push({ name, complete: false, meta: null });
        continue;
      }
      const text = await guard(() =>
        this.#client.getFileContents(`${this.#dir}/${name}${META_SUFFIX}`, { format: 'text' }),
      );
      let json: unknown;
      try {
        json = JSON.parse(String(text));
      } catch {
        out.push({ name, complete: false, meta: null });
        continue;
      }
      const parsed = backupMetaSchema.safeParse(json);
      out.push(
        parsed.success
          ? { name, complete: true, meta: parsed.data }
          : { name, complete: false, meta: null },
      );
    }
    return out;
  }

  /** 先删 meta，让「删到一半」表现为孤儿而非可恢复的假象。 */
  async remove(name: string): Promise<void> {
    assertBackupName(name);
    await guard(async () => {
      if (await this.#client.exists(`${this.#dir}/${name}${META_SUFFIX}`)) {
        await this.#client.deleteFile(`${this.#dir}/${name}${META_SUFFIX}`);
      }
      if (await this.#client.exists(`${this.#dir}/${name}`)) {
        await this.#client.deleteFile(`${this.#dir}/${name}`);
      }
    });
  }

  async download(name: string): Promise<Buffer> {
    assertBackupName(name);
    return guard(async () => {
      const buf = await this.#client.getFileContents(`${this.#dir}/${name}`, { format: 'binary' });
      return Buffer.from(buf as ArrayBuffer);
    });
  }
}
