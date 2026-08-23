import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ['packages/**/*.test.ts', 'modules/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
    testTimeout: 15000,
  },
});
