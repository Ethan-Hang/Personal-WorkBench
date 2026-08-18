import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { openDatabase, runCoreMigrations } from '@workbench/data';
import { createCampusRecruitServerModule } from '@workbench/module-campus-recruit';
import { SqliteCampusRecruitRepository } from '@workbench/module-campus-recruit/storage';
import { todoServerModule } from '@workbench/module-todo';
import { buildApp } from './app.js';

const DB_PATH = process.env.WORKBENCH_DB ?? './data/local/workbench.db';
const LOG_PATH = process.env.WORKBENCH_LOG ?? './data/local/server.log';
const PORT = Number(process.env.PORT ?? 3000);

const { db, sqlite } = openDatabase(DB_PATH);
runCoreMigrations(db);

const campusRecruitServerModule = createCampusRecruitServerModule(
  new SqliteCampusRecruitRepository(sqlite),
);

// 日志落盘而非只进 stdout：终端一关就没了的日志，事后追不了任何东西。
mkdirSync(dirname(resolve(LOG_PATH)), { recursive: true });

const app = await buildApp({
  db,
  modules: [todoServerModule, campusRecruitServerModule],
  logger: { level: 'info', file: LOG_PATH },
});

await app.listen({ port: PORT, host: '127.0.0.1' });
console.log(`workbench server 已启动：http://127.0.0.1:${PORT}`);
console.log(`日志：${LOG_PATH}（实时查看：tail -f ${LOG_PATH}）`);
