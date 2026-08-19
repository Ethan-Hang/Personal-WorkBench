import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CredentialsStore } from './credentials-store.js';

const temporaryDirectories: string[] = [];

function makeDataDir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'workbench-credentials-'));
  temporaryDirectories.push(directory);
  return directory;
}

const webdav = { url: 'https://dav.example.com/dav/', username: 'me', password: 's3cret' };

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('CredentialsStore', () => {
  it('空目录读出空凭据，而不是抛错', () => {
    const store = new CredentialsStore(makeDataDir());

    expect(store.read()).toEqual({ v: 1 });
    expect(store.readWebdav()).toBeUndefined();
  });

  it('写入后能原样读回，且不留下临时文件', () => {
    const dataDir = makeDataDir();
    const store = new CredentialsStore(dataDir);

    store.writeWebdav(webdav);

    expect(store.readWebdav()).toEqual(webdav);
    expect(readdirSync(dataDir)).toEqual(['credentials.json']);
  });

  it('只改一个字段不会抹掉其余凭据', () => {
    const store = new CredentialsStore(makeDataDir());
    store.writeWebdav(webdav);

    store.writeWebdav({ ...webdav, username: '另一个' });

    expect(store.readWebdav()).toEqual({ ...webdav, username: '另一个' });
  });

  it('清空 WebDAV 凭据后 readWebdav 回到 undefined', () => {
    const store = new CredentialsStore(makeDataDir());
    store.writeWebdav(webdav);

    store.clearWebdav();

    expect(store.readWebdav()).toBeUndefined();
  });

  it('损坏的 credentials.json 报错指出路径，而不是静默当成没配过', () => {
    const store = new CredentialsStore(makeDataDir());
    writeFileSync(store.filePath, '{ 半截 JSON');

    expect(() => store.read()).toThrow(store.filePath);
  });

  it('写入不是就地改写：原文件要么是旧的完整内容，要么是新的完整内容', () => {
    const store = new CredentialsStore(makeDataDir());
    store.writeWebdav(webdav);
    const before = readFileSync(store.filePath, 'utf8');

    expect(() => store.writeWebdav({ ...webdav, url: '不是 URL 也照存' })).not.toThrow();

    const after = readFileSync(store.filePath, 'utf8');
    expect(() => JSON.parse(before)).not.toThrow();
    expect(() => JSON.parse(after)).not.toThrow();
  });
});
