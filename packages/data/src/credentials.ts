/** 退化路径用的明文文件名。优先方案是 OS 保管库（见 secret-store.ts）。 */
export const CREDENTIALS_FILE = 'credentials.json';

export interface WebdavCredentials {
  url: string;
  username: string;
  password: string;
}

/**
 * WebDAV 凭据的读写口。
 *
 * 抽成接口而不是直接依赖 `SecretStore`：备份服务只需要这三件事，
 * 不该因为「秘密存哪儿」的选择变化而跟着改。
 */
export interface WebdavCredentialStore {
  readWebdav(): WebdavCredentials | undefined;
  writeWebdav(credentials: WebdavCredentials): void;
  clearWebdav(): void;
}
