import { constants } from 'node:fs';
import {
  access,
  link,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink,
} from 'node:fs/promises';

export interface FileIdentity {
  size: number;
  mtimeMs: number;
  deviceId: string;
  fileId: string;
  isFile: boolean;
  isSymbolicLink: boolean;
}

export interface SequentialFileHandle {
  read(buffer: Buffer): Promise<number>;
  write(buffer: Buffer, offset: number, length: number): Promise<number>;
  sync(): Promise<void>;
  close(): Promise<void>;
}

export interface ResearchFileSystem {
  mkdir(path: string): Promise<void>;
  openRead(path: string): Promise<SequentialFileHandle>;
  openWriteExclusive(path: string): Promise<SequentialFileHandle>;
  stat(path: string): Promise<FileIdentity>;
  lstat(path: string): Promise<FileIdentity>;
  realpath(path: string): Promise<string>;
  access(path: string): Promise<void>;
  /** 同一文件系统内无覆盖地原子发布完整 staging 文件。 */
  link(existingPath: string, newPath: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
}

function identity(value: Awaited<ReturnType<typeof stat>>, symbolicLink: boolean): FileIdentity {
  return {
    size: Number(value.size),
    mtimeMs: Number(value.mtimeMs),
    deviceId: value.dev.toString(),
    fileId: value.ino.toString(),
    isFile: value.isFile(),
    isSymbolicLink: symbolicLink,
  };
}

function wrapHandle(handle: Awaited<ReturnType<typeof open>>): SequentialFileHandle {
  return {
    async read(buffer) {
      const result = await handle.read(buffer, 0, buffer.length, null);
      return result.bytesRead;
    },
    async write(buffer, offset, length) {
      const result = await handle.write(buffer, offset, length, null);
      return result.bytesWritten;
    },
    async sync() {
      await handle.sync();
    },
    async close() {
      await handle.close();
    },
  };
}

export const nodeResearchFileSystem: ResearchFileSystem = {
  async mkdir(path) {
    await mkdir(path, { recursive: true });
  },
  async openRead(path) {
    return wrapHandle(await open(path, 'r'));
  },
  async openWriteExclusive(path) {
    return wrapHandle(await open(path, 'wx', 0o600));
  },
  async stat(path) {
    return identity(await stat(path), false);
  },
  async lstat(path) {
    const value = await lstat(path);
    return identity(value, value.isSymbolicLink());
  },
  realpath,
  async access(path) {
    await access(path, constants.F_OK);
  },
  link,
  rename,
  unlink,
  async remove(path) {
    await rm(path, { force: true });
  },
  readdir,
};

export function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}
