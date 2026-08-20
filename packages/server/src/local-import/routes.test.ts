import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ConnectionHolder,
  createDatabaseClient,
  openSqliteConnection,
  runCoreMigrations,
} from '@workbench/data';
import {
  LOCAL_IMPORT_API,
  localImportPreflightResponseSchema,
  restoreStateSchema,
} from '@workbench/sync/contract';
import { buildApp } from '../app.js';
import { ServiceState } from '../service-state.js';
import { RestoreService } from '../restore/service.js';

const temporaryDirectories: string[] = [];
const openApps: FastifyInstance[] = [];
const openHolders: ConnectionHolder[] = [];

function migrate(sqlite: Parameters<typeof createDatabaseClient>[0]): void {
  runCoreMigrations(createDatabaseClient(sqlite));
}

async function buildImportApp(): Promise<FastifyInstance> {
  const dataDir = mkdtempSync(join(tmpdir(), 'workbench-local-import-routes-'));
  temporaryDirectories.push(dataDir);
  const dbPath = join(dataDir, 'accounts', 'local-default', 'workbench.db');
  const holder = new ConnectionHolder();
  openHolders.push(holder);
  migrate(holder.open(dbPath));

  const restore = new RestoreService({
    holder,
    state: new ServiceState(),
    dataDir,
    dbPath: () => dbPath,
    source: { list: async () => [], download: async () => Buffer.alloc(0) },
    migrate,
    moduleIds: [],
  });

  const app = await buildApp({ getSqlite: () => holder.current(), modules: [], restore });
  openApps.push(app);
  return app;
}

/** 造一份能被导入的本地 .db.gz。 */
function seedFile(): string {
  const directory = mkdtempSync(join(tmpdir(), 'workbench-import-file-'));
  temporaryDirectories.push(directory);
  const path = join(directory, 'seed.db');
  const connection = openSqliteConnection(path);
  migrate(connection);
  connection.close();
  const gzPath = join(directory, '2026-08-19T10-00-00-000Z.db.gz');
  writeFileSync(gzPath, gzipSync(readFileSync(path)));
  return gzPath;
}

afterEach(async () => {
  for (const app of openApps.splice(0)) await app.close();
  for (const holder of openHolders.splice(0)) holder.close();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('本地导入路由', () => {
  it('预检的响应形状与契约一致', async () => {
    const app = await buildImportApp();

    const res = await app.inject({
      method: 'POST',
      url: LOCAL_IMPORT_API.preflight(),
      payload: { filePath: seedFile() },
    });

    expect(res.statusCode).toBe(200);
    expect(() => localImportPreflightResponseSchema.parse(res.json())).not.toThrow();
  });

  it('缺少 filePath → 400，而不是 500', async () => {
    const app = await buildImportApp();

    const res = await app.inject({
      method: 'POST',
      url: LOCAL_IMPORT_API.preflight(),
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ requestId: expect.any(String) });
  });

  it('文件不存在 → 404，界面据此提示重新选文件', async () => {
    const app = await buildImportApp();

    const res = await app.inject({
      method: 'POST',
      url: LOCAL_IMPORT_API.preflight(),
      payload: { filePath: join(tmpdir(), 'wb-no-such.db.gz') },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('本地导入的确认路由', () => {
  it('预检之后确认，返回的状态形状与契约一致', async () => {
    const app = await buildImportApp();
    const filePath = seedFile();
    await app.inject({
      method: 'POST',
      url: LOCAL_IMPORT_API.preflight(),
      payload: { filePath },
    });

    const res = await app.inject({
      method: 'POST',
      url: LOCAL_IMPORT_API.confirm(),
      payload: { filePath },
    });

    expect(res.statusCode).toBe(200);
    expect(() => restoreStateSchema.parse(res.json())).not.toThrow();
  });

  it('没预检过就确认 → 409，而不是 500', async () => {
    const app = await buildImportApp();

    const res = await app.inject({
      method: 'POST',
      url: LOCAL_IMPORT_API.confirm(),
      payload: { filePath: seedFile() },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ requestId: expect.any(String) });
  });

  it('缺少 filePath → 400', async () => {
    const app = await buildImportApp();

    const res = await app.inject({
      method: 'POST',
      url: LOCAL_IMPORT_API.confirm(),
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });
});
