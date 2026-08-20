import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fetchToday, fetchUnscheduled, fetchCalendar, patchSchedule } from './api.js';

type CapturedCall = { url: string; init: RequestInit | undefined };

let calls: CapturedCall[];
let originalFetch: typeof globalThis.fetch;

function headerOf(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

const mockItem = {
  id: 'wb-1',
  title: '排程测试任务',
  sourceModule: 'todo',
  kind: 'task',
  status: 'todo',
  importance: 'high',
  dueAt: null,
  scheduled: { kind: 'all-day', date: '2026-08-18' },
  urgency: 'none',
  priorityScore: 20,
  isImportantQuadrant: true,
  isUrgentQuadrant: false,
};

beforeEach(() => {
  calls = [];
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('workbench ui api', () => {
  it('fetchToday 请求 /api/workbench/today 且正确解析', async () => {
    globalThis.fetch = ((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            date: '2026-08-18',
            zone: 'Asia/Taipei',
            scheduled: [mockItem],
            overdue: [],
            completed: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }) as typeof globalThis.fetch;

    const data = await fetchToday();

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('/api/workbench/today');
    expect(calls[0]!.init?.body).toBeUndefined();
    expect(headerOf(calls[0]!.init, 'Content-Type')).toBeNull();
    expect(data.date).toBe('2026-08-18');
    expect(data.scheduled).toHaveLength(1);
    expect(data.scheduled[0]!.title).toBe('排程测试任务');
  });

  it('fetchUnscheduled 请求 /api/workbench/unscheduled', async () => {
    globalThis.fetch = ((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            items: [mockItem],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }) as typeof globalThis.fetch;

    const data = await fetchUnscheduled();

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('/api/workbench/unscheduled');
    expect(data.items).toHaveLength(1);
  });

  it('fetchCalendar 请求 /api/workbench/calendar?from=...&to=...', async () => {
    globalThis.fetch = ((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            from: '2026-08-18',
            to: '2026-08-24',
            zone: 'Asia/Taipei',
            items: [mockItem],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }) as typeof globalThis.fetch;

    const data = await fetchCalendar('2026-08-18', '2026-08-24');

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('/api/workbench/calendar?from=2026-08-18&to=2026-08-24');
    expect(data.from).toBe('2026-08-18');
    expect(data.to).toBe('2026-08-24');
    expect(data.items).toHaveLength(1);
  });

  it('patchSchedule 发送全天/定时/取消排程 PATCH 请求', async () => {
    globalThis.fetch = ((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(
        new Response(JSON.stringify(mockItem), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }) as typeof globalThis.fetch;

    const item = await patchSchedule('wb-1', {
      scheduled: { kind: 'all-day', date: '2026-08-20' },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('/api/workbench/items/wb-1/schedule');
    expect(calls[0]!.init?.method).toBe('PATCH');
    expect(headerOf(calls[0]!.init, 'Content-Type')).toBe('application/json');
    expect(calls[0]!.init?.body).toBe(
      JSON.stringify({ scheduled: { kind: 'all-day', date: '2026-08-20' } }),
    );
    expect(item.id).toBe('wb-1');
  });

  it('错误响应包含请求编号', async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: '排程失败', requestId: 'req-wb-99' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      )) as typeof globalThis.fetch;

    await expect(fetchToday()).rejects.toThrow('排程失败（编号 req-wb-99）');
  });
});
