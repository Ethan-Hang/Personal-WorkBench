import { openDatabase, runCoreMigrations } from '@workbench/data';
import { todoServerModule } from '@workbench/module-todo';
import { buildApp } from './app.js';

const DB_PATH = process.env.WORKBENCH_DB ?? './data/local/workbench.db';
const PORT = Number(process.env.PORT ?? 3000);

const { db } = openDatabase(DB_PATH);
runCoreMigrations(db);

const app = await buildApp({ db, modules: [todoServerModule], logger: true });

await app.listen({ port: PORT, host: '127.0.0.1' });
console.log(`workbench server 已启动：http://127.0.0.1:${PORT}`);
