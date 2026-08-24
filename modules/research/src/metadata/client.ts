import type { MetadataProviderName } from './types.js';

export interface MetadataHttpResponse {
  status: number;
  headers: Headers;
  body: string;
}

export type MetadataFetch = (url: string, init: RequestInit) => Promise<Response>;
export type Sleep = (milliseconds: number) => Promise<void>;

export interface MetadataHttpClientOptions {
  provider: MetadataProviderName;
  minIntervalMs: number;
  timeoutMs?: number;
  retries?: number;
  fetch?: MetadataFetch;
  sleep?: Sleep;
  now?: () => number;
}

export class MetadataHttpError extends Error {
  constructor(
    message: string,
    readonly provider: MetadataProviderName,
    readonly retryable: boolean,
    readonly detail: string | null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MetadataHttpError';
  }
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryAfterMs(headers: Headers, now: number): number {
  const raw = headers.get('retry-after');
  if (!raw) return 0;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}

export class BoundedMetadataHttpClient {
  private queue: Promise<void> = Promise.resolve();
  private nextStartAt = 0;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly fetch: MetadataFetch;
  private readonly sleep: Sleep;
  private readonly now: () => number;

  constructor(private readonly options: MetadataHttpClientOptions) {
    this.timeoutMs = options.timeoutMs ?? 8_000;
    this.retries = options.retries ?? 2;
    this.fetch = options.fetch ?? ((url, init) => fetch(url, init));
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? Date.now;
  }

  private schedule<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release: () => void = () => undefined;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    return previous
      .catch(() => undefined)
      .then(async () => {
        const wait = Math.max(0, this.nextStartAt - this.now());
        if (wait > 0) await this.sleep(wait);
        this.nextStartAt = this.now() + this.options.minIntervalMs;
        return operation();
      })
      .finally(release);
  }

  private async attempt(url: string, signal?: AbortSignal): Promise<MetadataHttpResponse> {
    return this.schedule(async () => {
      const controller = new AbortController();
      const abort = () => controller.abort(signal?.reason);
      signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(() => controller.abort(new Error('timeout')), this.timeoutMs);
      try {
        const response = await this.fetch(url, {
          method: 'GET',
          headers: {
            Accept: 'application/json, application/atom+xml;q=0.9, application/xml;q=0.8',
            'User-Agent': 'Personal-WorkBench/0.0 (local research library)',
          },
          signal: controller.signal,
        });
        return { status: response.status, headers: response.headers, body: await response.text() };
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      }
    });
  }

  async get(url: string, signal?: AbortSignal): Promise<MetadataHttpResponse> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      if (signal?.aborted) {
        throw new MetadataHttpError('元数据查询已取消', this.options.provider, false, 'ABORT_ERR');
      }
      try {
        const response = await this.attempt(url, signal);
        const transient = response.status === 429 || response.status >= 500;
        if (!transient || attempt === this.retries) return response;
        const serverDelay = retryAfterMs(response.headers, this.now());
        if (serverDelay > 0) await this.sleep(serverDelay);
      } catch (error) {
        if (signal?.aborted) {
          throw new MetadataHttpError(
            '元数据查询已取消',
            this.options.provider,
            false,
            'ABORT_ERR',
            { cause: error },
          );
        }
        lastError = error;
        if (attempt === this.retries) {
          throw new MetadataHttpError(
            '元数据服务网络请求失败',
            this.options.provider,
            true,
            error instanceof Error ? error.message : String(error),
            { cause: error },
          );
        }
      }
    }
    throw new MetadataHttpError(
      '元数据服务网络请求失败',
      this.options.provider,
      true,
      lastError instanceof Error ? lastError.message : String(lastError),
    );
  }
}

export const PROVIDER_MIN_INTERVAL_MS: Record<MetadataProviderName, number> = {
  crossref: 250,
  datacite: 1_000,
  arxiv: 3_000,
  openalex: 500,
};
