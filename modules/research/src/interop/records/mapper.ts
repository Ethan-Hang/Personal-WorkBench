import type {
  InteropDate,
  InteropDiagnostic,
  InteropMappedRecord,
  InteropPerson,
  InteropRecordStatus,
  WorkType,
} from '../../contract.js';
import { normalizeArxivId, normalizeDoi } from '../../ingest/identifiers.js';
import type { CslRecord, ParsedInteropEnvelope } from './types.js';

export interface MappedInteropEnvelope {
  mapped: InteropMappedRecord | null;
  diagnostics: InteropDiagnostic[];
  status: Extract<InteropRecordStatus, 'valid' | 'invalid' | 'needs-review'>;
}

function stringValue(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  return null;
}

function workType(sourceType: string | null): WorkType {
  switch (sourceType) {
    case 'article':
    case 'article-journal':
    case 'article-magazine':
    case 'article-newspaper':
      return 'article';
    case 'paper-conference':
    case 'speech':
      return 'conference-paper';
    case 'manuscript':
    case 'post':
      return 'preprint';
    case 'thesis':
      return 'thesis';
    case 'chapter':
    case 'entry':
    case 'entry-dictionary':
    case 'entry-encyclopedia':
      return 'book-chapter';
    case 'report':
      return 'report';
    case 'standard':
      return 'standard';
    case 'dataset':
      return 'dataset';
    case 'webpage':
    case 'post-weblog':
      return 'web';
    default:
      return 'unknown';
  }
}

function dateValue(value: unknown): InteropDate | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const parts = Array.isArray(record['date-parts']) ? record['date-parts'][0] : null;
  const values = Array.isArray(parts) ? parts : [];
  const number = (index: number, min: number, max: number) => {
    const candidate = values[index];
    return typeof candidate === 'number' && candidate >= min && candidate <= max ? candidate : null;
  };
  return {
    year: number(0, 0, 9999),
    month: number(1, 1, 12),
    day: number(2, 1, 31),
    literal: stringValue(record.literal) ?? stringValue(record.raw),
  };
}

function cslPeople(value: unknown): InteropPerson[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate): InteropPerson[] => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return [];
    const person = candidate as Record<string, unknown>;
    const literal = stringValue(person.literal);
    if (literal) {
      return [
        {
          kind: 'literal',
          family: null,
          given: null,
          literal,
          suffix: null,
          nonDroppingParticle: null,
        },
      ];
    }
    return [
      {
        kind: 'structured',
        family: stringValue(person.family),
        given: stringValue(person.given),
        literal: null,
        suffix: stringValue(person.suffix),
        nonDroppingParticle: stringValue(person['non-dropping-particle']),
      },
    ];
  });
}

function bibtexPeople(shadow: unknown): InteropPerson[] | null {
  if (!shadow || typeof shadow !== 'object' || Array.isArray(shadow)) return null;
  const fields = (shadow as { fields?: unknown }).fields;
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return null;
  const authors = (fields as Record<string, unknown>).author;
  if (!Array.isArray(authors)) return null;
  return authors.flatMap((candidate): InteropPerson[] => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return [];
    const author = candidate as Record<string, unknown>;
    const organization = stringValue(author.name);
    if (organization) {
      return [
        {
          kind: 'organization',
          family: null,
          given: null,
          literal: organization,
          suffix: null,
          nonDroppingParticle: null,
        },
      ];
    }
    return [
      {
        kind: 'structured',
        family: stringValue(author.lastName),
        given: stringValue(author.firstName),
        literal: null,
        suffix: stringValue(author.suffix),
        nonDroppingParticle: stringValue(author.prefix),
      },
    ];
  });
}

function identifiers(csl: CslRecord): InteropMappedRecord['identifiers'] {
  const result: InteropMappedRecord['identifiers'] = [];
  const add = (scheme: InteropMappedRecord['identifiers'][number]['scheme'], value: unknown) => {
    const text = stringValue(value);
    if (text && !result.some((item) => item.scheme === scheme && item.value === text)) {
      result.push({ scheme, value: text });
    }
  };
  const doi = stringValue(csl.DOI);
  if (doi && normalizeDoi(doi)) add('doi', doi);
  add('isbn', csl.ISBN);
  add('issn', csl.ISSN);
  add('pmid', csl.PMID);
  const url = stringValue(csl.URL);
  if (url) {
    const arxiv = normalizeArxivId(url);
    if (arxiv) add('arxiv', arxiv);
    else add('url', url);
  }
  const eprint = stringValue(csl.eprint);
  if (eprint && normalizeArxivId(eprint)) add('arxiv', eprint);
  return result;
}

function tags(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[;,]/)
      : [];
  return [
    ...new Set(
      values.flatMap((item) => (typeof item === 'string' ? [item.trim()] : [])).filter(Boolean),
    ),
  ];
}

export function mapInteropRecord(envelope: ParsedInteropEnvelope): MappedInteropEnvelope {
  const diagnostics = [...envelope.diagnostics];
  if (!envelope.csl) return { mapped: null, diagnostics, status: 'invalid' };
  const csl = envelope.csl;
  const sourceType = stringValue(csl.type);
  const type = workType(sourceType);
  if (type === 'unknown' && sourceType) {
    diagnostics.push({
      code: 'unknown-type',
      severity: 'warning',
      message: `来源类型 ${sourceType} 暂按 unknown 导入`,
      field: 'type',
      path: null,
      line: null,
      recoverable: true,
    });
  }
  const title = stringValue(csl.title) ?? '';
  if (!title) {
    diagnostics.push({
      code: 'field-conflict',
      severity: 'warning',
      message: '记录缺少标题，需要在提交前审查',
      field: 'title',
      path: null,
      line: null,
      recoverable: true,
    });
  }
  const mapped: InteropMappedRecord = {
    type,
    sourceType,
    title,
    abstract: stringValue(csl.abstract),
    issued: dateValue(csl.issued),
    publicationTitle: stringValue(csl['container-title']),
    publisher: stringValue(csl.publisher),
    volume: stringValue(csl.volume),
    issue: stringValue(csl.issue),
    pages: stringValue(csl.page),
    contributors: bibtexPeople(envelope.formatShadow) ?? cslPeople(csl.author),
    identifiers: identifiers(csl),
    tagSuggestions: tags(csl.keyword),
  };
  const hasWarning = diagnostics.some((diagnostic) => diagnostic.severity === 'warning');
  const hasError = diagnostics.some((diagnostic) => diagnostic.severity === 'error');
  return {
    mapped,
    diagnostics,
    status: hasError ? 'invalid' : hasWarning ? 'needs-review' : 'valid',
  };
}
