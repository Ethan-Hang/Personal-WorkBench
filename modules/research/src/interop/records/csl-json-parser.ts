import { Cite } from '@citation-js/core';
import type { InteropDiagnostic } from '../../contract.js';
import {
  attachmentCandidate,
  enforceRecordLimits,
  InteropParseError,
  sha256,
  type ParseInteropOptions,
  type ParsedInteropEnvelope,
} from './types.js';

const KNOWN_CSL_FIELDS = new Set([
  'DOI',
  'ISBN',
  'ISSN',
  'PMCID',
  'PMID',
  'URL',
  'abstract',
  'accessed',
  'annote',
  'archive',
  'archive-place',
  'archive_location',
  'author',
  'authority',
  'available-date',
  'call-number',
  'chair',
  'citation-key',
  'citation-label',
  'collection-editor',
  'collection-number',
  'collection-title',
  'composer',
  'container-author',
  'container-title',
  'container-title-short',
  'dimensions',
  'director',
  'edition',
  'editor',
  'editorial-director',
  'event',
  'event-date',
  'event-place',
  'first-reference-note-number',
  'genre',
  'id',
  'illustrator',
  'interviewer',
  'issue',
  'issued',
  'jurisdiction',
  'keyword',
  'language',
  'locator',
  'medium',
  'note',
  'number',
  'number-of-pages',
  'number-of-volumes',
  'original-author',
  'original-date',
  'original-publisher',
  'original-publisher-place',
  'original-title',
  'page',
  'page-first',
  'part',
  'part-title',
  'publisher',
  'publisher-place',
  'recipient',
  'reviewed-author',
  'reviewed-genre',
  'reviewed-title',
  'scale',
  'section',
  'source',
  'status',
  'submitted',
  'title',
  'title-short',
  'translator',
  'type',
  'version',
  'volume',
  'volume-title',
  'volume-title-short',
  'year-suffix',
]);

function attachmentValues(item: Record<string, unknown>): string[] {
  const values: string[] = [];
  for (const key of ['file', 'attachment', 'attachments']) {
    const value = item[key];
    if (typeof value === 'string') values.push(value);
    else if (Array.isArray(value)) {
      values.push(...value.filter((entry): entry is string => typeof entry === 'string'));
    }
  }
  return values;
}

export function parseCslJsonRecords(
  input: string,
  options: ParseInteropOptions = {},
): ParsedInteropEnvelope[] {
  let root: unknown;
  try {
    root = JSON.parse(input.replace(/^\uFEFF/, '')) as unknown;
  } catch (error) {
    throw new InteropParseError(
      'RESEARCH_INTEROP_INVALID_RECORD',
      `CSL JSON 语法错误：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const single = !Array.isArray(root);
  const values = Array.isArray(root) ? root : [root];
  const records = values.map((value, ordinal): ParsedInteropEnvelope => {
    const rawRecord = JSON.stringify(value);
    const rawHash = sha256(rawRecord);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {
        ordinal,
        sourceKey: null,
        rawHash,
        rawRecord,
        formatShadow: { item: value, topLevel: single ? 'single' : 'array' },
        csl: null,
        diagnostics: [
          {
            code: 'invalid-record',
            severity: 'error',
            message: 'CSL JSON 条目必须是对象',
            field: null,
            path: `$[${ordinal}]`,
            line: null,
            recoverable: true,
          },
        ],
        attachmentCandidates: [],
      };
    }

    const item = value as Record<string, unknown>;
    const diagnostics: InteropDiagnostic[] = Object.keys(item)
      .filter((field) => !KNOWN_CSL_FIELDS.has(field) && !field.startsWith('_'))
      .map((field) => ({
        code: 'unknown-field' as const,
        severity: 'info' as const,
        message: `已在 CSL JSON 格式影子中保留字段 ${field}`,
        field,
        path: `$[${ordinal}].${field}`,
        line: null,
        recoverable: true,
      }));
    let csl: Record<string, unknown> | null = null;
    try {
      csl = new Cite([item]).data[0] ?? null;
    } catch (error) {
      diagnostics.push({
        code: 'invalid-record',
        severity: 'error',
        message: error instanceof Error ? error.message : String(error),
        field: null,
        path: `$[${ordinal}]`,
        line: null,
        recoverable: true,
      });
    }
    const candidates = attachmentValues(item);
    return {
      ordinal,
      sourceKey: typeof item.id === 'string' && item.id ? item.id : null,
      rawHash,
      rawRecord,
      formatShadow: {
        item,
        unknownFields: diagnostics
          .filter((diagnostic) => diagnostic.code === 'unknown-field')
          .map((diagnostic) => diagnostic.field),
        ...(ordinal === 0 ? { topLevel: single ? 'single' : 'array' } : {}),
      },
      csl,
      diagnostics,
      attachmentCandidates: candidates.map((candidate, index) =>
        attachmentCandidate(rawHash, candidate, index),
      ),
    };
  });
  return enforceRecordLimits(records, options);
}
