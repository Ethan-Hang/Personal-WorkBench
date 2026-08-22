import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteCheckin,
  deleteHabit,
  fetchHabit,
  fetchHabits,
  fetchHistory,
  fetchToday,
  patchHabit,
  postArchive,
  postHabit,
  postUnarchive,
  putCheckin,
} from './api.js';

type CapturedCall = { url: string; init: RequestInit | undefined };

const HABIT_VIEW = {
  id: 'h1',
  name: '晨跑',
  notes: '每天早起 3 公里',
  targetValue: 1,
  unit: '次',
  freqKind: 'daily' as const,
  weekdays: null,
  weeklyCount: null,
  startDate: '2026-08-01',
  archivedAt: null,
  colorToken: 'orange',
  position: 0,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const TODAY_HABIT = {
  habit: HABIT_VIEW,
  dueToday: true,
  todayValue: 0,
  progress: { current: 0, target: 1 },
  streak: 5,
};

let calls: CapturedCall[];
let responses: Array<Response | { ok: boolean; status: number; json: () => Promise<unknown> }>;
let originalFetch: typeof globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function headerOf(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

beforeEach(() => {
  calls = [];
  responses = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(responses.shift() ?? jsonResponse(HABIT_VIEW));
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('request 的 Content-Type 处理与 415 守卫', () => {
  it('无 body 的 POST（archive / unarchive）不得声明 JSON content-type', async () => {
    responses.push(jsonResponse(HABIT_VIEW), jsonResponse(HABIT_VIEW));

    await postArchive('h1');
    await postUnarchive('h1');

    expect(calls).toHaveLength(2);

    expect(calls[0]!.url).toBe('/api/habit/habits/h1/archive');
    expect(calls[0]!.init?.method).toBe('POST');
    expect(calls[0]!.init?.body).toBeUndefined();
    expect(headerOf(calls[0]!.init, 'Content-Type')).toBeNull();

    expect(calls[1]!.url).toBe('/api/habit/habits/h1/unarchive');
    expect(calls[1]!.init?.method).toBe('POST');
    expect(calls[1]!.init?.body).toBeUndefined();
    expect(headerOf(calls[1]!.init, 'Content-Type')).toBeNull();
  });

  it('无 body 的 DELETE / GET 请求不得声明 JSON content-type', async () => {
    responses.push(
      new Response(null, { status: 204 }),
      new Response(null, { status: 204 }),
      jsonResponse(HABIT_VIEW),
    );

    await deleteHabit('h1');
    await deleteCheckin('h1', '2026-08-21', '2026-08-21');
    await fetchHabit('h1');

    expect(headerOf(calls[0]!.init, 'Content-Type')).toBeNull();
    expect(headerOf(calls[1]!.init, 'Content-Type')).toBeNull();
    expect(headerOf(calls[2]!.init, 'Content-Type')).toBeNull();
  });

  it('有 body 的 POST / PATCH / PUT 请求必须声明 JSON content-type 并序列化 body', async () => {
    responses.push(
      jsonResponse(HABIT_VIEW),
      jsonResponse(HABIT_VIEW),
      jsonResponse({ date: '2026-08-21', value: 1 }),
    );

    const createInput = { name: '晨跑', freqKind: 'daily' as const, startDate: '2026-08-01' };
    await postHabit(createInput);

    const patchInput = { name: '早起晨跑' };
    await patchHabit('h1', patchInput);

    const checkinInput = { value: 1, clientToday: '2026-08-21' };
    await putCheckin('h1', '2026-08-21', checkinInput);

    expect(calls[0]!.init?.method).toBe('POST');
    expect(calls[0]!.init?.body).toBe(JSON.stringify(createInput));
    expect(headerOf(calls[0]!.init, 'Content-Type')).toBe('application/json');

    expect(calls[1]!.init?.method).toBe('PATCH');
    expect(calls[1]!.init?.body).toBe(JSON.stringify(patchInput));
    expect(headerOf(calls[1]!.init, 'Content-Type')).toBe('application/json');

    expect(calls[2]!.init?.method).toBe('PUT');
    expect(calls[2]!.init?.body).toBe(JSON.stringify(checkinInput));
    expect(headerOf(calls[2]!.init, 'Content-Type')).toBe('application/json');
  });
});

describe('习惯前端传输层各个端点调用与参数编码', () => {
  it('fetchToday: 携带 date 查询参数', async () => {
    responses.push(jsonResponse({ habits: [TODAY_HABIT] }));

    const res = await fetchToday('2026-08-21');

    expect(calls[0]!.url).toBe('/api/habit/today?date=2026-08-21');
    expect(res).toEqual({ habits: [TODAY_HABIT] });
  });

  it('fetchHabits: 支持可选的 includeArchived 参数', async () => {
    responses.push(jsonResponse({ habits: [HABIT_VIEW] }), jsonResponse({ habits: [HABIT_VIEW] }));

    await fetchHabits();
    expect(calls[0]!.url).toBe('/api/habit/habits');

    await fetchHabits({ includeArchived: true });
    expect(calls[1]!.url).toBe('/api/habit/habits?includeArchived=true');
  });

  it('fetchHabit / patchHabit / deleteHabit: 正确转义 URL 路径中的特殊字符', async () => {
    responses.push(
      jsonResponse(HABIT_VIEW),
      jsonResponse(HABIT_VIEW),
      new Response(null, { status: 204 }),
    );

    await fetchHabit('a/b');
    await patchHabit('a/b', { name: '新名字' });
    await deleteHabit('a/b');

    expect(calls[0]!.url).toBe('/api/habit/habits/a%2Fb');
    expect(calls[1]!.url).toBe('/api/habit/habits/a%2Fb');
    expect(calls[2]!.url).toBe('/api/habit/habits/a%2Fb');
    expect(calls[2]!.init?.method).toBe('DELETE');
  });

  it('fetchHistory: 携带 from 与 to 查询参数并转义', async () => {
    const historyPayload = {
      habit: HABIT_VIEW,
      checkins: [{ date: '2026-08-21', value: 1 }],
    };
    responses.push(jsonResponse(historyPayload));

    const res = await fetchHistory('h/1', '2026-08-01', '2026-08-21');

    expect(calls[0]!.url).toBe('/api/habit/habits/h%2F1/history?from=2026-08-01&to=2026-08-21');
    expect(res).toEqual(historyPayload);
  });

  it('putCheckin 与 deleteCheckin: 正确构造打卡路径与 clientToday 查询参数', async () => {
    responses.push(
      jsonResponse({ date: '2026-08-21', value: 1 }),
      new Response(null, { status: 204 }),
    );

    const checkin = await putCheckin('h/1', '2026-08-21', { value: 1, clientToday: '2026-08-21' });
    expect(calls[0]!.url).toBe('/api/habit/habits/h%2F1/checkins/2026-08-21');
    expect(calls[0]!.init?.method).toBe('PUT');
    expect(checkin).toEqual({ date: '2026-08-21', value: 1 });

    await deleteCheckin('h/1', '2026-08-21', '2026-08-21');
    expect(calls[1]!.url).toBe(
      '/api/habit/habits/h%2F1/checkins/2026-08-21?clientToday=2026-08-21',
    );
    expect(calls[1]!.init?.method).toBe('DELETE');
  });

  it('204 响应不尝试解析 JSON 响应体', async () => {
    const json = vi.fn<() => Promise<unknown>>();
    responses.push({ ok: true, status: 204, json });

    await expect(deleteHabit('h1')).resolves.toBeUndefined();
    expect(json).not.toHaveBeenCalled();
  });

  it('响应体结构不合法时由 Zod 校验拦截报错', async () => {
    responses.push(jsonResponse({ id: 'h1' })); // 缺少众多必填字段

    await expect(fetchHabit('h1')).rejects.toThrow();
  });
});

describe('错误处理与请求编号', () => {
  it('服务端返回错误时透出错误提示', async () => {
    responses.push(jsonResponse({ error: '已有同名习惯「晨跑」' }, 409));

    await expect(
      postHabit({ name: '晨跑', freqKind: 'daily', startDate: '2026-08-01' }),
    ).rejects.toThrow('已有同名习惯「晨跑」');
  });

  it('服务端附带请求编号时，在错误提示中拼接编号', async () => {
    responses.push(jsonResponse({ error: '数据库繁忙', requestId: 'req-habit-123' }, 500));

    await expect(fetchToday('2026-08-21')).rejects.toThrow('数据库繁忙（编号 req-habit-123）');
  });

  it('服务端未附带请求编号时，不凭空生成编号后缀', async () => {
    responses.push(jsonResponse({ error: '不能给未来的日期打卡' }, 400));

    await expect(
      putCheckin('h1', '2026-08-25', { value: 1, clientToday: '2026-08-21' }),
    ).rejects.toThrow('不能给未来的日期打卡');
    await expect(
      putCheckin('h1', '2026-08-25', { value: 1, clientToday: '2026-08-21' }),
    ).rejects.not.toThrow('编号');
  });
});
