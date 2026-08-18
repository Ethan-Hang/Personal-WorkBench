import { openDatabase, runCoreMigrations } from '@workbench/data';
import { createCampusRecruitServerModule } from '@workbench/module-campus-recruit';
import { SqliteCampusRecruitRepository } from '@workbench/module-campus-recruit/storage';
import { todoServerModule } from '@workbench/module-todo';
import { buildApp } from './app.js';

const DB_PATH = process.env.WORKBENCH_DB ?? './data/local/workbench.db';
const PORT = Number(process.env.PORT ?? 3000);

const { db, sqlite } = openDatabase(DB_PATH);
runCoreMigrations(db);

const campusRecruitServerModule = createCampusRecruitServerModule(
  new SqliteCampusRecruitRepository(sqlite),
);

const app = await buildApp({
  db,
  modules: [todoServerModule, campusRecruitServerModule],
  logger: true,
});

await app.listen({ port: PORT, host: '127.0.0.1' });
console.log(`workbench server 已启动：http://127.0.0.1:${PORT}`);
