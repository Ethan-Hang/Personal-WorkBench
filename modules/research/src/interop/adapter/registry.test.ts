import { describe, expect, it } from 'vitest';
import { INTEROP_ADAPTER_CAPABILITIES, interopAdapterRecordBatchSchema } from '../../contract.js';
import { InteropAdapterRegistry } from './registry.js';

describe('InteropAdapterRegistry', () => {
  const registry = new InteropAdapterRegistry();

  it('以稳定顺序公开三种 records adapter，并明确其他能力 unsupported', () => {
    const listed = registry.list();
    expect(listed.adapters.map((adapter) => adapter.id)).toEqual(['bibtex', 'ris', 'csl-json']);
    for (const adapter of listed.adapters) {
      expect(adapter.capabilities.map((capability) => capability.capability)).toEqual(
        INTEROP_ADAPTER_CAPABILITIES,
      );
      expect(adapter.capabilities[0]).toMatchObject({
        capability: 'records',
        import: 'supported',
        export: 'supported',
      });
      expect(adapter.capabilities.slice(1).every((item) => item.import === 'unsupported')).toBe(
        true,
      );
    }
  });

  it('协商支持版本，并区分未知 adapter、未知能力、不兼容版本和未实现能力', () => {
    expect(
      registry.negotiate({
        adapterId: 'bibtex',
        capability: 'records',
        operation: 'import',
        protocolVersion: '1.0.0',
      }),
    ).toMatchObject({ supported: true, adapterId: 'bibtex', adapterVersion: expect.any(String) });

    const cases = [
      ['missing', 'records', '1.0.0', 'unknown-adapter'],
      ['bibtex', 'secrets', '1.0.0', 'unknown-capability'],
      ['bibtex', 'records', '2.0.0', 'incompatible-version'],
      ['bibtex', 'collections', '1.0.0', 'capability-unsupported'],
    ] as const;
    for (const [adapterId, capability, protocolVersion, code] of cases) {
      expect(
        registry.negotiate({ adapterId, capability, operation: 'export', protocolVersion }),
      ).toMatchObject({ supported: false, diagnostics: [{ code }] });
    }
  });

  it('record batch 对空结果和部分失败使用明确状态，不用空成功掩盖失败', () => {
    expect(
      interopAdapterRecordBatchSchema.parse({
        adapterId: 'ris',
        protocolVersion: '1.0.0',
        cursor: null,
        items: [],
        complete: true,
        nextCursor: null,
      }).items,
    ).toEqual([]);

    const partial = interopAdapterRecordBatchSchema.parse({
      adapterId: 'csl-json',
      protocolVersion: '1.0.0',
      cursor: { value: '0', version: 1 },
      items: [
        {
          ordinal: 0,
          sourceKey: 'ok',
          status: 'processed',
          payload: { title: 'One' },
          diagnostics: [],
        },
        {
          ordinal: 1,
          sourceKey: null,
          status: 'failed',
          payload: null,
          diagnostics: [{ code: 'capability-unsupported', message: 'fixture failure' }],
        },
      ],
      complete: false,
      nextCursor: { value: '2', version: 1 },
    });
    expect(partial.items.map((item) => item.status)).toEqual(['processed', 'failed']);
    expect(interopAdapterRecordBatchSchema.safeParse({ ...partial, complete: true }).success).toBe(
      false,
    );
  });
});
