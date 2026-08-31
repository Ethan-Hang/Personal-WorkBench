import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createDatabaseClient, openDatabase, runCoreMigrations } from '@workbench/data';
import { buildApp } from '@workbench/server';
import { createResearchServerModule } from '@workbench/module-research';
import type { InteropFormat } from '@workbench/module-research/contract';
import { SqliteResearchRepository } from '@workbench/module-research/storage';
import { SqliteInteropRepository } from '@workbench/module-research/interop/storage';
import { SqliteKnowledgeRepository } from '@workbench/module-research/knowledge/storage';

const databasePath = process.env.RESEARCH_INTEROP_QA_DB;
const dataRoot = process.env.RESEARCH_INTEROP_QA_DATA;
const outputRoot = process.env.RESEARCH_INTEROP_QA_OUTPUT;
const port = Number(process.env.PORT ?? 3000);

if (!databasePath || !dataRoot || !outputRoot) {
  throw new Error('visual QA server requires database, data and output paths');
}

const sources: Record<InteropFormat, string | undefined> = {
  bibtex: process.env.RESEARCH_INTEROP_QA_SOURCE_BIBTEX,
  ris: process.env.RESEARCH_INTEROP_QA_SOURCE_RIS,
  'csl-json': process.env.RESEARCH_INTEROP_QA_SOURCE_CSL_JSON,
};

await mkdir(dirname(databasePath), { recursive: true });
await mkdir(outputRoot, { recursive: true });
const opened = openDatabase(databasePath);
runCoreMigrations(createDatabaseClient(opened.sqlite));
const getSqlite = () => opened.sqlite;
const module = createResearchServerModule({
  repository: new SqliteResearchRepository(getSqlite),
  knowledgeRepository: new SqliteKnowledgeRepository(getSqlite),
  interopRepository: new SqliteInteropRepository(getSqlite),
  managedRoot: () => join(dataRoot, 'managed'),
  interopFilePicker: {
    pickInteropSource: async (options) => sources[options?.format ?? 'bibtex'] ?? null,
  },
  interopOutputDialog: {
    saveInterop: async ({ format }) =>
      join(
        outputRoot,
        `visual-export.${format === 'bibtex' ? 'bib' : format === 'ris' ? 'ris' : 'json'}`,
      ),
  },
  filePicker: { pick: async () => [] },
});
const app = await buildApp({ getSqlite, modules: [module] });
await app.listen({ port, host: '127.0.0.1' });

const shutdown = async () => {
  await app.close();
  opened.sqlite.close();
};
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
