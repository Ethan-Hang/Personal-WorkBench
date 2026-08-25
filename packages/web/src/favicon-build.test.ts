import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';

import viteConfig from '../vite.config.js';

describe('web favicon', () => {
  it('ships the project icon from the production entry page', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'personal-workbench-favicon-'));

    try {
      await build({
        ...viteConfig,
        configFile: false,
        logLevel: 'silent',
        build: { ...viteConfig.build, outDir, emptyOutDir: true },
      });

      const [html, favicon] = await Promise.all([
        readFile(join(outDir, 'index.html'), 'utf8'),
        readFile(join(outDir, 'favicon.svg'), 'utf8'),
      ]);

      expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
      expect(favicon).toContain('viewBox="0 0 64 64"');
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });
});
