import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readJsonFile, writeJsonAtomically } from './atomic-json.js';

export const CREDENTIALS_FILE = 'credentials.json';

export interface WebdavCredentials {
  url: string;
  username: string;
  password: string;
}

export interface Credentials {
  v: 1;
  webdav?: WebdavCredentials;
}

/**
 * 本地凭据存储。
 *
 * **这是设计 §7.4 的退化路径，不是终点。** 优先方案是 OS 保管库
 * （`@napi-rs/keyring` 之类），落地在 TASK-038；退化到明文文件时**必须在设置页
 * 明示「本机凭据未受系统保管库保护」**——那是降级，不是等价选项，不得静默发生。
 *
 * 与 `accounts.json` 分开存：账号注册表是引导文件，坏了要能手工修；凭据是秘密，
 * 将来要整体搬进保管库。混在一个文件里，搬的时候就得拆。
 */
export class CredentialsStore {
  constructor(private readonly dataDir: string) {}

  get filePath(): string {
    return join(this.dataDir, CREDENTIALS_FILE);
  }

  read(): Credentials {
    if (!existsSync(this.filePath)) return { v: 1 };
    const parsed = readJsonFile(this.filePath) as Credentials;
    return { ...parsed, v: 1 };
  }

  readWebdav(): WebdavCredentials | undefined {
    return this.read().webdav;
  }

  writeWebdav(webdav: WebdavCredentials): void {
    writeJsonAtomically(this.filePath, { ...this.read(), webdav });
  }

  clearWebdav(): void {
    const current = this.read();
    delete current.webdav;
    writeJsonAtomically(this.filePath, current);
  }
}
