import { describe, expect, it } from 'vitest';
import { parseCslJsonRecords } from './csl-json-parser.js';
import { mapInteropRecord } from './mapper.js';

describe('parseCslJsonRecords', () => {
  it('支持 BOM、单对象和 custom/未知字段原样保留', () => {
    const [record] = parseCslJsonRecords(
      `\uFEFF${JSON.stringify({
        id: 'csl-key',
        type: 'article-journal',
        title: 'CSL Study',
        author: [{ literal: 'Research Group' }],
        issued: { 'date-parts': [[2026, 8]] },
        custom: { 'workbench:unknown': 'retain me' },
        'x-workbench': 'retain too',
      })}`,
    );

    expect(record?.sourceKey).toBe('csl-key');
    expect(record?.formatShadow).toMatchObject({
      topLevel: 'single',
      item: { custom: { 'workbench:unknown': 'retain me' }, 'x-workbench': 'retain too' },
      unknownFields: ['custom', 'x-workbench'],
    });
    expect(mapInteropRecord(record!).mapped).toMatchObject({
      title: 'CSL Study',
      issued: { year: 2026, month: 8, day: null },
      contributors: [expect.objectContaining({ kind: 'literal', literal: 'Research Group' })],
    });
  });

  it('数组中的无效条目不会阻断其他条目', () => {
    const records = parseCslJsonRecords(
      JSON.stringify([{ id: 'valid', type: 'report', title: 'Valid' }, 42]),
    );
    expect(records).toHaveLength(2);
    expect(mapInteropRecord(records[0]!).status).toBe('valid');
    expect(mapInteropRecord(records[1]!).status).toBe('invalid');
    expect(records[1]?.diagnostics[0]).toMatchObject({
      code: 'invalid-record',
      path: '$[1]',
    });
  });

  it('文件级 JSON 语法错误给出稳定错误码', () => {
    expect(() => parseCslJsonRecords('[{"title":')).toThrowError(
      expect.objectContaining({ code: 'RESEARCH_INTEROP_INVALID_RECORD' }),
    );
  });
});
