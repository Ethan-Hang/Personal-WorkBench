import {
  ACCOUNTS_API,
  GITHUB_AUTH_API,
  accountsResponseSchema,
  githubDeviceCodeSchema,
  githubDevicePollResponseSchema,
  type AccountsResponse,
  type BindGithubBody,
  type GitHubDeviceCode,
  type GitHubDevicePollResponse,
} from '@workbench/sync/contract';

export class AccountsApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly requestId?: string,
  ) {
    const suffix = requestId ? `（请求编号 ${requestId}）` : '';
    super(`${message}${suffix}`);
    this.name = 'AccountsApiError';
  }
}

async function requestJson<T>(
  url: string,
  init: RequestInit,
  schema: { parse: (data: unknown) => T },
  fetchFn: typeof fetch = fetch,
): Promise<T> {
  let res: Response;
  try {
    res = await fetchFn(url, init);
  } catch {
    throw new AccountsApiError('网络连接失败，请检查服务是否正常运行');
  }

  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const err = body as { error?: string; message?: string; requestId?: string } | null;
    const message = err?.error ?? err?.message ?? `请求失败：HTTP ${res.status}`;
    throw new AccountsApiError(message, res.status, err?.requestId);
  }

  try {
    return schema.parse(body);
  } catch {
    throw new AccountsApiError('服务器响应形状不符合契约约定', res.status);
  }
}

/** 获取全部账号列表与当前激活账号 ID */
export async function fetchAccounts(fetchFn: typeof fetch = fetch): Promise<AccountsResponse> {
  return requestJson(ACCOUNTS_API.root(), { method: 'GET' }, accountsResponseSchema, fetchFn);
}

/** 新建本地独立账号 */
export async function createAccount(
  displayName: string,
  fetchFn: typeof fetch = fetch,
): Promise<AccountsResponse> {
  return requestJson(
    ACCOUNTS_API.root(),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName }),
    },
    accountsResponseSchema,
    fetchFn,
  );
}

/** 切换当前激活账号 */
export async function switchAccount(
  id: string,
  fetchFn: typeof fetch = fetch,
): Promise<AccountsResponse> {
  return requestJson(
    ACCOUNTS_API.active(),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    },
    accountsResponseSchema,
    fetchFn,
  );
}

/** 删除指定账号及其本地数据 */
export async function deleteAccount(
  id: string,
  fetchFn: typeof fetch = fetch,
): Promise<AccountsResponse> {
  return requestJson(
    ACCOUNTS_API.byId(id),
    {
      method: 'DELETE',
    },
    accountsResponseSchema,
    fetchFn,
  );
}

/** 绑定 GitHub 账号与配置同步方向 */
export async function bindGithubAccount(
  id: string,
  body: BindGithubBody,
  fetchFn: typeof fetch = fetch,
): Promise<AccountsResponse> {
  return requestJson(
    ACCOUNTS_API.bindGithub(id),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    accountsResponseSchema,
    fetchFn,
  );
}

/** 解除 GitHub 绑定 */
export async function unbindGithubAccount(
  id: string,
  fetchFn: typeof fetch = fetch,
): Promise<AccountsResponse> {
  return requestJson(
    ACCOUNTS_API.github(id),
    {
      method: 'DELETE',
    },
    accountsResponseSchema,
    fetchFn,
  );
}

/** 发起 GitHub Device Flow 授权并获取 user_code */
export async function startGithubDeviceFlow(
  fetchFn: typeof fetch = fetch,
): Promise<GitHubDeviceCode> {
  return requestJson(
    GITHUB_AUTH_API.device,
    {
      method: 'POST',
    },
    githubDeviceCodeSchema,
    fetchFn,
  );
}

/** 轮询 GitHub Device Flow 授权结果 */
export async function pollGithubDeviceFlow(
  deviceCode: string,
  interval: number,
  fetchFn: typeof fetch = fetch,
): Promise<GitHubDevicePollResponse> {
  return requestJson(
    GITHUB_AUTH_API.poll,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceCode, interval }),
    },
    githubDevicePollResponseSchema,
    fetchFn,
  );
}
