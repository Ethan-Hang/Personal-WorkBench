import {
  INTEROP_ADAPTER_CAPABILITIES,
  INTEROP_ADAPTER_PROTOCOL_VERSION,
  INTEROP_FORMATS,
  interopAdapterDescriptorSchema,
  interopAdapterListSchema,
  interopAdapterNegotiationResultSchema,
  type InteropAdapterDescriptor,
  type InteropAdapterNegotiationInput,
  type InteropAdapterNegotiationResult,
} from '../../contract.js';

const versions: Record<(typeof INTEROP_FORMATS)[number], string> = {
  bibtex: '@retorquere/bibtex-parser@10.0.1',
  ris: 'personal-workbench-ris@1',
  'csl-json': 'personal-workbench-csl-json@1',
};

const names: Record<(typeof INTEROP_FORMATS)[number], string> = {
  bibtex: 'BibTeX / BibLaTeX',
  ris: 'RIS',
  'csl-json': 'CSL JSON',
};

function descriptor(id: (typeof INTEROP_FORMATS)[number]): InteropAdapterDescriptor {
  return interopAdapterDescriptorSchema.parse({
    id,
    displayName: names[id],
    adapterVersion: versions[id],
    protocolVersions: [INTEROP_ADAPTER_PROTOCOL_VERSION],
    capabilities: INTEROP_ADAPTER_CAPABILITIES.map((capability) => ({
      capability,
      import: capability === 'records' ? 'supported' : 'unsupported',
      export: capability === 'records' ? 'supported' : 'unsupported',
    })),
  });
}

export class InteropAdapterRegistry {
  readonly descriptors = INTEROP_FORMATS.map(descriptor);

  list() {
    return interopAdapterListSchema.parse({
      protocolVersion: INTEROP_ADAPTER_PROTOCOL_VERSION,
      adapters: this.descriptors,
    });
  }

  negotiate(input: InteropAdapterNegotiationInput): InteropAdapterNegotiationResult {
    const adapter = this.descriptors.find((candidate) => candidate.id === input.adapterId);
    if (!adapter) {
      return interopAdapterNegotiationResultSchema.parse({
        supported: false,
        ...input,
        diagnostics: [{ code: 'unknown-adapter', message: `未知 adapter：${input.adapterId}` }],
      });
    }
    if (!INTEROP_ADAPTER_CAPABILITIES.includes(input.capability as never)) {
      return interopAdapterNegotiationResultSchema.parse({
        supported: false,
        ...input,
        diagnostics: [
          { code: 'unknown-capability', message: `未知 capability：${input.capability}` },
        ],
      });
    }
    if (!adapter.protocolVersions.includes(input.protocolVersion)) {
      return interopAdapterNegotiationResultSchema.parse({
        supported: false,
        ...input,
        diagnostics: [
          {
            code: 'incompatible-version',
            message: `不支持 protocol ${input.protocolVersion}`,
          },
        ],
      });
    }
    const capability = adapter.capabilities.find(
      (candidate) => candidate.capability === input.capability,
    )!;
    if (capability[input.operation] === 'unsupported') {
      return interopAdapterNegotiationResultSchema.parse({
        supported: false,
        ...input,
        diagnostics: [
          {
            code: 'capability-unsupported',
            message: `${adapter.id} 首版不支持 ${input.capability} ${input.operation}`,
          },
        ],
      });
    }
    return interopAdapterNegotiationResultSchema.parse({
      supported: true,
      adapterId: adapter.id,
      capability: input.capability,
      operation: input.operation,
      protocolVersion: INTEROP_ADAPTER_PROTOCOL_VERSION,
      adapterVersion: adapter.adapterVersion,
      diagnostics: [],
    });
  }
}

export const defaultInteropAdapterRegistry = new InteropAdapterRegistry();
