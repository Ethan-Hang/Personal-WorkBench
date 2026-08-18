import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './modules/campus-recruit/src/storage/schema.ts',
  out: './modules/campus-recruit/migrations',
  dbCredentials: { url: './data/local/workbench.db' },
});
