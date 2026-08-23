import { mkdirSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type Database from 'better-sqlite3';
import {
  AccountsStore,
  ConnectionHolder,
  createSecretBackend,
  SecretStore,
  SqliteSettingsRepository,
  createDatabaseClient,
  resolveActiveDatabase,
  runCoreMigrations,
} from '@workbench/data';
import { createCampusRecruitServerModule } from '@workbench/module-campus-recruit';
import { SqliteCampusRecruitRepository } from '@workbench/module-campus-recruit/storage';
import { createHabitServerModule } from '@workbench/module-habit';
import { SqliteHabitRepository } from '@workbench/module-habit/storage';
import { createNotesServerModule } from '@workbench/module-notes';
import { SqliteNoteRepository } from '@workbench/module-notes/storage';
import { createResearchServerModule } from '@workbench/module-research';
import { SqliteResearchRepository } from '@workbench/module-research/storage';
import { createTodoServerModule } from '@workbench/module-todo';
import { SqliteTodoRepository } from '@workbench/module-todo/storage';
import { workbenchServerModule } from '@workbench/module-workbench';
import { GistClient, migrationWatermarks, WebdavBackupStore } from '@workbench/sync/node';
import { buildApp } from './app.js';
import { AccountsService } from './accounts/service.js';
import { BackupService } from './backup/service.js';
import { RestoreService } from './restore/service.js';
import { LocalBackupService } from './local-backup/service.js';
import { LocalImportService } from './local-import/service.js';
import { GistSyncService } from './sync/service.js';
import { runModuleMigrations } from './registry.js';
import { ServiceState } from './service-state.js';

async function main() {
  try {
    const DATA_DIR = process.env.WORKBENCH_DATA_DIR ?? './data/local';
    const LOG_PATH = process.env.WORKBENCH_LOG ?? join(DATA_DIR, 'server.log');
    const PORT = Number(process.env.PORT ?? 3000);

    // WORKBENCH_DB 是逃生舱：显式设置时锁定单库、禁用账号功能（供 CI 与测试用）。
    const active = resolveActiveDatabase({
      dataDir: DATA_DIR,
      dbPathOverride: process.env.WORKBENCH_DB,
    });

    const holder = new ConnectionHolder();
    const sqlite = holder.open(active.dbPath);
    const getSqlite = () => holder.current();
    const accountsStore = active.mode === 'accounts' ? new AccountsStore(DATA_DIR) : null;
    const currentAccountId = () =>
      active.mode === 'accounts' ? accountsStore!.read().activeId : 'single';

    const todoServerModule = createTodoServerModule(new SqliteTodoRepository(getSqlite));
    const campusRecruitServerModule = createCampusRecruitServerModule(
      new SqliteCampusRecruitRepository(getSqlite),
    );
    const habitServerModule = createHabitServerModule(new SqliteHabitRepository(getSqlite));
    const notesServerModule = createNotesServerModule(new SqliteNoteRepository(getSqlite));
    const researchServerModule = createResearchServerModule({
      repository: new SqliteResearchRepository(getSqlite),
      managedRoot: () =>
        active.mode === 'accounts'
          ? join(DATA_DIR, 'accounts', currentAccountId(), 'research', 'managed')
          : join(DATA_DIR, 'research', 'managed'),
    });
    const modules = [
      todoServerModule,
      workbenchServerModule,
      campusRecruitServerModule,
      habitServerModule,
      notesServerModule,
      researchServerModule,
    ];

    // 切换账号要在新库上跑同一套迁移。「哪些模块有迁移」只有组合根知道，
    // 所以这个函数在这里成型、注入给 AccountsService（铁律 2）。
    const migrate = (connection: Database.Database) => {
      const db = createDatabaseClient(connection);
      runCoreMigrations(db);
      runModuleMigrations(db, modules);
    };
    runCoreMigrations(createDatabaseClient(sqlite));

    // 优先系统保管库，拿不到才退到明文 credentials.json（设计 §7.4）。
    // 退化会通过 /api/sync/status 的 protectedByOsVault 报给设置页——
    // **这是降级不是等价选项，不得静默发生**。
    const secrets = new SecretStore(createSecretBackend(DATA_DIR));

    const serviceState = new ServiceState();
    // 本地备份与云端各自成服务：它不需要凭据，所以默认配置下就能用。
    const localBackupService = new LocalBackupService({
      settings: new SqliteSettingsRepository(getSqlite),
      getSqlite,
      accountId: currentAccountId,
      dataDir: DATA_DIR,
      device: hostname(),
      appVersion: process.env.npm_package_version ?? '0.0.0',
    });
    // 导入为新账号只在有账号机制时可用：WORKBENCH_DB 逃生舱下锁死单库，没有
    // accounts.json 可写。
    const localImport =
      active.mode === 'accounts'
        ? new LocalImportService({
            store: accountsStore!,
            dataDir: DATA_DIR,
            migrate,
            localWatermarks: () => migrationWatermarks(getSqlite()),
          })
        : undefined;
    const accounts =
      active.mode === 'accounts'
        ? new AccountsService({
            store: accountsStore!,
            holder,
            state: serviceState,
            migrate,
            // 绑定那一刻用户还没设过同步口令，方向只能先记下来，等第一次解锁再执行。
            onGithubBound: (accountId, direction, credential) => {
              secrets.writePendingDirection(accountId, direction);
              if (credential !== undefined) {
                secrets.writeGithubToken(accountId, credential);
              }
            },
            onGithubUnbound: (accountId) => {
              secrets.clearGithubToken(accountId);
              secrets.clearPendingDirection(accountId);
            },
            onBeforeAccountRemoved: (accountId, dbPath) =>
              localBackupService.snapshotOfDatabase(dbPath, accountId, '删除账号'),
            onAccountRemoved: (accountId) => {
              secrets.clearAccountSecrets(accountId);
            },
          })
        : undefined;

    const gistSync = new GistSyncService({
      secrets,
      settings: new SqliteSettingsRepository(getSqlite),
      accountId: currentAccountId,
      device: hostname(),
      gist: {
        create: (token, envelope) => new GistClient(token).create(envelope),
        update: (token, gistId, envelope) => new GistClient(token).update(gistId, envelope),
        read: (token, gistId) => new GistClient(token).read(gistId),
      },
    });

    // 日志落盘而非只进 stdout：终端一关就没了的日志，事后追不了任何东西。
    mkdirSync(dirname(resolve(LOG_PATH)), { recursive: true });

    const backupService = new BackupService({
      credentials: secrets,
      settings: new SqliteSettingsRepository(getSqlite),
      getSqlite,
      accountId: currentAccountId,
      dataDir: DATA_DIR,
      device: hostname(),
      appVersion: process.env.npm_package_version ?? '0.0.0',
      createStore: (creds) => new WebdavBackupStore(creds),
    });
    const restoreService = new RestoreService({
      holder,
      state: serviceState,
      dataDir: DATA_DIR,
      dbPath: () => active.dbPath,
      source: backupService,
      migrate,
      moduleIds: modules.map((mod) => mod.id),
      snapshotBefore: (reason) => localBackupService.snapshotBefore(reason),
    });
    // 恢复中断电不能变砖：进程启动时若 .restore/state.json 还在就直接进入错误态。
    restoreService.resumeIfInterrupted();

    const app = await buildApp({
      getSqlite,
      modules,
      serviceState,
      accounts,
      backup: { backup: backupService, restore: restoreService },
      localBackup: localBackupService,
      ...(localImport === undefined ? {} : { localImport }),
      gistSync,
      logger: { level: 'info', file: LOG_PATH },
    });

    await app.listen({ port: PORT, host: '127.0.0.1' });
    console.log(`workbench server 已启动：http://127.0.0.1:${PORT}`);
    console.log(
      active.mode === 'single'
        ? `数据库：${active.dbPath}（WORKBENCH_DB 逃生舱，账号功能已禁用）`
        : `账号：${active.account.displayName}（${active.account.id}）→ ${active.dbPath}`,
    );
    console.log(`日志：${LOG_PATH}（实时查看：tail -f ${LOG_PATH}）`);

    // 自动备份挂在进程启动（距上次 >24h），不引入常驻调度器——与「重复任务物化
    // 挂在 listToday」同源。默认关闭，所以默认配置下这里一个出站请求都不发。
    void backupService.maybeAutoBackup().catch((err: unknown) => {
      app.log.error({ err }, '启动时的自动备份失败');
    });

    // 本地快照同样挂在启动（距上次 >24h），默认关闭。与上面一样是 catch-and-log：
    // 启动被一份备份写失败拖挂，是比没有备份更糟的故障。
    void localBackupService.maybeAutoSnapshot().catch((err: unknown) => {
      app.log.error({ err }, '启动时的自动本地快照失败');
    });
  } catch (err) {
    console.error('Server failed to start:', err);
    process.exit(1);
  }
}

void main();
