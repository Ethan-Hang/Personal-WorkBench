import { describe, expect, it } from 'vitest';
import { parseBibtexRecords } from './bibtex-parser.js';
import { mapInteropRecord } from './mapper.js';

describe('parseBibtexRecords', () => {
  it('保留原文、未知字段、宏信息和附件候选', () => {
    const input = `\uFEFF@string{journal = "Journal of Tests"}
@article{smith2026,
  title = {A {GPU}-Aware Study},
  author = {Smith, Jane and {Research Group}},
  year = {2026},
  journal = journal,
  doi = {10.1000/test},
  x-workbench = {retain me},
  file = {paper.pdf}
}`;
    const records = parseBibtexRecords(input);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ sourceKey: 'smith2026' });
    expect(records[0]?.rawRecord).toContain('x-workbench');
    expect(records[0]?.formatShadow).toMatchObject({
      fields: { 'x-workbench': 'retain me' },
      document: { strings: { JOURNAL: 'Journal of Tests' } },
    });
    expect(records[0]?.attachmentCandidates[0]).toMatchObject({
      displayName: 'paper.pdf',
      action: 'unconfirmed',
    });
    expect(records[0]?.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'unknown-field', field: 'x-workbench' }),
    );

    const mapped = mapInteropRecord(records[0]!);
    expect(mapped.mapped).toMatchObject({
      title: 'A GPU-Aware Study',
      type: 'article',
      identifiers: [{ scheme: 'doi', value: '10.1000/test' }],
      contributors: [
        expect.objectContaining({ kind: 'structured', family: 'Smith', given: 'Jane' }),
        expect.objectContaining({ kind: 'organization', literal: 'Research Group' }),
      ],
    });
  });

  it('损坏条目单独标错，并恢复前后有效记录', () => {
    const input = `@article{ok,title={OK}}
@article{bad,title={Broken}
@article{ok2,title={OK2}}`;
    const records = parseBibtexRecords(input);

    expect(records.map((record) => record.sourceKey)).toEqual(['ok', 'bad', 'ok2']);
    expect(mapInteropRecord(records[0]!).status).toBe('valid');
    expect(mapInteropRecord(records[1]!).status).toBe('invalid');
    expect(mapInteropRecord(records[2]!).status).toBe('valid');
    expect(records[1]?.diagnostics[0]?.code).toBe('malformed-boundary');
  });
});
