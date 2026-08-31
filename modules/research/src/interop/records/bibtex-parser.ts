import { Cite } from '@citation-js/core';
import '@citation-js/plugin-bibtex';
import { parse, type BibtexEntry } from '@retorquere/bibtex-parser';
import type { InteropDiagnostic } from '../../contract.js';
import {
  attachmentCandidate,
  enforceRecordLimits,
  sha256,
  type ParseInteropOptions,
  type ParsedInteropEnvelope,
} from './types.js';

const KNOWN_BIB_FIELDS = new Set([
  'abstract',
  'address',
  'annote',
  'author',
  'booktitle',
  'chapter',
  'date',
  'doi',
  'editor',
  'eprint',
  'eprinttype',
  'file',
  'institution',
  'isbn',
  'issn',
  'journal',
  'keywords',
  'month',
  'note',
  'number',
  'organization',
  'pages',
  'pdf',
  'pmid',
  'publisher',
  'school',
  'series',
  'shorttitle',
  'title',
  'translator',
  'type',
  'url',
  'urldate',
  'volume',
  'year',
]);

function fieldText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return null;
}

function attachmentValues(entry: BibtexEntry): string[] {
  const values: string[] = [];
  for (const field of ['file', 'pdf']) {
    const value = entry.fields[field];
    if (typeof value === 'string') {
      values.push(
        ...value
          .split(';')
          .map((item) => item.trim())
          .filter(Boolean),
      );
    }
  }
  return values;
}

function unknownFieldDiagnostics(entry: BibtexEntry): InteropDiagnostic[] {
  return Object.keys(entry.fields)
    .filter((field) => !KNOWN_BIB_FIELDS.has(field.toLowerCase()))
    .map((field) => ({
      code: 'unknown-field' as const,
      severity: 'info' as const,
      message: `已在 BibTeX 格式影子中保留字段 ${field}`,
      field,
      path: null,
      line: null,
      recoverable: true,
    }));
}

function parseValidEntry(
  entry: BibtexEntry,
  ordinal: number,
  globalShadow: Record<string, unknown> | null,
): ParsedInteropEnvelope {
  const rawHash = sha256(entry.input);
  const diagnostics = unknownFieldDiagnostics(entry);
  let csl: Record<string, unknown> | null = null;
  try {
    csl = new Cite(entry.input).data[0] ?? null;
  } catch (error) {
    diagnostics.push({
      code: 'invalid-record',
      severity: 'error',
      message: error instanceof Error ? error.message : String(error),
      field: null,
      path: null,
      line: null,
      recoverable: true,
    });
  }
  const values = attachmentValues(entry);
  return {
    ordinal,
    sourceKey: entry.key || null,
    rawHash,
    rawRecord: entry.input,
    formatShadow: {
      type: entry.type,
      key: entry.key,
      fields: entry.fields,
      mode: entry.mode,
      ...(globalShadow ? { document: globalShadow } : {}),
    },
    csl,
    diagnostics,
    attachmentCandidates: values.map((value, index) => attachmentCandidate(rawHash, value, index)),
  };
}

export function parseBibtexRecords(
  input: string,
  options: ParseInteropOptions = {},
): ParsedInteropEnvelope[] {
  const parsed = parse(input.replace(/^\uFEFF/, ''), {
    sentenceCase: false,
    unsupported: 'ignore',
  });
  const globalShadow = {
    comments: parsed.comments,
    strings: parsed.strings,
    preamble: parsed.preamble,
    jabref: parsed.jabref,
  };
  const errors = [...parsed.errors];
  const records: ParsedInteropEnvelope[] = [];

  for (const entry of parsed.entries) {
    if (entry.input) {
      records.push(
        parseValidEntry(entry, records.length, records.length === 0 ? globalShadow : null),
      );
      continue;
    }
    const parseError = errors.shift();
    const rawRecord = parseError?.input || `@${entry.type}{${entry.key}}`;
    records.push({
      ordinal: records.length,
      sourceKey: entry.key || null,
      rawHash: sha256(rawRecord),
      rawRecord,
      formatShadow: {
        type: entry.type,
        key: entry.key,
        fields: entry.fields,
        mode: entry.mode,
        ...(records.length === 0 ? { document: globalShadow } : {}),
      },
      csl: null,
      diagnostics: [
        {
          code: 'malformed-boundary',
          severity: 'error',
          message: parseError?.error ?? 'BibTeX 记录边界损坏',
          field: null,
          path: null,
          line: null,
          recoverable: true,
        },
      ],
      attachmentCandidates: [],
    });
  }

  for (const parseError of errors) {
    const rawRecord = parseError.input || '';
    records.push({
      ordinal: records.length,
      sourceKey: null,
      rawHash: sha256(rawRecord),
      rawRecord,
      formatShadow: { error: parseError.error },
      csl: null,
      diagnostics: [
        {
          code: 'malformed-boundary',
          severity: 'error',
          message: parseError.error,
          field: null,
          path: null,
          line: null,
          recoverable: true,
        },
      ],
      attachmentCandidates: [],
    });
  }

  if (records.length === 0 && input.trim()) {
    const rawRecord = input.replace(/^\uFEFF/, '');
    records.push({
      ordinal: 0,
      sourceKey: null,
      rawHash: sha256(rawRecord),
      rawRecord,
      formatShadow: globalShadow,
      csl: null,
      diagnostics: [
        {
          code: 'invalid-record',
          severity: 'error',
          message: '文件中没有可识别的 BibTeX 记录',
          field: null,
          path: null,
          line: null,
          recoverable: true,
        },
      ],
      attachmentCandidates: [],
    });
  }

  return enforceRecordLimits(records, options).map((record) => ({
    ...record,
    formatShadow: {
      ...(record.formatShadow as Record<string, unknown>),
      title: fieldText((record.formatShadow as { fields?: Record<string, unknown> }).fields?.title),
    },
  }));
}
