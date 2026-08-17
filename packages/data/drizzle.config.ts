import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './packages/data/src/schema.ts',
  out: './packages/data/migrations',
  dbCredentials: { url: './data/local/workbench.db' },
});
