import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { OCR_LANGUAGE_PACK_VERSION, resolveOcrLanguagePacks } from './language-packs.js';

describe('OCR language packs', () => {
  it('固定随运行依赖安装的英文与简体中文模型并校验内容 hash', async () => {
    const packs = resolveOcrLanguagePacks(['eng', 'chi_sim']);
    expect(OCR_LANGUAGE_PACK_VERSION).toBe('4.0.0_best_int/npm-1.0.0');
    expect(packs.map((pack) => pack.license)).toEqual(['MIT', 'MIT']);
    for (const pack of packs) {
      const bytes = await readFile(pack.filePath);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(pack.sha256);
      expect(pack.filePath).not.toMatch(/^https?:/);
    }
  });
});
