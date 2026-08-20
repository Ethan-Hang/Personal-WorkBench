import type { GitHubDeviceCode, GitHubDevicePollResponse } from '@workbench/sync/contract';

export const GITHUB_CLIENT_ID = 'Iv23li52b4bDFNmeQqed';

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const AUTHENTICATED_USER_URL = 'https://api.github.com/user';
const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';
const GITHUB_API_VERSION = '2022-11-28';
const REQUEST_TIMEOUT_MS = 15_000;

type JsonObject = Record<string, unknown>;

export interface GitHubDeviceFlow {
  start(): Promise<GitHubDeviceCode>;
  poll(deviceCode: string, interval: number): Promise<GitHubDevicePollResponse>;
}

function githubError(message: string): Error {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = 502;
  return error;
}

function object(value: unknown, action: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw githubError(`GitHub ${action}返回了无效的 JSON`);
  }
  return value as JsonObject;
}

function stringField(value: JsonObject, field: string, action: string): string {
  const fieldValue = value[field];
  if (typeof fieldValue !== 'string' || fieldValue.length === 0) {
    throw githubError(`GitHub ${action}响应缺少 ${field}`);
  }
  return fieldValue;
}

function positiveIntegerField(value: JsonObject, field: string, action: string): number {
  const fieldValue = value[field];
  if (!Number.isInteger(fieldValue) || (fieldValue as number) <= 0) {
    throw githubError(`GitHub ${action}响应缺少有效的 ${field}`);
  }
  return fieldValue as number;
}

function optionalPositiveInteger(value: unknown): number | undefined {
  return Number.isInteger(value) && (value as number) > 0 ? (value as number) : undefined;
}

async function jsonResponse(response: Response, action: string): Promise<JsonObject> {
  if (!response.ok) {
    throw githubError(`GitHub ${action}失败（HTTP ${response.status}）`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw githubError(`GitHub ${action}返回了无法解析的 JSON`);
  }
  return object(body, action);
}

function oauthHeaders(): HeadersInit {
  return {
    accept: 'application/json',
    'content-type': 'application/x-www-form-urlencoded',
  };
}

export class GitHubDeviceFlowClient implements GitHubDeviceFlow {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async start(): Promise<GitHubDeviceCode> {
    const body = new URLSearchParams({ client_id: GITHUB_CLIENT_ID });
    const response = await this.request(DEVICE_CODE_URL, 'Device Flow 初始化', {
      method: 'POST',
      headers: oauthHeaders(),
      body,
    });
    const data = await jsonResponse(response, 'Device Flow 初始化');

    return {
      deviceCode: stringField(data, 'device_code', 'Device Flow 初始化'),
      userCode: stringField(data, 'user_code', 'Device Flow 初始化'),
      verificationUri: stringField(data, 'verification_uri', 'Device Flow 初始化'),
      expiresIn: positiveIntegerField(data, 'expires_in', 'Device Flow 初始化'),
      interval: positiveIntegerField(data, 'interval', 'Device Flow 初始化'),
    };
  }

  async poll(deviceCode: string, interval: number): Promise<GitHubDevicePollResponse> {
    const body = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      device_code: deviceCode,
      grant_type: DEVICE_GRANT_TYPE,
    });
    const response = await this.request(ACCESS_TOKEN_URL, 'Device Flow 轮询', {
      method: 'POST',
      headers: oauthHeaders(),
      body,
    });
    const data = await jsonResponse(response, 'Device Flow 轮询');

    if (typeof data.error === 'string') {
      return this.mapPollError(data, interval);
    }

    const accessToken = stringField(data, 'access_token', 'Device Flow 轮询');
    const user = await this.authenticatedUser(accessToken);
    const refreshToken =
      typeof data.refresh_token === 'string' && data.refresh_token.length > 0
        ? data.refresh_token
        : undefined;
    const expiresIn = optionalPositiveInteger(data.expires_in);
    const refreshTokenExpiresIn = optionalPositiveInteger(data.refresh_token_expires_in);

    return {
      status: 'authorized',
      credential: {
        accessToken,
        tokenType: stringField(data, 'token_type', 'Device Flow 轮询'),
        scope: typeof data.scope === 'string' ? data.scope : '',
        ...(refreshToken === undefined ? {} : { refreshToken }),
        ...(expiresIn === undefined ? {} : { expiresIn }),
        ...(refreshTokenExpiresIn === undefined ? {} : { refreshTokenExpiresIn }),
      },
      user,
    };
  }

  private mapPollError(data: JsonObject, interval: number): GitHubDevicePollResponse {
    switch (data.error) {
      case 'authorization_pending':
        return { status: 'pending', interval };
      case 'slow_down':
        return {
          status: 'slow_down',
          interval: optionalPositiveInteger(data.interval) ?? interval + 5,
        };
      case 'expired_token':
      case 'token_expired':
        return { status: 'expired' };
      case 'access_denied':
        return { status: 'denied' };
      default: {
        const description =
          typeof data.error_description === 'string' ? `：${data.error_description}` : '';
        throw githubError(`GitHub Device Flow 失败（${String(data.error)}）${description}`);
      }
    }
  }

  private async authenticatedUser(
    accessToken: string,
  ): Promise<{ login: string; id: number; avatarUrl?: string }> {
    const response = await this.request(AUTHENTICATED_USER_URL, '用户信息读取', {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${accessToken}`,
        'user-agent': 'Personal-WorkBench',
        'x-github-api-version': GITHUB_API_VERSION,
      },
    });
    const data = await jsonResponse(response, '用户信息读取');
    const id = data.id;
    if (!Number.isInteger(id) || (id as number) < 0) {
      throw githubError('GitHub 用户信息响应缺少有效的 id');
    }
    const avatarUrl =
      typeof data.avatar_url === 'string' && data.avatar_url.length > 0
        ? data.avatar_url
        : undefined;
    return {
      login: stringField(data, 'login', '用户信息读取'),
      id: id as number,
      ...(avatarUrl !== undefined ? { avatarUrl } : {}),
    };
  }

  private async request(url: string, action: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetcher(url, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw githubError(`GitHub ${action}请求失败`);
    }
  }
}
