import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ConnectionHolder, createDatabaseClient, runCoreMigrations } from '@workbench/data';
import { createCampusRecruitServerModule } from '@workbench/module-campus-recruit';
import { SqliteCampusRecruitRepository } from '@workbench/module-campus-recruit/storage';
import { createTodoServerModule } from '@workbench/module-todo';
import { SqliteTodoRepository } from '@workbench/module-todo/storage';
import { workbenchServerModule } from '@workbench/module-workbench';
import { buildApp } from './app.js';

async function main() {
  try {
    const DB_PATH = process.env.WORKBENCH_DB ?? './data/local/workbench.db';
    const LOG_PATH = process.env.WORKBENCH_LOG ?? './data/local/server.log';
    const PORT = Number(process.env.PORT ?? 3000);

    const holder = new ConnectionHolder();
    const sqlite = holder.open(DB_PATH);
    const getSqlite = () => holder.current();
    const db = createDatabaseClient(sqlite);
    runCoreMigrations(db);

    const todoServerModule = createTodoServerModule(new SqliteTodoRepository(getSqlite));
    const campusRecruitServerModule = createCampusRecruitServerModule(
      new SqliteCampusRecruitRepository(getSqlite),
    );

    // 日志落盘而非只进 stdout：终端一关就没了的日志，事后追不了任何东西。
    mkdirSync(dirname(resolve(LOG_PATH)), { recursive: true });

    const app = await buildApp({
      getSqlite,
      modules: [todoServerModule, workbenchServerModule, campusRecruitServerModule],
      logger: { level: 'info', file: LOG_PATH },
    });

    await app.listen({ port: PORT, host: '127.0.0.1' });
    console.log(`workbench server 已启动：http://127.0.0.1:${PORT}`);
    console.log(`日志：${LOG_PATH}（实时查看：tail -f ${LOG_PATH}）`);
  } catch (err) {
    console.error('Server failed to start:', err);
    process.exit(1);
  }
}

void main();
