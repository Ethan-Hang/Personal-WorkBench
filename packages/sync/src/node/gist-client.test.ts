import { describe, expect, it } from 'vitest';
import { GistClient, GIST_FILENAME } from './gist-client.js';
import { encryptEnvelope } from './crypto.js';

const envelope = encryptEnvelope({ hello: '世界' }, '口令口令', { device: '测试机' });

interface Call {
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
}

function stubFetch(responder: (call: Call) => { status: number; body: unknown }): {
  fetch: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetchFn = (async (input: string, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? 'GET',
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      headers: (init?.headers ?? {}) as Record<string, string>,
    };
    calls.push(call);
    const { status, body } = responder(call);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { fetch: fetchFn, calls };
}

describe('GistClient.create', () => {
  it('建的是 secret gist，并把信封放进约定的文件名', async () => {
    const { fetch, calls } = stubFetch(() => ({ status: 201, body: { id: 'gist-1' } }));

    const id = await new GistClient('ghu_token', fetch).create(envelope);

    expect(id).toBe('gist-1');
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe('https://api.github.com/gists');
    expect(calls[0]?.body).toMatchObject({ public: false });
    const files = (calls[0]?.body as { files: Record<string, { content: string }> }).files;
    expect(JSON.parse(files[GIST_FILENAME]?.content ?? '{}')).toEqual(envelope);
  });

  it('带上 token 与 GitHub 要求的 API 版本头', async () => {
    const { fetch, calls } = stubFetch(() => ({ status: 201, body: { id: 'gist-1' } }));

    await new GistClient('ghu_token', fetch).create(envelope);

    expect(calls[0]?.headers).toMatchObject({
      authorization: 'Bearer ghu_token',
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    });
  });
});

describe('GistClient.read', () => {
  it('读回信封', async () => {
    const { fetch } = stubFetch(() => ({
      status: 200,
      body: { id: 'gist-1', files: { [GIST_FILENAME]: { content: JSON.stringify(envelope) } } },
    }));

    expect(await new GistClient('ghu_token', fetch).read('gist-1')).toEqual(envelope);
  });

  it('gist 还没有这个文件 → undefined，不是报错', async () => {
    const { fetch } = stubFetch(() => ({ status: 200, body: { id: 'gist-1', files: {} } }));

    expect(await new GistClient('ghu_token', fetch).read('gist-1')).toBeUndefined();
  });

  it('gist 不存在 → 404 落成 409，让上层知道该重建', async () => {
    const { fetch } = stubFetch(() => ({ status: 404, body: { message: 'Not Found' } }));

    await expect(new GistClient('ghu_token', fetch).read('gist-1')).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('token 失效 → 401，引导去重新登录而不是通用报错', async () => {
    const { fetch } = stubFetch(() => ({ status: 401, body: { message: 'Bad credentials' } }));

    await expect(new GistClient('ghu_token', fetch).read('gist-1')).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('内容被 GitHub 截断 → 明确报错，绝不当成空数据', async () => {
    const { fetch } = stubFetch(() => ({
      status: 200,
      body: {
        id: 'gist-1',
        files: { [GIST_FILENAME]: { content: '{}', truncated: true } },
      },
    }));

    await expect(new GistClient('ghu_token', fetch).read('gist-1')).rejects.toThrow('截断');
  });

  it('文件不是合法 JSON → 报错，而不是返回一个半截对象', async () => {
    const { fetch } = stubFetch(() => ({
      status: 200,
      body: { id: 'gist-1', files: { [GIST_FILENAME]: { content: '{ 半截' } } },
    }));

    await expect(new GistClient('ghu_token', fetch).read('gist-1')).rejects.toThrow();
  });
});

describe('GistClient.update', () => {
  it('PATCH 同一个文件名', async () => {
    const { fetch, calls } = stubFetch(() => ({ status: 200, body: { id: 'gist-1' } }));

    await new GistClient('ghu_token', fetch).update('gist-1', envelope);

    expect(calls[0]?.method).toBe('PATCH');
    expect(calls[0]?.url).toBe('https://api.github.com/gists/gist-1');
  });
});
