import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './modules/todo/src/storage/schema.ts',
  out: './modules/todo/migrations',
  dbCredentials: { url: './data/local/workbench.db' },
});
