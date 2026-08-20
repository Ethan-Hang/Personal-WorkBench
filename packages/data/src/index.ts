export { items, appSettings } from './schema.js';
export type { Db } from './db.js';
export { ConnectionHolder } from './connection-holder.js';
export { readJsonFile, writeJsonAtomically } from './atomic-json.js';
export { CREDENTIALS_FILE } from './credentials.js';
export {
  createSecretBackend,
  JsonFileBackend,
  OsVaultBackend,
  SecretStore,
} from './secret-store.js';
export type { GithubToken, SecretBackend } from './secret-store.js';
export type { WebdavCredentials, WebdavCredentialStore } from './credentials.js';
export { resolveActiveDatabase } from './accounts-bootstrap.js';
export type { ActiveDatabase, ResolveActiveDatabaseOptions } from './accounts-bootstrap.js';
export {
  ACCOUNT_DB_FILE,
  ACCOUNTS_FILE,
  AccountsStore,
  DEFAULT_ACCOUNT_ID,
} from './accounts-store.js';
export type { Account, AccountsRegistry, GithubBinding } from './accounts-store.js';
export {
  createDatabaseClient,
  openDatabase,
  openSqliteConnection,
  openTestDatabase,
  runCoreMigrations,
  runMigrationsFrom,
} from './db.js';
export { SqliteItemRepository } from './item-repository.js';
export { SqliteSettingsRepository } from './settings-repository.js';
