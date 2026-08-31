import type { RenderCitationInput } from '../../contract.js';
import { toCslRecord } from '../export/model.js';
import type { InteropRepository } from '../records/repository.js';
import { CitationProcessor } from './processor.js';

export class ResearchCitationService {
  constructor(
    private readonly repository: InteropRepository,
    private readonly processor = new CitationProcessor(),
  ) {}

  async render(input: RenderCitationInput) {
    const all = this.repository.projectExportRecords(
      { kind: 'selection', workIds: input.items.map((item) => item.workId) },
      'all',
    );
    return this.processor.render({
      style: input.style,
      locale: input.locale,
      mode: input.mode,
      items: input.items.map((item) => {
        const record =
          all.find(
            (candidate) =>
              candidate.work.id === item.workId &&
              (item.editionId === null || candidate.edition?.id === item.editionId),
          ) ?? null;
        if (!record) throw new Error(`citation item not found: ${item.workId}`);
        return {
          workId: item.workId,
          csl: toCslRecord({ ...record, citationKey: item.workId }),
          locator: item.locator,
          label: item.label,
          prefix: item.prefix,
          suffix: item.suffix,
          suppressAuthor: item.suppressAuthor,
        };
      }),
    });
  }
}
