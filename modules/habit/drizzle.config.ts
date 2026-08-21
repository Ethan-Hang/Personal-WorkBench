import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './modules/habit/src/storage/schema.ts',
  out: './modules/habit/migrations',
  dbCredentials: { url: './data/local/accounts/local-default/workbench.db' },
});
