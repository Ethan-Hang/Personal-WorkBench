import { createHash, randomUUID } from 'node:crypto';
import { access, lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import type {
  Evidence,
  KnowledgeExportFormat,
  KnowledgeExportPreview,
  KnowledgeExportReport,
  KnowledgeExportSelection,
  MatrixCell,
  WritingBlock,
} from '../contract.js';
import type { KnowledgeRepository } from '../knowledge/repository.js';

export class KnowledgeExportBuildError extends Error {
  constructor(
    readonly kind: 'invalid' | 'not-found' | 'conflict',
    message: string,
  ) {
    super(message);
    this.name = 'KnowledgeExportBuildError';
  }
}

interface BuiltKnowledgeExport {
  title: string;
  content: string;
  extension: '.md' | '.csv';
  objectCount: number;
  referenceCount: number;
  sourceIssueCount: number;
  warnings: string[];
}

function abortIfNeeded(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException('研究内容导出已取消', 'AbortError');
}

function evidenceUrl(evidence: Evidence): string {
  const params = new URLSearchParams({
    page: String(evidence.sourceSnapshot.pageNumber),
    context: evidence.sourceSnapshot.contextId ?? 'general',
    annotation: evidence.sourceSnapshot.annotationId,
  });
  return `/research/read/${encodeURIComponent(evidence.sourceSnapshot.assetId)}?${params.toString()}`;
}

function evidenceCitation(evidence: Evidence): string {
  const title = evidence.title ?? evidence.sourceSnapshot.workTitle;
  return `[${title} — ${evidence.sourceSnapshot.workTitle}, p. ${evidence.sourceSnapshot.pageNumber}](${evidenceUrl(evidence)}) <!-- research:evidence:${evidence.id} -->`;
}

function resourceCitation(block: WritingBlock): string {
  if (block.kind === 'text') return block.text;
  const label = block.targetLabel;
  const marker = `<!-- research:${block.kind}:${block.targetId} -->`;
  return block.targetUrl ? `[${label}](${block.targetUrl}) ${marker}` : `${label} ${marker}`;
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function cellText(
  repository: KnowledgeRepository,
  cell: MatrixCell | undefined,
): Promise<{ text: string; references: number; issues: number }> {
  if (!cell || cell.status !== 'active') return { text: '', references: 0, issues: 0 };
  const links = (await repository.listMatrixCellEvidence(cell.id, false)) ?? [];
  const evidence = (
    await Promise.all(
      links
        .filter((link) => link.status === 'active')
        .map((link) => repository.getEvidence(link.evidenceId)),
    )
  ).filter((item): item is Evidence => item !== null);
  const citations = evidence.map(evidenceCitation);
  return {
    text: [cell.synthesis.trim(), ...citations].filter(Boolean).join(' '),
    references: citations.length,
    issues: evidence.filter((item) => item.sourceState !== 'current').length,
  };
}

async function buildMatrixExport(
  repository: KnowledgeRepository,
  selection: KnowledgeExportSelection,
): Promise<BuiltKnowledgeExport> {
  const matrix = await repository.getMatrix(selection.objectId, false);
  if (!matrix || matrix.status === 'deleted') {
    throw new KnowledgeExportBuildError('not-found', '对照矩阵不存在');
  }
  const columns = matrix.columns
    .filter((column) => column.status === 'active')
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
  const rows = matrix.rows
    .filter((row) => row.status === 'active')
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
  const window = await repository.getMatrixCellWindow(matrix.id, 0, columns.length, 0, rows.length);
  if (!window) throw new KnowledgeExportBuildError('not-found', '对照矩阵不存在');
  const cellByCoordinate = new Map(
    window.cells.map((cell) => [`${cell.rowId}:${cell.columnId}`, cell] as const),
  );
  const renderedRows: Array<{ label: string; cells: string[] }> = [];
  let references = 0;
  let issues = 0;
  for (const row of rows) {
    const label =
      row.kind === 'claim'
        ? ((await repository.getClaim(row.claimId))?.statement ?? `观点 ${row.claimId}`)
        : (row.title ?? row.question ?? '比较维度');
    const renderedCells: string[] = [];
    for (const column of columns) {
      const rendered = await cellText(repository, cellByCoordinate.get(`${row.id}:${column.id}`));
      renderedCells.push(rendered.text);
      references += rendered.references;
      issues += rendered.issues;
    }
    renderedRows.push({ label, cells: renderedCells });
  }

  let content: string;
  if (selection.format === 'csv') {
    content = [
      ['比较项', ...columns.map((column) => column.workTitle)].map(csvCell).join(','),
      ...renderedRows.map((row) => [row.label, ...row.cells].map(csvCell).join(',')),
    ].join('\r\n');
    content += '\r\n';
  } else {
    const header = ['比较项', ...columns.map((column) => column.workTitle)];
    content = [
      `# ${matrix.title}`,
      '',
      matrix.description?.trim() ?? '',
      matrix.description?.trim() ? '' : null,
      `<!-- research:matrix:${matrix.id} -->`,
      '',
      `| ${header.join(' | ')} |`,
      `| ${header.map(() => '---').join(' | ')} |`,
      ...renderedRows.map(
        (row) =>
          `| ${[row.label, ...row.cells].map((value) => value.replaceAll('|', '\\|').replaceAll('\n', '<br>')).join(' | ')} |`,
      ),
      '',
    ]
      .filter((line): line is string => line !== null)
      .join('\n');
  }
  return {
    title: matrix.title,
    content,
    extension: selection.format === 'csv' ? '.csv' : '.md',
    objectCount: 1 + columns.length + rows.length + window.cells.length,
    referenceCount: references,
    sourceIssueCount: issues,
    warnings: issues > 0 ? [`${issues} 个证据来源需要复核`] : [],
  };
}

async function buildWritingExport(
  repository: KnowledgeRepository,
  selection: KnowledgeExportSelection,
): Promise<BuiltKnowledgeExport> {
  if (selection.format !== 'markdown') {
    throw new KnowledgeExportBuildError('invalid', '写作板只支持 Markdown 输出');
  }
  const document = await repository.getWritingDocument(selection.objectId, false);
  if (!document || document.status === 'deleted') {
    throw new KnowledgeExportBuildError('not-found', '写作文稿不存在');
  }
  const sections = document.sections
    .filter((section) => section.status === 'active')
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
  const lines = [
    `# ${document.title}`,
    '',
    `<!-- research:writing-document:${document.id} -->`,
    '',
  ];
  let blocks = 0;
  let references = 0;
  let issues = 0;
  for (const section of sections) {
    lines.push(`## ${section.title}`, '', `<!-- research:writing-section:${section.id} -->`, '');
    const activeBlocks = section.blocks
      .filter((block) => block.status === 'active')
      .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
    for (const block of activeBlocks) {
      blocks += 1;
      if (block.kind === 'text') lines.push(block.text, '');
      else {
        references += 1;
        if (block.kind === 'evidence') {
          const evidence = await repository.getEvidence(block.targetId);
          if (evidence) {
            if (block.targetState !== 'current' || evidence.sourceState !== 'current') issues += 1;
            lines.push(`> 来源：${evidenceCitation(evidence)}`, '');
            continue;
          }
        }
        if (block.targetState !== 'current') issues += 1;
        lines.push(`> 引用：${resourceCitation(block)}`, '');
      }
    }
  }
  return {
    title: document.title,
    content: `${lines.join('\n').trimEnd()}\n`,
    extension: '.md',
    objectCount: 1 + sections.length + blocks,
    referenceCount: references,
    sourceIssueCount: issues,
    warnings: issues > 0 ? [`${issues} 个引用来源已变化、归档、删除或不可用`] : [],
  };
}

export async function buildKnowledgeExport(
  repository: KnowledgeRepository,
  selection: KnowledgeExportSelection,
): Promise<BuiltKnowledgeExport> {
  return selection.objectType === 'matrix'
    ? buildMatrixExport(repository, selection)
    : buildWritingExport(repository, selection);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function validateTargetExtension(targetPath: string, format: KnowledgeExportFormat): void {
  const expected = format === 'csv' ? '.csv' : '.md';
  if (extname(targetPath).toLowerCase() !== expected) {
    throw new KnowledgeExportBuildError('invalid', `输出路径必须使用 ${expected} 扩展名`);
  }
}

export async function previewKnowledgeExport(
  repository: KnowledgeRepository,
  selection: KnowledgeExportSelection,
  targetPath?: string,
): Promise<KnowledgeExportPreview> {
  const built = await buildKnowledgeExport(repository, selection);
  const resolvedTarget = targetPath ? resolve(targetPath) : null;
  if (resolvedTarget) validateTargetExtension(resolvedTarget, selection.format);
  return {
    ...selection,
    title: built.title,
    fileExtension: built.extension,
    objectCount: built.objectCount,
    referenceCount: built.referenceCount,
    sourceIssueCount: built.sourceIssueCount,
    estimatedBytes: Buffer.byteLength(built.content, 'utf8'),
    targetPath: resolvedTarget,
    targetExists: resolvedTarget ? await exists(resolvedTarget) : false,
    warnings: built.warnings,
  };
}

export async function writeKnowledgeExport(input: {
  repository: KnowledgeRepository;
  selection: KnowledgeExportSelection;
  targetPath: string;
  overwriteConfirmed: boolean;
  completedAt: () => string;
  signal?: AbortSignal;
}): Promise<KnowledgeExportReport> {
  const targetPath = resolve(input.targetPath);
  validateTargetExtension(targetPath, input.selection.format);
  const built = await buildKnowledgeExport(input.repository, input.selection);
  abortIfNeeded(input.signal);
  await mkdir(dirname(targetPath), { recursive: true });
  const targetExists = await exists(targetPath);
  if (targetExists) {
    const targetStat = await lstat(targetPath);
    if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
      throw new KnowledgeExportBuildError('invalid', '导出目标必须是普通文件');
    }
    if (!input.overwriteConfirmed) {
      throw new KnowledgeExportBuildError('conflict', '导出目标已存在，需要确认覆盖');
    }
  }
  const token = randomUUID();
  const temporary = join(dirname(targetPath), `.${basename(targetPath)}.tmp-${token}`);
  const backup = join(dirname(targetPath), `.${basename(targetPath)}.backup-${token}`);
  let backupCreated = false;
  try {
    const handle = await open(temporary, 'wx');
    try {
      await handle.writeFile(built.content, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    abortIfNeeded(input.signal);
    const output = await readFile(temporary);
    const sha256 = createHash('sha256').update(output).digest('hex');
    if (output.toString('utf8') !== built.content) {
      throw new Error('研究内容导出写入校验失败');
    }
    if (targetExists) {
      await rename(targetPath, backup);
      backupCreated = true;
    }
    abortIfNeeded(input.signal);
    await rename(temporary, targetPath);
    if (backupCreated) {
      await rm(backup, { force: true });
      backupCreated = false;
    }
    return {
      ...input.selection,
      targetPath,
      bytes: output.length,
      sha256,
      objectCount: built.objectCount,
      referenceCount: built.referenceCount,
      sourceIssueCount: built.sourceIssueCount,
      outputValidated: true,
      overwritten: targetExists,
      completedAt: input.completedAt(),
      warnings: built.warnings,
    };
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    if (backupCreated) {
      if (await exists(targetPath)) await rm(targetPath, { force: true });
      await rename(backup, targetPath).catch(() => undefined);
    }
    throw error;
  }
}
