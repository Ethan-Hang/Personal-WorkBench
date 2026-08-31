import { Cite } from '@citation-js/core';
import '@citation-js/plugin-ris';
import type { InteropDiagnostic } from '../../contract.js';
import {
  attachmentCandidate,
  enforceRecordLimits,
  sha256,
  type ParseInteropOptions,
  type ParsedInteropEnvelope,
} from './types.js';

interface RisLine {
  raw: string;
  content: string;
  number: number;
}

interface ScannedRisRecord {
  raw: string;
  lines: RisLine[];
  complete: boolean;
  error: string | null;
}

const KNOWN_RIS_TAGS = new Set([
  'AB',
  'AD',
  'A1',
  'A2',
  'A3',
  'A4',
  'AU',
  'C1',
  'C2',
  'C3',
  'C4',
  'C5',
  'C6',
  'C7',
  'C8',
  'CA',
  'CN',
  'CY',
  'DA',
  'DB',
  'DO',
  'DP',
  'ED',
  'EP',
  'ER',
  'ET',
  'ID',
  'IS',
  'J1',
  'J2',
  'JA',
  'JF',
  'JO',
  'KW',
  'L1',
  'L2',
  'L3',
  'L4',
  'LA',
  'LB',
  'LK',
  'M1',
  'M2',
  'M3',
  'N1',
  'N2',
  'NV',
  'OP',
  'PB',
  'PP',
  'PY',
  'RI',
  'RN',
  'RP',
  'SE',
  'SN',
  'SP',
  'ST',
  'T1',
  'T2',
  'T3',
  'TA',
  'TI',
  'TT',
  'TY',
  'U1',
  'U2',
  'U3',
  'U4',
  'U5',
  'UR',
  'VL',
  'VO',
  'Y1',
  'Y2',
]);

function scanRisRecords(input: string): ScannedRisRecord[] {
  const parts =
    input
      .replace(/^\uFEFF/, '')
      .match(/.*(?:\r\n|\n|$)/g)
      ?.filter(Boolean) ?? [];
  const lines = parts.map((raw, index) => ({
    raw,
    content: raw.replace(/\r?\n$/, ''),
    number: index + 1,
  }));
  const records: ScannedRisRecord[] = [];
  let current: RisLine[] | null = null;

  for (const line of lines) {
    if (/^TY {2}-/.test(line.content)) {
      if (current) {
        records.push({
          raw: current.map((item) => item.raw).join(''),
          lines: current,
          complete: false,
          error: '上一条 RIS 记录缺少 ER 结束标记',
        });
      }
      current = [line];
    } else if (current) {
      current.push(line);
    } else if (line.content.trim()) {
      records.push({
        raw: line.raw,
        lines: [line],
        complete: false,
        error: 'TY 开始标记之前存在内容',
      });
    }

    if (current && /^ER {2}-/.test(line.content)) {
      records.push({
        raw: current.map((item) => item.raw).join(''),
        lines: current,
        complete: true,
        error: null,
      });
      current = null;
    }
  }
  if (current) {
    records.push({
      raw: current.map((item) => item.raw).join(''),
      lines: current,
      complete: false,
      error: 'RIS 记录缺少 ER 结束标记',
    });
  }
  return records;
}

export function parseRisRecords(
  input: string,
  options: ParseInteropOptions = {},
): ParsedInteropEnvelope[] {
  const scanned = scanRisRecords(input);
  const records = scanned.map((record, ordinal): ParsedInteropEnvelope => {
    const tags = record.lines.flatMap((line) => {
      const match = /^([A-Z0-9]{2}) {2}-\s?(.*)$/.exec(line.content);
      return match ? [{ tag: match[1]!, value: match[2]!, line: line.number, raw: line.raw }] : [];
    });
    const diagnostics: InteropDiagnostic[] = [];
    if (record.error) {
      diagnostics.push({
        code: 'malformed-boundary',
        severity: 'error',
        message: record.error,
        field: null,
        path: null,
        line: record.lines[0]?.number ?? null,
        recoverable: true,
      });
    }
    for (const item of tags) {
      if (!KNOWN_RIS_TAGS.has(item.tag)) {
        diagnostics.push({
          code: 'unknown-field',
          severity: 'info',
          message: `已在 RIS 格式影子中保留标签 ${item.tag}`,
          field: item.tag,
          path: null,
          line: item.line,
          recoverable: true,
        });
      }
    }

    let csl: Record<string, unknown> | null = null;
    if (record.complete) {
      try {
        csl = new Cite(record.raw).data[0] ?? null;
      } catch (error) {
        diagnostics.push({
          code: 'invalid-record',
          severity: 'error',
          message: error instanceof Error ? error.message : String(error),
          field: null,
          path: null,
          line: record.lines[0]?.number ?? null,
          recoverable: true,
        });
      }
    }
    const rawHash = sha256(record.raw);
    const attachmentValues = tags
      .filter((item) => /^L[1-4]$/.test(item.tag))
      .map((item) => item.value)
      .filter(Boolean);
    return {
      ordinal,
      sourceKey: tags.find((item) => item.tag === 'ID')?.value || null,
      rawHash,
      rawRecord: record.raw,
      formatShadow: {
        lineStart: record.lines[0]?.number ?? 1,
        lineEnd: record.lines.at(-1)?.number ?? 1,
        newline: record.raw.includes('\r\n') ? 'crlf' : 'lf',
        complete: record.complete,
        tags,
      },
      csl,
      diagnostics,
      attachmentCandidates: attachmentValues.map((value, index) =>
        attachmentCandidate(rawHash, value, index),
      ),
    };
  });
  return enforceRecordLimits(records, options);
}
