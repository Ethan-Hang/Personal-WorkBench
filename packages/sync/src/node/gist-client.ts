import { SyncError } from './errors.js';
import type { SecretEnvelope } from './crypto.js';

/** gist 里的文件名。固定一个，才谈得上「更新同一份」而不是每次多一个文件。 */
export const GIST_FILENAME = 'personal-workbench.settings.json';

const API = 'https://api.github.com';

interface GistFile {
  content?: string;
  truncated?: boolean;
}

interface GistResponse {
  id: string;
  files?: Record<string, GistFile | undefined>;
}

/**
 * 设置与凭据的 Gist 存取。
 *
 * **secret gist 不是私有的**——它只是不被搜索索引，任何拿到 URL 的人无需登录即可读
 * 全文。所以放进去的一律是 `crypto.ts` 加密后的信封，**GitHub token 与任何业务数据
 * 都不进 Gist**。
 */
export class GistClient {
  constructor(
    private readonly token: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async create(envelope: SecretEnvelope): Promise<string> {
    const body = {
      description: 'Personal Workbench 设置与凭据（已加密）',
      // secret gist：不出现在个人主页、不被索引。它不是访问控制，加密才是。
      public: false,
      files: { [GIST_FILENAME]: { content: JSON.stringify(envelope, null, 2) } },
    };
    const gist = await this.request<GistResponse>('POST', '/gists', body);
    return gist.id;
  }

  async update(gistId: string, envelope: SecretEnvelope): Promise<void> {
    await this.request('PATCH', `/gists/${encodeURIComponent(gistId)}`, {
      files: { [GIST_FILENAME]: { content: JSON.stringify(envelope, null, 2) } },
    });
  }

  /** 云端还没有这份文件时给 `undefined`——那是「还没同步过」，不是错误。 */
  async read(gistId: string): Promise<SecretEnvelope | undefined> {
    const gist = await this.request<GistResponse>('GET', `/gists/${encodeURIComponent(gistId)}`);
    const file = gist.files?.[GIST_FILENAME];
    if (file === undefined) return undefined;

    // 单文件 1MB 上限，超出 GitHub 会把 content 截断并置 truncated。
    // 设置与凭据远低于此，真撞上说明有人往里塞了业务数据——**绝不能当成空数据吞掉**。
    if (file.truncated === true) {
      throw new SyncError('云端设置被 GitHub 截断了（超过 1MB），拒绝按残缺内容同步', 409);
    }
    if (file.content === undefined) return undefined;

    try {
      return JSON.parse(file.content) as SecretEnvelope;
    } catch (cause) {
      throw new SyncError('云端设置不是合法 JSON', 409, { cause });
    }
  }

  private async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.fetchFn(`${API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    if (!response.ok) throw toGistError(response.status, await safeMessage(response));
    return (await response.json()) as T;
  }
}

async function safeMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

/** 只映射可预期的错误；其余原样带着 GitHub 的 message 冒上去。 */
function toGistError(status: number, message: string): SyncError {
  // 401 要**单独落成 401**：它意味着 token 失效，得引导用户重新登录，
  // 而不是给一句「同步失败」让人不知道下一步该干什么。
  if (status === 401) return new SyncError(`GitHub 登录已失效，请重新登录（${message}）`, 401);
  if (status === 403) return new SyncError(`GitHub 拒绝了这次操作：${message}`, 403);
  if (status === 404) return new SyncError(`云端 gist 不存在或已被删除：${message}`, 409);
  return new SyncError(`GitHub 返回 ${status}：${message}`, 502);
}
