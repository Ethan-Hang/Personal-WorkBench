import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './modules/research/src/storage/schema.ts',
  out: './modules/research/migrations',
  dbCredentials: { url: './data/local/accounts/local-default/workbench.db' },
});
