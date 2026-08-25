import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { localDayOf, nowIso, type ServerModuleDefinition } from '@workbench/core';
import { openTestDatabase, runMigrationsFrom } from '@workbench/data';
import { createCampusRecruitServerModule } from '@workbench/module-campus-recruit';
import { SqliteCampusRecruitRepository } from '@workbench/module-campus-recruit/storage';
import { createNotesServerModule } from '@workbench/module-notes';
import { SqliteNoteRepository } from '@workbench/module-notes/storage';
import { createTodoServerModule } from '@workbench/module-todo';
import { SqliteTodoRepository } from '@workbench/module-todo/storage';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';

const compositionDeadlineMs = 10_000;
const readinessRequestTimeoutMs = 500;
const compositionTestTimeoutMs = 20_000;

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('无法分配测试端口');
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
  return address.port;
}

async function waitUntilReady(
  origin: string,
  child: ChildProcessWithoutNullStreams,
  deadline: number,
): Promise<void> {
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`服务端提前退出：${child.exitCode}`);
    try {
      const response = await fetch(`${origin}/api/health`, {
        signal: signalBefore(deadline, readinessRequestTimeoutMs),
      });
      if (response.ok) return;
    } catch {
      // 启动中的连接失败是预期状态，继续短暂轮询。
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(50, remainingMs)));
    }
  }
  throw new Error('等待测试服务端启动超时');
}

function signalBefore(deadline: number, maximumMs?: number): AbortSignal {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) throw new Error('正式服务端入口验收已超过总截止时间');
  return AbortSignal.timeout(Math.min(remainingMs, maximumMs ?? remainingMs));
}

async function stopServer(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const forceKill = setTimeout(() => child.kill('SIGKILL'), 3_000);
    forceKill.unref();
    child.once('exit', () => {
      clearTimeout(forceKill);
      resolve();
    });
    child.kill();
  });
}

function fakeModule(id: string, calls: string[]): ServerModuleDefinition {
  return {
    id,
    migrations: [],
    registerRoutes(app, ctx) {
      calls.push(`${id}:${ctx.moduleId}`);
      (app as FastifyInstance).get(`/api/${id}/ping`, async () => ({ from: ctx.moduleId }));
    },
  };
}

describe('buildApp', () => {
  it('暴露健康检查', async () => {
    const { sqlite } = openTestDatabase();
    const app = await buildApp({ getSqlite: () => sqlite, modules: [] });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
    await app.close();
  });

  it('为每个模块调用 registerRoutes，并传入以自身 id 构造的 ModuleContext', async () => {
    const { sqlite } = openTestDatabase();
    const calls: string[] = [];
    const app = await buildApp({
      getSqlite: () => sqlite,
      modules: [fakeModule('alpha', calls), fakeModule('beta', calls)],
    });

    expect(calls).toEqual(['alpha:alpha', 'beta:beta']);

    const res = await app.inject({ method: 'GET', url: '/api/beta/ping' });
    expect(res.json()).toEqual({ from: 'beta' });
    await app.close();
  });

  it('模块经 ModuleContext 创建的 Item 自动带上自己的 sourceModule', async () => {
    const { sqlite } = openTestDatabase();
    let createdSource = '';
    const probe: ServerModuleDefinition = {
      id: 'probe',
      migrations: [],
      async registerRoutes(_app, ctx) {
        const item = await ctx.items.create(ctx.moduleId, { kind: 'task', title: '探针' });
        createdSource = item.sourceModule;
      },
    };
    const app = await buildApp({ getSqlite: () => sqlite, modules: [probe] });
    expect(createdSource).toBe('probe');
    await app.close();
  });

  it('注册 todo 与 campus 模块后，今日工作台可见秋招截止事项', async () => {
    const { db, sqlite } = openTestDatabase();
    runMigrationsFrom(db, 'modules/todo/migrations');
    const campus = createCampusRecruitServerModule(new SqliteCampusRecruitRepository(() => sqlite));
    const todo = createTodoServerModule(new SqliteTodoRepository(() => sqlite));
    const app = await buildApp({ getSqlite: () => sqlite, modules: [todo, campus] });
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const todayDate = localDayOf(nowIso(), zone);

    const created = await app.inject({
      method: 'POST',
      url: '/api/campus/applications',
      payload: {
        company: '星云科技',
        position: '固件工程师',
        priority: 'S',
        seasonId: 'season-legacy-autumn',
        applyDeadlineDate: todayDate,
      },
    });
    expect(created.statusCode).toBe(201);

    const today = await app.inject({ method: 'GET', url: '/api/todo/today' });
    expect(today.statusCode).toBe(200);
    expect(today.json().tasks).toContainEqual(
      expect.objectContaining({
        title: '投递 星云科技 固件工程师',
        sourceModule: 'campus-recruit',
      }),
    );

    await app.close();
    sqlite.close();
  });

  it('注册 notes 模块后，可通过 API 创建便签并一键派发待办与关联', async () => {
    const { db, sqlite } = openTestDatabase();
    runMigrationsFrom(db, 'modules/notes/migrations');
    const notes = createNotesServerModule(new SqliteNoteRepository(() => sqlite));
    const app = await buildApp({ getSqlite: () => sqlite, modules: [notes] });

    // 1. 创建便签
    const createdNoteRes = await app.inject({
      method: 'POST',
      url: '/api/v1/notes',
      payload: {
        title: '架构设计便签',
        content: '# 架构要点\n- 模块间零依赖\n- Core 零感知',
      },
    });
    expect(createdNoteRes.statusCode).toBe(201);
    const createdNote = createdNoteRes.json();
    expect(createdNote.id).toBeTruthy();
    expect(createdNote.title).toBe('架构设计便签');

    // 2. 一键派发待办
    const createTodoRes = await app.inject({
      method: 'POST',
      url: `/api/v1/notes/${createdNote.id}/create-todo`,
      payload: {
        title: '落实架构设计评审',
        importance: 'high',
      },
    });
    expect(createTodoRes.statusCode).toBe(201);
    const todoResult = createTodoRes.json();
    expect(todoResult.link.title).toBe('落实架构设计评审');
    expect(todoResult.link.sourceModule).toBe('notes');
    expect(todoResult.note.todoLinks).toHaveLength(1);

    // 3. 查便签详情带关联待办
    const getNoteRes = await app.inject({
      method: 'GET',
      url: `/api/v1/notes/${createdNote.id}`,
    });
    expect(getNoteRes.statusCode).toBe(200);
    expect(getNoteRes.json().todoLinks).toHaveLength(1);
    expect(getNoteRes.json().todoLinks[0].title).toBe('落实架构设计评审');

    await app.close();
    sqlite.close();
  });

  it(
    '浏览器发出的无 body POST 不会撞上 415',
    async () => {
      // `fetch(url, { method: 'POST' })` 不带 content-type，Fastify 默认对它回 415。
      // **这个形状 app.inject() 复现不了**——所以这条守卫必须跑在真实 HTTP 上，
      // 与 CLAUDE.md 记着的那次「漏掉一个 400」是同一类教训。
      const tempDirectory = await mkdtemp(join(tmpdir(), 'workbench-bodyless-'));
      let child: ChildProcessWithoutNullStreams | undefined;

      try {
        const port = await unusedPort();
        const origin = `http://127.0.0.1:${port}`;
        child = spawn(process.execPath, ['--import', 'tsx', 'packages/server/src/index.ts'], {
          cwd: process.cwd(),
          env: {
            ...process.env,
            PORT: String(port),
            WORKBENCH_DB: join(tempDirectory, 'acceptance.db'),
            WORKBENCH_DATA_DIR: tempDirectory,
          },
        });
        const deadline = Date.now() + compositionDeadlineMs;
        await waitUntilReady(origin, child, deadline);

        const backup = await fetch(`${origin}/api/backup/run`, {
          method: 'POST',
          signal: signalBefore(deadline),
        });
        expect(backup.status).toBe(400);

        const rollback = await fetch(`${origin}/api/restore/rollback`, {
          method: 'POST',
          signal: signalBefore(deadline),
        });
        expect(rollback.status).toBe(409);

        // 本地备份没有「未配置」这个前置门槛，所以它直接跑通——顺带证明组合根
        // 真的装配了 LocalBackupService，而不只是路由文件写好了没人调。
        const local = await fetch(`${origin}/api/local-backup/run`, {
          method: 'POST',
          signal: signalBefore(deadline),
        });
        expect(local.status).toBe(200);
      } finally {
        if (child !== undefined) await stopServer(child);
        await rm(tempDirectory, { recursive: true, force: true });
      }
    },
    compositionTestTimeoutMs,
  );

  it(
    '正式服务端入口注册 campus 模块并把今日截止事项聚合到 Today',
    async () => {
      const tempDirectory = await mkdtemp(join(tmpdir(), 'workbench-campus-'));
      let child: ChildProcessWithoutNullStreams | undefined;

      try {
        const databasePath = join(tempDirectory, 'acceptance.db');
        const port = await unusedPort();
        const origin = `http://127.0.0.1:${port}`;
        child = spawn(process.execPath, ['--import', 'tsx', 'packages/server/src/index.ts'], {
          cwd: process.cwd(),
          env: { ...process.env, PORT: String(port), WORKBENCH_DB: databasePath },
        });
        const deadline = Date.now() + compositionDeadlineMs;

        await waitUntilReady(origin, child, deadline);
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const created = await fetch(`${origin}/api/campus/applications`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            company: '星云科技',
            position: '固件工程师',
            priority: 'S',
            seasonId: 'season-legacy-autumn',
            applyDeadlineDate: localDayOf(nowIso(), zone),
          }),
          signal: signalBefore(deadline),
        });
        expect(created.status).toBe(201);

        const today = await fetch(`${origin}/api/todo/today`, {
          signal: signalBefore(deadline),
        });
        expect(today.status).toBe(200);
        expect((await today.json()).tasks).toContainEqual(
          expect.objectContaining({
            title: '投递 星云科技 固件工程师',
            sourceModule: 'campus-recruit',
          }),
        );
      } finally {
        if (child !== undefined) await stopServer(child);
        await rm(tempDirectory, { recursive: true, force: true });
      }
    },
    compositionTestTimeoutMs,
  );
});

describe('统一错误出口', () => {
  /** 注册一个会抛异常的探针路由，模拟「意料外的错误」。 */
  function throwingModule(message: string): ServerModuleDefinition {
    return {
      id: 'probe',
      migrations: [],
      registerRoutes(app) {
        (app as FastifyInstance).get('/api/probe/boom', async () => {
          throw new Error(message);
        });
      },
    };
  }

  it('意料外的错误返回真实消息与请求编号', async () => {
    const { sqlite } = openTestDatabase();
    const app = await buildApp({
      getSqlite: () => sqlite,
      modules: [throwingModule('数据库连接断了')],
    });

    const res = await app.inject({ method: 'GET', url: '/api/probe/boom' });

    expect(res.statusCode).toBe(500);
    // 本地单用户工具，不遮蔽 5xx 的真实消息——遮蔽只会让自己排查更难。
    expect(res.json().error).toBe('数据库连接断了');
    // 编号是界面报错与日志堆栈之间唯一的桥。
    expect(res.json().requestId).toBeTruthy();

    await app.close();
  });

  /**
   * 路由里显式 `reply.code(400).send(...)` 不经过 setErrorHandler，因此不带编号。
   * 这是刻意的，不是遗漏：编号的用途是把界面上的报错和日志里的堆栈连起来，
   * 而预期内的 4xx 既不记日志、消息本身也已经具体（「标题不能为空」）。
   * 在没有日志行可对的地方给出编号，只会让人去 grep 一个不存在的东西。
   */
  it('预期内的 4xx 保留自己的消息，且不带编号', async () => {
    const { db, sqlite } = openTestDatabase();
    runMigrationsFrom(db, 'modules/todo/migrations');
    const app = await buildApp({
      getSqlite: () => sqlite,
      modules: [createTodoServerModule(new SqliteTodoRepository(() => sqlite))],
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/todo/tasks',
      payload: { title: '   ' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBeTruthy();
    expect(res.json().requestId).toBeUndefined();

    await app.close();
  });
});
