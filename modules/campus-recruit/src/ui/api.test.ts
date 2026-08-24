import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteApplication,
  deleteRound,
  fetchApplications,
  fetchSeasons,
  fetchStats,
  patchApplication,
  patchRound,
  postApplication,
  postApply,
  postRound,
} from './api.js';

type CapturedCall = { url: string; init: RequestInit | undefined };

const APPLICATION = {
  id: 'a1',
  seasonId: 'season-legacy-autumn',
  seasonName: '秋招',
  company: '星云科技',
  position: '固件工程师',
  companyType: '民营',
  industry: '智能硬件',
  city: '深圳',
  channel: '官网',
  referral: null,
  applyEmail: 'campus@example.com',
  applyPhone: '13800138000',
  priority: 'S',
  applyDeadlineDate: '2026-09-01',
  appliedAt: null,
  outcome: null,
  outcomeAt: null,
  shelvedAt: null,
  salary: '20k-30k',
  link: 'https://example.com/jobs/firmware',
  notes: '准备 RTOS 项目说明',
  status: { code: 'pending', label: '待投递', failedRoundName: null },
  rounds: [
    {
      id: 'r1',
      applicationId: 'a1',
      sequence: 1,
      kind: 'written',
      name: '笔试',
      scheduledAt: '2026-09-03T02:00:00.000Z',
      format: '线上',
      durationMin: 90,
      outcome: 'pending',
      outcomeAt: null,
      notes: null,
      itemId: 'item-r1',
    },
  ],
  createdAt: '2026-08-18T01:02:03.000Z',
  updatedAt: '2026-08-18T01:02:03.000Z',
} as const;

const STATS = {
  total: 1,
  pending: 1,
  applied: 0,
  assessment: 0,
  technical: 0,
  hr: 0,
  offers: 0,
  failed: 0,
  shelved: 0,
  rates: {
    applicationToAssessment: null,
    applicationToTechnical: null,
    technicalToOffer: null,
  },
  failedByKind: [],
} as const;

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
    return Promise.resolve(responses.shift() ?? jsonResponse(APPLICATION));
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('campus browser API', () => {
  it('apply and delete requests have no JSON content-type when they have no body', async () => {
    responses.push(jsonResponse(APPLICATION), new Response(null, { status: 204 }));

    await postApply('a1');
    await deleteApplication('a1');

    expect(headerOf(calls[0]!.init, 'Content-Type')).toBeNull();
    expect(headerOf(calls[1]!.init, 'Content-Type')).toBeNull();
  });

  it('application creation sends JSON and validates the response', async () => {
    await postApplication({
      company: '星云科技',
      position: '固件工程师',
      priority: 'S',
      seasonId: 'season-legacy-autumn',
    });

    expect(calls[0]).toMatchObject({
      url: '/api/campus/applications',
      init: { method: 'POST' },
    });
    expect(headerOf(calls[0]!.init, 'Content-Type')).toBe('application/json');
    expect(calls[0]!.init?.body).toBe(
      JSON.stringify({
        company: '星云科技',
        position: '固件工程师',
        priority: 'S',
        seasonId: 'season-legacy-autumn',
      }),
    );
    expect(
      await postApplication({
        company: '星云科技',
        position: '固件工程师',
        seasonId: 'season-legacy-autumn',
      }),
    ).toEqual(APPLICATION);
  });

  it('uses the application list, update, and apply endpoints with their required methods', async () => {
    responses.push(
      jsonResponse({ applications: [APPLICATION] }),
      jsonResponse(APPLICATION),
      jsonResponse(APPLICATION),
    );

    await expect(fetchApplications()).resolves.toEqual({ applications: [APPLICATION] });
    await patchApplication('a/1', { city: '上海' });
    await postApply('a/1');

    expect(calls.map(({ url, init }) => [url, init?.method ?? 'GET'])).toEqual([
      ['/api/campus/applications', 'GET'],
      ['/api/campus/applications/a%2F1', 'PATCH'],
      ['/api/campus/applications/a%2F1/apply', 'POST'],
    ]);
    expect(calls[1]!.init?.body).toBe(JSON.stringify({ city: '上海' }));
  });

  it('uses the round create, update, and delete endpoints with their required methods', async () => {
    responses.push(jsonResponse(APPLICATION), jsonResponse(APPLICATION), jsonResponse(APPLICATION));

    await postRound('a/1', { kind: 'technical', name: '一面' });
    await patchRound('r/1', { sequence: 2 });
    await deleteRound('r/1');

    expect(calls.map(({ url, init }) => [url, init?.method])).toEqual([
      ['/api/campus/applications/a%2F1/rounds', 'POST'],
      ['/api/campus/rounds/r%2F1', 'PATCH'],
      ['/api/campus/rounds/r%2F1', 'DELETE'],
    ]);
    expect(calls[0]!.init?.body).toBe(JSON.stringify({ kind: 'technical', name: '一面' }));
    expect(calls[1]!.init?.body).toBe(JSON.stringify({ sequence: 2 }));
    expect(headerOf(calls[2]!.init, 'Content-Type')).toBeNull();
  });

  it('loads statistics through the shared response schema', async () => {
    responses.push(jsonResponse(STATS));

    await expect(fetchStats()).resolves.toEqual(STATS);
    expect(calls[0]!.url).toBe('/api/campus/stats');
    expect(calls[0]!.init?.method).toBeUndefined();
  });

  it('does not parse a 204 response body', async () => {
    const json = vi.fn<() => Promise<unknown>>();
    responses.push({ ok: true, status: 204, json });

    await expect(deleteApplication('a1')).resolves.toBeUndefined();
    expect(json).not.toHaveBeenCalled();
  });

  it('surfaces the server error message for non-success responses', async () => {
    responses.push(jsonResponse({ error: '该投递不存在' }, 404));

    await expect(postApply('missing')).rejects.toThrow('该投递不存在');
  });

  it('rejects malformed successful responses instead of trusting JSON', async () => {
    responses.push(jsonResponse({ ...APPLICATION, rounds: [{ id: 'incomplete' }] }));

    await expect(postApply('a1')).rejects.toThrow();
  });
  it('季筛选进查询串，且 id 会被转义；省略时不带参数', async () => {
    responses.push(
      jsonResponse({ applications: [APPLICATION] }),
      jsonResponse({ applications: [] }),
      jsonResponse({ seasons: [] }),
    );

    await fetchApplications('s/1');
    await fetchApplications();
    await fetchSeasons();

    expect(calls[0]!.url).toBe('/api/campus/applications?seasonId=s%2F1');
    expect(calls[1]!.url).toBe('/api/campus/applications');
    expect(calls[2]!.url).toBe('/api/campus/seasons');
  });
});
