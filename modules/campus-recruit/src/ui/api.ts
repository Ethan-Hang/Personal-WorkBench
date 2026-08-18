import {
  applicationViewSchema,
  applicationsResponseSchema,
  statsResponseSchema,
  type ApplicationView,
  type CreateApplicationInput,
  type CreateRoundInput,
  type StatsResponse,
  type UpdateApplicationInput,
  type UpdateRoundInput,
} from '../contract.js';

async function request(url: string, init?: RequestInit): Promise<unknown> {
  const headers = init?.body === undefined ? undefined : { 'Content-Type': 'application/json' };
  const response = await fetch(url, { ...init, headers });
  const body = response.status === 204 ? undefined : await response.json().catch(() => ({}));

  if (!response.ok) {
    const payload = body as { error?: string; requestId?: string } | undefined;
    const message = payload?.error ?? `请求失败（${response.status}）`;
    // 附上服务端的请求编号：界面上这一句报错据此才能和日志里的整段堆栈对上号。
    throw new Error(
      payload?.requestId === undefined ? message : `${message}（编号 ${payload.requestId}）`,
    );
  }

  return body;
}

function json(method: 'POST' | 'PATCH', body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}

function idSegment(id: string): string {
  return encodeURIComponent(id);
}

export const fetchApplications = async (): Promise<{ applications: ApplicationView[] }> =>
  applicationsResponseSchema.parse(await request('/api/campus/applications'));

export const postApplication = async (input: CreateApplicationInput): Promise<ApplicationView> =>
  applicationViewSchema.parse(await request('/api/campus/applications', json('POST', input)));

export const patchApplication = async (
  id: string,
  input: UpdateApplicationInput,
): Promise<ApplicationView> =>
  applicationViewSchema.parse(
    await request(`/api/campus/applications/${idSegment(id)}`, json('PATCH', input)),
  );

export const postApply = async (id: string): Promise<ApplicationView> =>
  applicationViewSchema.parse(
    await request(`/api/campus/applications/${idSegment(id)}/apply`, { method: 'POST' }),
  );

export const deleteApplication = async (id: string): Promise<void> => {
  await request(`/api/campus/applications/${idSegment(id)}`, { method: 'DELETE' });
};

export const postRound = async (
  applicationId: string,
  input: CreateRoundInput,
): Promise<ApplicationView> =>
  applicationViewSchema.parse(
    await request(
      `/api/campus/applications/${idSegment(applicationId)}/rounds`,
      json('POST', input),
    ),
  );

export const patchRound = async (id: string, input: UpdateRoundInput): Promise<ApplicationView> =>
  applicationViewSchema.parse(
    await request(`/api/campus/rounds/${idSegment(id)}`, json('PATCH', input)),
  );

export const deleteRound = async (id: string): Promise<ApplicationView> =>
  applicationViewSchema.parse(
    await request(`/api/campus/rounds/${idSegment(id)}`, { method: 'DELETE' }),
  );

export const fetchStats = async (): Promise<StatsResponse> =>
  statsResponseSchema.parse(await request('/api/campus/stats'));
