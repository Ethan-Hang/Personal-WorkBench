import { mkdirSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type Database from 'better-sqlite3';
import {
  AccountsStore,
  ConnectionHolder,
  CredentialsStore,
  SqliteSettingsRepository,
  createDatabaseClient,
  resolveActiveDatabase,
  runCoreMigrations,
} from '@workbench/data';
import { createCampusRecruitServerModule } from '@workbench/module-campus-recruit';
import { SqliteCampusRecruitRepository } from '@workbench/module-campus-recruit/storage';
import { createTodoServerModule } from '@workbench/module-todo';
import { SqliteTodoRepository } from '@workbench/module-todo/storage';
import { workbenchServerModule } from '@workbench/module-workbench';
import { WebdavBackupStore } from '@workbench/sync/node';
import { buildApp } from './app.js';
import { AccountsService } from './accounts/service.js';
import { BackupService } from './backup/service.js';
import { RestoreService } from './restore/service.js';
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

    const todoServerModule = createTodoServerModule(new SqliteTodoRepository(getSqlite));
    const campusRecruitServerModule = createCampusRecruitServerModule(
      new SqliteCampusRecruitRepository(getSqlite),
    );
    const modules = [todoServerModule, workbenchServerModule, campusRecruitServerModule];

    // 切换账号要在新库上跑同一套迁移。「哪些模块有迁移」只有组合根知道，
    // 所以这个函数在这里成型、注入给 AccountsService（铁律 2）。
    const migrate = (connection: Database.Database) => {
      const db = createDatabaseClient(connection);
      runCoreMigrations(db);
      runModuleMigrations(db, modules);
    };
    runCoreMigrations(createDatabaseClient(sqlite));

    const serviceState = new ServiceState();
    const accounts =
      active.mode === 'accounts'
        ? new AccountsService({
            store: new AccountsStore(DATA_DIR),
            holder,
            state: serviceState,
            migrate,
          })
        : undefined;

    // 日志落盘而非只进 stdout：终端一关就没了的日志，事后追不了任何东西。
    mkdirSync(dirname(resolve(LOG_PATH)), { recursive: true });

    // 备份与恢复：与账号一样只在账号模式下装配——逃生舱锁定单库时没有账号目录，
    // 也就没有 .restore/ 与 accounts.json 可依托。
    const credentials = new CredentialsStore(DATA_DIR);
    const backupService = new BackupService({
      credentials,
      settings: new SqliteSettingsRepository(getSqlite),
      getSqlite,
      accountId: () => (active.mode === 'accounts' ? active.account.id : 'single'),
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
    });
    // 恢复中断电不能变砖：进程启动时若 .restore/state.json 还在就直接进入错误态。
    restoreService.resumeIfInterrupted();

    const app = await buildApp({
      getSqlite,
      modules,
      serviceState,
      accounts,
      backup: { backup: backupService, restore: restoreService },
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
  } catch (err) {
    console.error('Server failed to start:', err);
    process.exit(1);
  }
}

void main();
