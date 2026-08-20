import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * 「写临时文件 → rename」原子替换。
 *
 * `data/local` 下的两个引导文件（`accounts.json` / `credentials.json`）都用它：
 * 它们最重要的性质是**坏了能手工修**，而写到一半的 JSON 连开机都做不到。
 * rename 在同一分区上是原子的，因此读者永远只会看到「旧的完整内容」或
 * 「新的完整内容」，不存在第三种。
 */
export function writeJsonAtomically(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    renameSync(temporaryPath, path);
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    throw error;
  }
}

/** 读 JSON，解析失败时报错**带上文件路径**——否则用户不知道该去修哪个文件。 */
export function readJsonFile(path: string): unknown {
  const raw = readFileSync(path, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (cause) {
    throw new Error(`${path} 不是合法 JSON，请手工修复后重启`, { cause });
  }
}
