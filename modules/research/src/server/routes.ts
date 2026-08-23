import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { defineRoute } from '@workbench/http-kit';
import {
  RESEARCH_API_V1,
  confirmImportInputSchema,
  createCollectionInputSchema,
  inspectImportInputSchema,
  listWorksQuerySchema,
  permanentDeleteInputSchema,
  pickPdfInputSchema,
  prepareImportInputSchema,
  relinkLocationInputSchema,
  setWorkCollectionsInputSchema,
} from '../contract.js';
import type { ResearchService } from './service.js';

const idParams = z.object({ id: z.string().min(1) });

export function registerResearchRoutes(app: FastifyInstance, service: ResearchService): void {
  app.get(
    RESEARCH_API_V1.works,
    defineRoute({ query: listWorksQuerySchema }, ({ query }) => service.listWorks(query)),
  );
  app.get(
    RESEARCH_API_V1.work(':id'),
    defineRoute({ params: idParams }, ({ params }) => service.getWork(params.id)),
  );
  app.put(
    RESEARCH_API_V1.workCollections(':id'),
    defineRoute({ params: idParams, body: setWorkCollectionsInputSchema }, ({ params, body }) =>
      service.setWorkCollections(params.id, body.collectionIds),
    ),
  );
  app.post(
    RESEARCH_API_V1.workTrash(':id'),
    defineRoute({ params: idParams }, async ({ params }) => {
      await service.trashWork(params.id);
      return service.getWork(params.id);
    }),
  );
  app.post(
    RESEARCH_API_V1.workRestore(':id'),
    defineRoute({ params: idParams }, ({ params }) => service.restoreWork(params.id)),
  );
  app.get(
    RESEARCH_API_V1.workDeletionPreview(':id'),
    defineRoute({ params: idParams }, ({ params }) => service.deletionPreview(params.id)),
  );
  app.post(
    RESEARCH_API_V1.workPermanentDelete(':id'),
    defineRoute({ params: idParams, body: permanentDeleteInputSchema }, ({ params, body }) =>
      service.permanentlyDelete(params.id, body.confirmationToken),
    ),
  );

  app.get(RESEARCH_API_V1.collections, async () => service.listCollections());
  app.post(
    RESEARCH_API_V1.collections,
    defineRoute({ body: createCollectionInputSchema, status: 201 }, ({ body }) =>
      service.createCollection(body),
    ),
  );

  app.post(
    RESEARCH_API_V1.importPickFiles,
    defineRoute({ body: pickPdfInputSchema }, ({ body }) =>
      service.pickFiles(body.initialDir, body.multiple),
    ),
  );
  app.post(
    RESEARCH_API_V1.importSessions,
    defineRoute({ body: prepareImportInputSchema, status: 201 }, ({ body }) =>
      service.prepareImport(body),
    ),
  );
  app.get(
    RESEARCH_API_V1.importSession(':id'),
    defineRoute({ params: idParams }, ({ params }) => service.getImportSession(params.id)),
  );
  app.post(
    RESEARCH_API_V1.importInspect(':id'),
    defineRoute({ params: idParams, body: inspectImportInputSchema }, ({ params, body }) =>
      service.inspectImport(params.id, body),
    ),
  );
  app.post(
    RESEARCH_API_V1.importConfirm(':id'),
    defineRoute({ params: idParams, body: confirmImportInputSchema }, ({ params, body }) =>
      service.confirmImport(params.id, body),
    ),
  );

  app.post(
    RESEARCH_API_V1.locationCheck(':id'),
    defineRoute({ params: idParams }, ({ params }) => service.checkLocation(params.id)),
  );
  app.post(
    RESEARCH_API_V1.locationRelink(':id'),
    defineRoute({ params: idParams, body: relinkLocationInputSchema }, ({ params, body }) =>
      service.relinkLocation(params.id, body.path),
    ),
  );
  app.delete(
    RESEARCH_API_V1.attachment(':id'),
    defineRoute({ params: idParams, status: 204 }, ({ params }) =>
      service.recycleAttachment(params.id),
    ),
  );
  app.post(RESEARCH_API_V1.reconcile, async () => service.reconcile());
}
