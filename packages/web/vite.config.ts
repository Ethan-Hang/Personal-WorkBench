import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: HERE,
  plugins: [react(), tailwindcss(), tsconfigPaths({ root: '../..' })],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // 代理让浏览器只看到一个源，彻底绕开 CORS
    proxy: { '/api': process.env.WORKBENCH_API_TARGET ?? 'http://127.0.0.1:3000' },
  },
});
