import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './modules/notes/src/storage/schema.ts',
  out: './modules/notes/migrations',
  dbCredentials: { url: './data/local/accounts/local-default/workbench.db' },
});
