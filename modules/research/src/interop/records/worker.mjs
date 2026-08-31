import 'tsx/esm';
import { readFile, stat } from 'node:fs/promises';
import { parentPort, workerData } from 'node:worker_threads';
import { setImmediate as setImmediatePromise } from 'node:timers/promises';
import { TextDecoder } from 'node:util';

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const DEFAULT_BATCH_SIZE = 200;

function fail(code, error) {
  parentPort?.postMessage({
    type: 'failed',
    code,
    message: error instanceof Error ? error.message : String(error),
  });
  parentPort?.close();
}

async function loadParser(format) {
  if (format === 'bibtex') {
    const { parseBibtexRecords } = await import('./bibtex-parser.ts');
    return parseBibtexRecords;
  }
  if (format === 'ris') {
    const { parseRisRecords } = await import('./ris-parser.ts');
    return parseRisRecords;
  }
  if (format === 'csl-json') {
    const { parseCslJsonRecords } = await import('./csl-json-parser.ts');
    return parseCslJsonRecords;
  }
  throw Object.assign(new Error(`不支持的互操作格式：${format}`), {
    code: 'RESEARCH_INTEROP_UNSUPPORTED_FORMAT',
  });
}

async function main() {
  if (!parentPort) throw new Error('互操作解析 worker 必须在线程中运行');
  const {
    sourcePath,
    format,
    maxBytes = DEFAULT_MAX_BYTES,
    maxRecords,
    maxRecordBytes,
    batchSize = DEFAULT_BATCH_SIZE,
  } = workerData ?? {};
  if (typeof sourcePath !== 'string' || !sourcePath) throw new Error('缺少受控源文件路径');
  const file = await stat(sourcePath);
  if (!file.isFile()) throw new Error('互操作来源不是普通文件');
  if (file.size > maxBytes) {
    throw Object.assign(new Error(`来源文件 ${file.size} 字节，超过 ${maxBytes} 字节限制`), {
      code: 'RESEARCH_INTEROP_INVALID_RECORD',
    });
  }
  const bytes = await readFile(sourcePath);
  let input;
  try {
    input = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw Object.assign(new Error('来源文件不是有效 UTF-8'), {
      code: 'RESEARCH_INTEROP_UNSUPPORTED_ENCODING',
    });
  }
  const parse = await loadParser(format);
  const { mapInteropRecord } = await import('./mapper.ts');
  const parsed = parse(input, { maxRecords, maxRecordBytes });
  const sourceKeyCounts = new Map();
  for (const record of parsed) {
    if (record.sourceKey) {
      sourceKeyCounts.set(record.sourceKey, (sourceKeyCounts.get(record.sourceKey) ?? 0) + 1);
    }
  }
  let cancelled = false;
  parentPort.on('message', (message) => {
    if (message?.type === 'cancel') cancelled = true;
  });

  for (let offset = 0; offset < parsed.length; offset += batchSize) {
    if (cancelled) {
      parentPort.postMessage({ type: 'cancelled', checkpointOrdinal: offset });
      parentPort.close();
      return;
    }
    const records = parsed.slice(offset, offset + batchSize).map((record) => {
      const mapped = mapInteropRecord(record);
      const duplicateSourceKey =
        record.sourceKey && (sourceKeyCounts.get(record.sourceKey) ?? 0) > 1
          ? {
              code: 'duplicate-source-key',
              severity: 'warning',
              message: `来源局部 key ${record.sourceKey} 在同一文件中重复`,
              field: 'sourceKey',
              path: null,
              line: null,
              recoverable: true,
            }
          : null;
      return {
        ordinal: record.ordinal,
        sourceKey: record.sourceKey,
        rawHash: record.rawHash,
        rawRecord: record.rawRecord,
        summary: mapped.mapped?.title || record.sourceKey || `记录 ${record.ordinal + 1}`,
        formatShadow: {
          value: record.formatShadow,
          attachmentCandidates: record.attachmentCandidates,
        },
        mapped: mapped.mapped,
        diagnostics: duplicateSourceKey
          ? [...mapped.diagnostics, duplicateSourceKey]
          : mapped.diagnostics,
        status: duplicateSourceKey && mapped.status === 'valid' ? 'needs-review' : mapped.status,
      };
    });
    parentPort.postMessage({
      type: 'batch',
      totalCount: parsed.length,
      checkpointOrdinal: offset + records.length,
      records,
    });
    await setImmediatePromise();
  }
  parentPort.postMessage({ type: 'completed', totalCount: parsed.length });
  parentPort.close();
}

main().catch((error) => fail(error?.code ?? 'RESEARCH_INTEROP_INVALID_RECORD', error));
