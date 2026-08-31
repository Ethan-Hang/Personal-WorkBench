import { describe, expect, it } from 'vitest';
import { mapInteropRecord } from './mapper.js';
import { parseRisRecords } from './ris-parser.js';

describe('parseRisRecords', () => {
  it('保留 CRLF、标签顺序、重复标签、未知标签和附件', () => {
    const input = [
      'TY  - JOUR',
      'ID  - ris-key',
      'AU  - Smith, Jane',
      'KW  - alpha',
      'KW  - beta',
      'TI  - Interop Study',
      'PY  - 2026',
      'DO  - 10.1000/test',
      'L1  - file:///tmp/paper.pdf',
      'XX  - retain me',
      'ER  - ',
      '',
    ].join('\r\n');
    const records = parseRisRecords(input);
    const record = records[0]!;

    expect(records).toHaveLength(1);
    expect(record.sourceKey).toBe('ris-key');
    expect(record.rawRecord).toContain('\r\n');
    expect(record.formatShadow).toMatchObject({ newline: 'crlf', complete: true });
    expect(
      (record.formatShadow as { tags: Array<{ tag: string; value: string }> }).tags.slice(0, 5),
    ).toEqual([
      expect.objectContaining({ tag: 'TY' }),
      expect.objectContaining({ tag: 'ID' }),
      expect.objectContaining({ tag: 'AU' }),
      expect.objectContaining({ tag: 'KW', value: 'alpha' }),
      expect.objectContaining({ tag: 'KW', value: 'beta' }),
    ]);
    expect(record.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'unknown-field', field: 'XX', line: 10 }),
    );
    expect(record.attachmentCandidates[0]).toMatchObject({
      displayName: 'paper.pdf',
      action: 'unconfirmed',
    });
    expect(mapInteropRecord(record).mapped).toMatchObject({
      title: 'Interop Study',
      type: 'article',
    });
  });

  it('缺少 TY 或 ER 的记录独立失败', () => {
    const records = parseRisRecords('orphan\nTY  - JOUR\nTI  - Missing end\n');
    expect(records).toHaveLength(2);
    expect(records.every((record) => mapInteropRecord(record).status === 'invalid')).toBe(true);
    expect(records.map((record) => record.diagnostics[0]?.code)).toEqual([
      'malformed-boundary',
      'malformed-boundary',
    ]);
  });
});
