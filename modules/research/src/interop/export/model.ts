import type {
  InteropFormat,
  InteropLossItem,
  InteropMappedRecord,
  WorkType,
} from '../../contract.js';

export interface ExportContributor {
  displayName: string;
  givenName: string | null;
  familyName: string | null;
  sequence: number;
}

export interface ExportIdentifier {
  scheme: 'doi' | 'arxiv' | 'isbn' | 'issn' | 'pmid' | 'url';
  value: string;
}

export interface ExportSourceShadow {
  format: InteropFormat;
  sourceKey: string | null;
  rawRecord: string;
  formatShadow: unknown;
  mapped: InteropMappedRecord | null;
}

export interface ExportRecordProjection {
  work: {
    id: string;
    revision: number;
    type: WorkType;
    title: string;
    abstract: string | null;
    year: number | null;
  };
  edition: {
    id: string;
    revision: number;
    kind: string;
    title: string;
    publicationTitle: string | null;
    publisher: string | null;
    publishedDate: string | null;
    volume: string | null;
    issue: string | null;
    pages: string | null;
  } | null;
  contributors: ExportContributor[];
  identifiers: ExportIdentifier[];
  attachmentCount: number;
  source: ExportSourceShadow | null;
  citationKey: string;
}

export interface WrittenInteropRecords {
  content: string;
  losses: InteropLossItem[];
  replayed: number;
  normalized: number;
}

const BIB_TYPE: Record<WorkType, string> = {
  article: 'article',
  'conference-paper': 'inproceedings',
  preprint: 'misc',
  thesis: 'phdthesis',
  'book-chapter': 'incollection',
  report: 'techreport',
  standard: 'techreport',
  dataset: 'misc',
  web: 'online',
  unknown: 'misc',
};

const RIS_TYPE: Record<WorkType, string> = {
  article: 'JOUR',
  'conference-paper': 'CPAPER',
  preprint: 'UNPB',
  thesis: 'THES',
  'book-chapter': 'CHAP',
  report: 'RPRT',
  standard: 'STAND',
  dataset: 'DATA',
  web: 'ELEC',
  unknown: 'GEN',
};

const CSL_TYPE: Record<WorkType, string> = {
  article: 'article-journal',
  'conference-paper': 'paper-conference',
  preprint: 'manuscript',
  thesis: 'thesis',
  'book-chapter': 'chapter',
  report: 'report',
  standard: 'standard',
  dataset: 'dataset',
  web: 'webpage',
  unknown: 'document',
};

function contributorNames(record: ExportRecordProjection): string[] {
  return [...record.contributors]
    .sort((left, right) => left.sequence - right.sequence)
    .map((person) => person.displayName);
}

function issuedYear(record: ExportRecordProjection): number | null {
  if (record.edition?.publishedDate) {
    const match = /^(\d{1,4})/.exec(record.edition.publishedDate);
    if (match) return Number(match[1]);
  }
  return record.work.year;
}

function identifier(record: ExportRecordProjection, scheme: ExportIdentifier['scheme']) {
  return record.identifiers.find((value) => value.scheme === scheme)?.value ?? null;
}

export function toCslRecord(record: ExportRecordProjection): Record<string, unknown> {
  const year = issuedYear(record);
  const csl: Record<string, unknown> = {
    id: record.citationKey,
    type: CSL_TYPE[record.work.type],
    title: record.work.title,
  };
  if (record.work.abstract) csl.abstract = record.work.abstract;
  if (year !== null) csl.issued = { 'date-parts': [[year]] };
  if (record.edition?.publicationTitle) csl['container-title'] = record.edition.publicationTitle;
  if (record.edition?.publisher) csl.publisher = record.edition.publisher;
  if (record.edition?.volume) csl.volume = record.edition.volume;
  if (record.edition?.issue) csl.issue = record.edition.issue;
  if (record.edition?.pages) csl.page = record.edition.pages;
  if (record.contributors.length > 0) {
    csl.author = [...record.contributors]
      .sort((left, right) => left.sequence - right.sequence)
      .map((person) =>
        person.familyName || person.givenName
          ? { family: person.familyName ?? undefined, given: person.givenName ?? undefined }
          : { literal: person.displayName },
      );
  }
  const schemes = [
    ['doi', 'DOI'],
    ['isbn', 'ISBN'],
    ['issn', 'ISSN'],
    ['pmid', 'PMID'],
    ['url', 'URL'],
  ] as const;
  for (const [scheme, field] of schemes) {
    const value = identifier(record, scheme);
    if (value) csl[field] = value;
  }
  const arxiv = identifier(record, 'arxiv');
  if (arxiv) {
    csl.eprint = arxiv;
    csl.URL ??= `https://arxiv.org/abs/${arxiv}`;
  }
  return csl;
}

function mappedMatches(record: ExportRecordProjection): boolean {
  const mapped = record.source?.mapped;
  if (!mapped) return false;
  return (
    mapped.type === record.work.type &&
    mapped.title === record.work.title &&
    mapped.abstract === record.work.abstract &&
    (mapped.issued?.year ?? null) === issuedYear(record) &&
    mapped.publicationTitle === (record.edition?.publicationTitle ?? null) &&
    mapped.publisher === (record.edition?.publisher ?? null) &&
    mapped.volume === (record.edition?.volume ?? null) &&
    mapped.issue === (record.edition?.issue ?? null) &&
    mapped.pages === (record.edition?.pages ?? null) &&
    JSON.stringify(
      mapped.contributors.map(
        (person) => person.literal ?? [person.given, person.family].filter(Boolean).join(' '),
      ),
    ) === JSON.stringify(contributorNames(record)) &&
    mapped.identifiers.every((item) =>
      record.identifiers.some(
        (current) => current.scheme === item.scheme && current.value === item.value,
      ),
    )
  );
}

function innerShadow(source: ExportSourceShadow): Record<string, unknown> | null {
  if (!source.formatShadow || typeof source.formatShadow !== 'object') return null;
  const outer = source.formatShadow as Record<string, unknown>;
  const value = outer.value;
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : outer;
}

function unknownSourceFields(record: ExportRecordProjection): string[] {
  if (!record.source) return [];
  const shadow = innerShadow(record.source);
  if (!shadow) return [];
  if (record.source.format === 'bibtex') {
    const fields = shadow.fields;
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return [];
    const known = new Set([
      'title',
      'author',
      'year',
      'date',
      'journal',
      'booktitle',
      'publisher',
      'volume',
      'number',
      'pages',
      'doi',
      'isbn',
      'issn',
      'pmid',
      'url',
      'abstract',
      'file',
      'pdf',
      'keywords',
    ]);
    return Object.keys(fields).filter((field) => !known.has(field.toLowerCase()));
  }
  if (record.source.format === 'ris') {
    const tags = Array.isArray(shadow.tags) ? shadow.tags : [];
    const known = new Set([
      'TY',
      'ID',
      'AU',
      'TI',
      'T1',
      'T2',
      'PY',
      'Y1',
      'PB',
      'VL',
      'IS',
      'SP',
      'EP',
      'DO',
      'SN',
      'UR',
      'AB',
      'N2',
      'ER',
      'L1',
      'L2',
      'L3',
      'L4',
    ]);
    return tags.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const tag = (item as { tag?: unknown }).tag;
      return typeof tag === 'string' && !known.has(tag) ? [tag] : [];
    });
  }
  const item = shadow.item;
  if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
  const canonical = toCslRecord(record);
  return Object.keys(item).filter((field) => !(field in canonical));
}

function baseLosses(record: ExportRecordProjection, format: InteropFormat): InteropLossItem[] {
  const losses: InteropLossItem[] = [];
  if (!record.edition) {
    losses.push({
      workId: record.work.id,
      editionId: null,
      status: 'no-edition',
      field: null,
      message: '作品没有版本，输出仅含 Work 字段',
    });
  }
  if (record.attachmentCount > 0) {
    losses.push({
      workId: record.work.id,
      editionId: record.edition?.id ?? null,
      status: 'attachment-omitted',
      field: 'attachments',
      message: '记录格式不包含附件文件；附件未写入输出',
    });
  }
  if (record.source && record.source.format !== format) {
    for (const field of unknownSourceFields(record)) {
      losses.push({
        workId: record.work.id,
        editionId: record.edition?.id ?? null,
        status: 'unmapped',
        field,
        message: `来源格式专有字段 ${field} 无法映射到 ${format}`,
      });
    }
  }
  return losses;
}

function bibValue(value: string): string {
  return `{${value.replaceAll('\\', '\\\\').replaceAll('{', '\\{').replaceAll('}', '\\}')}}`;
}

function bibFields(record: ExportRecordProjection): Record<string, string> {
  const fields: Record<string, string> = {};
  const source = record.source?.format === 'bibtex' ? innerShadow(record.source) : null;
  const sourceFields = source?.fields;
  if (sourceFields && typeof sourceFields === 'object' && !Array.isArray(sourceFields)) {
    for (const [key, value] of Object.entries(sourceFields)) {
      if (typeof value === 'string' || typeof value === 'number') fields[key] = String(value);
    }
  }
  fields.title = record.work.title;
  const authors = [...record.contributors]
    .sort((left, right) => left.sequence - right.sequence)
    .map((person) =>
      person.familyName
        ? `${person.familyName}, ${person.givenName ?? ''}`.trimEnd()
        : person.displayName,
    );
  if (authors.length > 0) fields.author = authors.join(' and ');
  const year = issuedYear(record);
  if (year !== null) fields.year = String(year);
  if (record.work.abstract) fields.abstract = record.work.abstract;
  if (record.edition?.publicationTitle) {
    fields[record.work.type === 'book-chapter' ? 'booktitle' : 'journal'] =
      record.edition.publicationTitle;
  }
  if (record.edition?.publisher) fields.publisher = record.edition.publisher;
  if (record.edition?.volume) fields.volume = record.edition.volume;
  if (record.edition?.issue) fields.number = record.edition.issue;
  if (record.edition?.pages) fields.pages = record.edition.pages.replace('-', '--');
  for (const scheme of ['doi', 'isbn', 'issn', 'pmid', 'url'] as const) {
    const value = identifier(record, scheme);
    if (value) fields[scheme] = value;
  }
  const arxiv = identifier(record, 'arxiv');
  if (arxiv) {
    fields.eprint = arxiv;
    fields.eprinttype = 'arxiv';
  }
  return fields;
}

function writeBibtex(record: ExportRecordProjection): string {
  const fields = bibFields(record);
  const ordered = Object.keys(fields).sort((left, right) => {
    const priority = [
      'title',
      'author',
      'year',
      'journal',
      'booktitle',
      'publisher',
      'volume',
      'number',
      'pages',
      'doi',
    ];
    const a = priority.indexOf(left);
    const b = priority.indexOf(right);
    return (a < 0 ? 999 : a) - (b < 0 ? 999 : b) || left.localeCompare(right);
  });
  return `@${BIB_TYPE[record.work.type]}{${record.citationKey},\n${ordered
    .map((field) => `  ${field} = ${bibValue(fields[field]!)}`)
    .join(',\n')}\n}`;
}

function writeRis(record: ExportRecordProjection): string {
  const retained: Array<{ tag: string; value: string }> = [];
  const source = record.source?.format === 'ris' ? innerShadow(record.source) : null;
  const tags = Array.isArray(source?.tags) ? source.tags : [];
  const replaced = new Set([
    'TY',
    'ID',
    'AU',
    'TI',
    'T1',
    'T2',
    'PY',
    'Y1',
    'PB',
    'VL',
    'IS',
    'SP',
    'EP',
    'DO',
    'SN',
    'UR',
    'AB',
    'N2',
    'ER',
  ]);
  for (const item of tags) {
    if (!item || typeof item !== 'object') continue;
    const tag = (item as { tag?: unknown }).tag;
    const value = (item as { value?: unknown }).value;
    if (typeof tag === 'string' && typeof value === 'string' && !replaced.has(tag)) {
      retained.push({ tag, value });
    }
  }
  const lines = [`TY  - ${RIS_TYPE[record.work.type]}`, `ID  - ${record.citationKey}`];
  for (const author of contributorNames(record)) lines.push(`AU  - ${author}`);
  lines.push(`TI  - ${record.work.title}`);
  if (record.edition?.publicationTitle) lines.push(`T2  - ${record.edition.publicationTitle}`);
  const year = issuedYear(record);
  if (year !== null) lines.push(`PY  - ${year}`);
  if (record.edition?.publisher) lines.push(`PB  - ${record.edition.publisher}`);
  if (record.edition?.volume) lines.push(`VL  - ${record.edition.volume}`);
  if (record.edition?.issue) lines.push(`IS  - ${record.edition.issue}`);
  if (record.edition?.pages) {
    const [start, end] = record.edition.pages.split(/--?/, 2);
    if (start) lines.push(`SP  - ${start}`);
    if (end) lines.push(`EP  - ${end}`);
  }
  const doi = identifier(record, 'doi');
  if (doi) lines.push(`DO  - ${doi}`);
  const serial = identifier(record, 'issn') ?? identifier(record, 'isbn');
  if (serial) lines.push(`SN  - ${serial}`);
  const url = identifier(record, 'url');
  if (url) lines.push(`UR  - ${url}`);
  if (record.work.abstract) lines.push(`AB  - ${record.work.abstract}`);
  lines.push(...retained.map((item) => `${item.tag}  - ${item.value}`), 'ER  - ');
  return `${lines.join('\r\n')}\r\n`;
}

function cslWithShadow(record: ExportRecordProjection): Record<string, unknown> {
  const source = record.source?.format === 'csl-json' ? innerShadow(record.source) : null;
  const item = source?.item;
  const base = item && typeof item === 'object' && !Array.isArray(item) ? { ...item } : {};
  return { ...base, ...toCslRecord(record) };
}

export function writeInteropRecords(
  format: InteropFormat,
  records: ExportRecordProjection[],
): WrittenInteropRecords {
  const losses = records.flatMap((record) => baseLosses(record, format));
  let replayed = 0;
  let normalized = 0;
  const rendered = records.map((record) => {
    if (record.source?.format === format && mappedMatches(record)) {
      replayed += 1;
      return record.source.rawRecord;
    }
    normalized += 1;
    if (record.source?.format === format) {
      losses.push({
        workId: record.work.id,
        editionId: record.edition?.id ?? null,
        status: 'normalized',
        field: null,
        message: '已用当前字段更新已知格式字段，并保留可安全合并的未知字段',
      });
    }
    if (format === 'bibtex') return writeBibtex(record);
    if (format === 'ris') return writeRis(record);
    return JSON.stringify(cslWithShadow(record));
  });
  const content =
    format === 'csl-json'
      ? `${JSON.stringify(
          rendered.map((value) => JSON.parse(value)),
          null,
          2,
        )}\n`
      : format === 'bibtex'
        ? `${rendered.join('\n\n')}\n`
        : rendered.join('');
  return { content, losses, replayed, normalized };
}

function keyToken(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '')
    .slice(0, 48);
}

export function generateCitationKeys(
  records: Array<Omit<ExportRecordProjection, 'citationKey'>>,
  preferences: Map<string, string>,
): Map<string, string> {
  const candidates = records.map((record) => {
    const target = `${record.work.id}:${record.edition?.id ?? ''}`;
    const preferred = preferences.get(target) ?? preferences.get(record.work.id);
    const imported = record.source?.sourceKey?.trim();
    const firstAuthor = [...record.contributors].sort(
      (left, right) => left.sequence - right.sequence,
    )[0];
    const author = keyToken(firstAuthor?.familyName ?? firstAuthor?.displayName ?? '') || 'Anon';
    const year = issuedYear({ ...record, citationKey: '' }) ?? 'n.d.';
    const title = keyToken(record.work.title.split(/\s+/)[0] ?? '') || 'Work';
    return {
      target,
      preferred:
        preferred ?? (imported && /^[A-Za-z][A-Za-z0-9_:.+/-]*$/.test(imported) ? imported : null),
      generated: `${author}${year}${title}`,
      stable: `${record.work.id}:${record.edition?.id ?? ''}`,
    };
  });
  const explicit = candidates.filter((item) => item.preferred);
  const duplicate = new Set<string>();
  const seen = new Set<string>();
  for (const item of explicit) {
    const normalized = item.preferred!.toLocaleLowerCase();
    if (seen.has(normalized)) duplicate.add(normalized);
    seen.add(normalized);
  }
  if (duplicate.size > 0) throw new Error('citation key 偏好存在重复值');

  const used = new Set(explicit.map((item) => item.preferred!.toLocaleLowerCase()));
  const result = new Map<string, string>();
  for (const item of explicit) result.set(item.target, item.preferred!);
  const generated = candidates
    .filter((item) => !item.preferred)
    .sort(
      (left, right) =>
        left.generated.localeCompare(right.generated) || left.stable.localeCompare(right.stable),
    );
  for (const item of generated) {
    let key = item.generated;
    let suffix = 0;
    while (used.has(key.toLocaleLowerCase())) {
      const quotient = Math.floor(suffix / 26);
      const letter = String.fromCharCode(97 + (suffix % 26));
      key = `${item.generated}${quotient ? quotient + 1 : ''}${letter}`;
      suffix += 1;
    }
    used.add(key.toLocaleLowerCase());
    result.set(item.target, key);
  }
  return result;
}
