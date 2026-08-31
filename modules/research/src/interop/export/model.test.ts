import { describe, expect, it } from 'vitest';
import { parseBibtexRecords } from '../records/bibtex-parser.js';
import { parseCslJsonRecords } from '../records/csl-json-parser.js';
import { mapInteropRecord } from '../records/mapper.js';
import { parseRisRecords } from '../records/ris-parser.js';
import type { ParsedInteropEnvelope } from '../records/types.js';
import { generateCitationKeys, type ExportRecordProjection, writeInteropRecords } from './model.js';

const sources = {
  bibtex: `@article{smith2026,
  title = {Interoperability Study},
  author = {Smith, Jane and {Research Group}},
  year = {2026},
  journal = {Journal of Tests},
  volume = {4},
  number = {2},
  pages = {10--20},
  doi = {10.1000/interop},
  x-workbench = {retain me}
}`,
  ris: [
    'TY  - JOUR',
    'ID  - smith2026',
    'AU  - Smith, Jane',
    'AU  - Research Group',
    'TI  - Interoperability Study',
    'PY  - 2026',
    'T2  - Journal of Tests',
    'VL  - 4',
    'IS  - 2',
    'SP  - 10',
    'EP  - 20',
    'DO  - 10.1000/interop',
    'XX  - retain me',
    'ER  - ',
    '',
  ].join('\r\n'),
  'csl-json': JSON.stringify({
    id: 'smith2026',
    type: 'article-journal',
    title: 'Interoperability Study',
    author: [{ family: 'Smith', given: 'Jane' }, { literal: 'Research Group' }],
    issued: { 'date-parts': [[2026]] },
    'container-title': 'Journal of Tests',
    volume: '4',
    issue: '2',
    page: '10-20',
    DOI: '10.1000/interop',
    'x-workbench': 'retain me',
  }),
} as const;

function parse(format: keyof typeof sources, input: string): ParsedInteropEnvelope[] {
  if (format === 'bibtex') return parseBibtexRecords(input);
  if (format === 'ris') return parseRisRecords(input);
  return parseCslJsonRecords(input);
}

function projection(format: keyof typeof sources): ExportRecordProjection {
  const envelope = parse(format, sources[format])[0]!;
  const mapped = mapInteropRecord(envelope).mapped!;
  return {
    work: {
      id: `work-${format}`,
      revision: 1,
      type: mapped.type,
      title: mapped.title,
      abstract: mapped.abstract,
      year: mapped.issued?.year ?? null,
    },
    edition: {
      id: `edition-${format}`,
      revision: 1,
      kind: 'journal',
      title: mapped.title,
      publicationTitle: mapped.publicationTitle,
      publisher: mapped.publisher,
      publishedDate: mapped.issued?.year ? String(mapped.issued.year) : null,
      volume: mapped.volume,
      issue: mapped.issue,
      pages: mapped.pages,
    },
    contributors: mapped.contributors.map((person, sequence) => ({
      displayName: person.literal ?? [person.given, person.family].filter(Boolean).join(' '),
      givenName: person.given,
      familyName: person.family,
      sequence,
    })),
    identifiers: mapped.identifiers,
    attachmentCount: 0,
    source: {
      format,
      sourceKey: envelope.sourceKey,
      rawRecord: envelope.rawRecord,
      formatShadow: { value: envelope.formatShadow, attachmentCandidates: [] },
      mapped,
    },
    citationKey: 'smith2026',
  };
}

function common(input: string, format: keyof typeof sources) {
  const mapped = mapInteropRecord(parse(format, input)[0]!).mapped!;
  return {
    title: mapped.title,
    type: mapped.type,
    year: mapped.issued?.year ?? null,
    publicationTitle: mapped.publicationTitle,
    doi: mapped.identifiers.find((item) => item.scheme === 'doi')?.value,
  };
}

describe('interop export model', () => {
  it('三种来源到三种目标保留公共语义', () => {
    for (const sourceFormat of Object.keys(sources) as Array<keyof typeof sources>) {
      for (const targetFormat of Object.keys(sources) as Array<keyof typeof sources>) {
        const output = writeInteropRecords(targetFormat, [projection(sourceFormat)]);
        expect(common(output.content, targetFormat)).toEqual(
          common(sources[sourceFormat], sourceFormat),
        );
      }
    }
  });

  it('同格式未修改时重放原文，修改已知字段后仍保留未知字段', () => {
    for (const format of Object.keys(sources) as Array<keyof typeof sources>) {
      const record = projection(format);
      const unchanged = writeInteropRecords(format, [record]);
      expect(unchanged.replayed).toBe(1);
      record.work.title = 'Revised Title';
      const changed = writeInteropRecords(format, [record]);
      expect(changed.normalized).toBe(1);
      expect(common(changed.content, format).title).toBe('Revised Title');
      expect(changed.content).toContain(format === 'ris' ? 'XX  - retain me' : 'x-workbench');
      expect(changed.losses).toContainEqual(
        expect.objectContaining({ status: 'normalized', workId: record.work.id }),
      );
    }
  });

  it('citation key 优先保留来源 key，生成碰撞后缀稳定且拒绝重复偏好', () => {
    const first = projection('bibtex');
    const second = projection('ris');
    first.source!.sourceKey = null;
    second.source!.sourceKey = null;
    second.work.id = 'work-second';
    second.edition!.id = 'edition-second';
    const records = [first, second].map((record) => ({
      work: record.work,
      edition: record.edition,
      contributors: record.contributors,
      identifiers: record.identifiers,
      attachmentCount: record.attachmentCount,
      source: record.source,
    }));

    const keys = generateCitationKeys(records, new Map());
    expect([...keys.values()].sort()).toEqual([
      'Smith2026Interoperability',
      'Smith2026Interoperabilitya',
    ]);
    expect(generateCitationKeys([...records].reverse(), new Map())).toEqual(keys);
    expect(() =>
      generateCitationKeys(
        records,
        new Map([
          [`${first.work.id}:${first.edition!.id}`, 'same'],
          [`${second.work.id}:${second.edition!.id}`, 'same'],
        ]),
      ),
    ).toThrow(/重复/);
  });
});
