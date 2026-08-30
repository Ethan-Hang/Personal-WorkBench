import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, IconExternalLink, IconPlus } from '@workbench/ui';
import type {
  MatrixCell,
  MatrixColumn,
  MatrixDetail,
  MatrixRow,
  MatrixStatus,
  UpdateMatrixStructureInput,
} from '../../contract.js';
import {
  deleteKnowledgeMatrix,
  deleteMatrixCellEvidence,
  fetchKnowledgeClaims,
  fetchKnowledgeMatrices,
  fetchKnowledgeMatrix,
  fetchMatrixCandidates,
  fetchMatrixCellWindow,
  fetchWorks,
  patchKnowledgeMatrix,
  patchMatrixCell,
  postKnowledgeMatrix,
  postMatrixCell,
  postMatrixCellEvidence,
  postRestoreKnowledgeMatrix,
  postReviewMatrixCell,
  putKnowledgeMatrixStructure,
} from '../api.js';
import { SourceStatus } from './SourceStatus.js';

const WINDOW_SIZE = 12;
const ROW_WINDOW_SIZE = 20;

const statusLabels: Record<MatrixStatus, string> = {
  active: '当前',
  archived: '已归档',
  deleted: '回收站',
};

function sourceUrl(evidence: {
  assetId: string;
  annotationId: string;
  sourceSnapshot: { pageNumber: number; contextId: string | null };
}) {
  const params = new URLSearchParams({
    page: String(evidence.sourceSnapshot.pageNumber),
    context: evidence.sourceSnapshot.contextId ?? 'general',
    annotation: evidence.annotationId,
  });
  return `/research/read/${encodeURIComponent(evidence.assetId)}?${params.toString()}`;
}

function rowLabel(row: MatrixRow, claimStatements: Map<string, string>) {
  if (row.kind === 'claim') return claimStatements.get(row.claimId) ?? '观点不可用';
  return row.title ?? row.question ?? '比较维度';
}

function structureInput(
  matrix: MatrixDetail,
  columns: Array<Pick<MatrixColumn, 'id' | 'workId'>>,
  rows: MatrixRow[],
): UpdateMatrixStructureInput {
  return {
    expectedStructureRevision: matrix.structureRevision,
    columns: columns.map((column, position) => ({ ...column, position })),
    rows: rows.map((row, position) =>
      row.kind === 'claim'
        ? { id: row.id, kind: 'claim', claimId: row.claimId, position }
        : {
            id: row.id,
            kind: 'dimension',
            title: row.title,
            question: row.question,
            position,
          },
    ),
  };
}

export function MatrixEditor({
  contextId,
  contextArchived,
  initialMatrixId,
  initialStatus,
  onMessage,
}: {
  contextId: string | null | undefined;
  contextArchived: boolean;
  initialMatrixId?: string | null;
  initialStatus?: MatrixStatus;
  onMessage: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<MatrixStatus>(initialStatus ?? 'active');
  const [selectedId, setSelectedId] = useState<string | null>(initialMatrixId ?? null);
  const [columnOffset, setColumnOffset] = useState(0);
  const [rowOffset, setRowOffset] = useState(0);
  const [selectedCoordinate, setSelectedCoordinate] = useState<{
    rowId: string;
    columnId: string;
  } | null>(null);
  const [workId, setWorkId] = useState('');
  const [claimId, setClaimId] = useState('');
  const [dimensionTitle, setDimensionTitle] = useState('');
  const [synthesis, setSynthesis] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const matricesQuery = useQuery({
    queryKey: ['research', 'knowledge', 'matrices', contextId ?? 'all', status],
    queryFn: () =>
      fetchKnowledgeMatrices({
        ...(contextId !== undefined ? { contextId } : {}),
        status,
        limit: 100,
      }),
  });
  const matrices = matricesQuery.data?.matrices ?? [];
  const matrixQuery = useQuery({
    queryKey: ['research', 'knowledge', 'matrix', selectedId],
    queryFn: () => fetchKnowledgeMatrix(selectedId!),
    enabled: selectedId !== null,
  });
  const matrix = matrixQuery.data ?? null;
  const worksQuery = useQuery({
    queryKey: ['research', 'works', 'matrix-picker'],
    queryFn: () => fetchWorks({ status: 'active', limit: 100 }),
  });
  const claimsQuery = useQuery({
    queryKey: ['research', 'knowledge', 'claims', contextId ?? 'all', 'matrix-picker'],
    queryFn: () =>
      fetchKnowledgeClaims({
        ...(contextId !== undefined ? { contextId } : {}),
        status: 'active',
        limit: 100,
      }),
  });
  const works = worksQuery.data?.works ?? [];
  const claims = claimsQuery.data?.claims ?? [];
  const claimStatements = useMemo(
    () => new Map(claims.map((claim) => [claim.id, claim.statement] as const)),
    [claims],
  );
  const visibleColumns = matrix?.columns.slice(columnOffset, columnOffset + WINDOW_SIZE) ?? [];
  const visibleRows = matrix?.rows.slice(rowOffset, rowOffset + ROW_WINDOW_SIZE) ?? [];
  const cellWindowQuery = useQuery({
    queryKey: ['research', 'knowledge', 'matrix-cells', selectedId, columnOffset, rowOffset],
    queryFn: () =>
      fetchMatrixCellWindow(selectedId!, columnOffset, WINDOW_SIZE, rowOffset, ROW_WINDOW_SIZE),
    enabled: selectedId !== null && matrix !== null,
  });
  const cells = cellWindowQuery.data?.cells ?? [];
  const cellByCoordinate = useMemo(
    () => new Map(cells.map((cell) => [`${cell.rowId}:${cell.columnId}`, cell] as const)),
    [cells],
  );
  const selectedCell = selectedCoordinate
    ? (cellByCoordinate.get(`${selectedCoordinate.rowId}:${selectedCoordinate.columnId}`) ?? null)
    : null;
  const selectedRow = selectedCoordinate
    ? (matrix?.rows.find((row) => row.id === selectedCoordinate.rowId) ?? null)
    : null;
  const selectedColumn = selectedCoordinate
    ? (matrix?.columns.find((column) => column.id === selectedCoordinate.columnId) ?? null)
    : null;
  const candidatesQuery = useQuery({
    queryKey: [
      'research',
      'knowledge',
      'matrix-candidates',
      selectedId,
      selectedCoordinate?.rowId,
      selectedCoordinate?.columnId,
    ],
    queryFn: () =>
      fetchMatrixCandidates(selectedId!, selectedCoordinate!.rowId, selectedCoordinate!.columnId),
    enabled: selectedId !== null && selectedCoordinate !== null,
  });
  const candidates = candidatesQuery.data?.candidates ?? [];

  useEffect(() => {
    if (selectedId && matrices.some((item) => item.id === selectedId)) return;
    setSelectedId(matrices[0]?.id ?? null);
  }, [matrices, selectedId]);
  useEffect(() => {
    setColumnOffset(0);
    setRowOffset(0);
    setSelectedCoordinate(null);
  }, [selectedId]);
  useEffect(() => {
    if (!selectedCoordinate) return;
    const key = `${selectedCoordinate.rowId}:${selectedCoordinate.columnId}`;
    const frame = window.requestAnimationFrame(() => {
      const target = Array.from(
        document.querySelectorAll<HTMLButtonElement>('[data-matrix-cell]'),
      ).find((element) => element.dataset.matrixCell === key);
      target?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [cellWindowQuery.data, selectedCoordinate]);
  useEffect(() => {
    setTitle(matrix?.title ?? '');
    setDescription(matrix?.description ?? '');
  }, [matrix?.description, matrix?.id, matrix?.revision, matrix?.title]);
  useEffect(
    () => setSynthesis(selectedCell?.synthesis ?? ''),
    [selectedCell?.id, selectedCell?.revision, selectedCell?.synthesis],
  );
  useEffect(() => {
    const used = new Set(matrix?.columns.map((column) => column.workId) ?? []);
    if (workId && works.some((work) => work.id === workId) && !used.has(workId)) return;
    setWorkId(works.find((work) => !used.has(work.id))?.id ?? '');
  }, [matrix?.columns, workId, works]);
  useEffect(() => {
    const used = new Set(
      matrix?.rows.flatMap((row) => (row.kind === 'claim' ? [row.claimId] : [])) ?? [],
    );
    if (claimId && claims.some((claim) => claim.id === claimId) && !used.has(claimId)) return;
    setClaimId(claims.find((claim) => !used.has(claim.id))?.id ?? '');
  }, [claimId, claims, matrix?.rows]);

  const invalidateMatrix = () => {
    void queryClient.invalidateQueries({ queryKey: ['research', 'knowledge', 'matrix'] });
    void queryClient.invalidateQueries({ queryKey: ['research', 'knowledge', 'matrices'] });
    void queryClient.invalidateQueries({ queryKey: ['research', 'knowledge', 'matrix-cells'] });
    void queryClient.invalidateQueries({
      queryKey: ['research', 'knowledge', 'matrix-candidates'],
    });
  };
  const matrixMutation = useMutation({
    mutationFn: async (action: {
      kind: 'create' | 'update' | 'archive' | 'unarchive' | 'delete' | 'restore';
      matrix?: MatrixDetail;
    }) => {
      if (action.kind === 'create') {
        return postKnowledgeMatrix({
          contextId: contextId ?? null,
          title: '未命名矩阵',
          description: null,
        });
      }
      const item = action.matrix!;
      if (action.kind === 'update') {
        return patchKnowledgeMatrix(item.id, {
          title,
          description: description.trim() || null,
          expectedRevision: item.revision,
        });
      }
      if (action.kind === 'archive' || action.kind === 'unarchive') {
        return patchKnowledgeMatrix(item.id, {
          status: action.kind === 'archive' ? 'archived' : 'active',
          expectedRevision: item.revision,
        });
      }
      if (action.kind === 'delete') return deleteKnowledgeMatrix(item.id, item.revision);
      return postRestoreKnowledgeMatrix(item.id, item.revision);
    },
    onSuccess: (item, action) => {
      setSelectedId(item.id);
      setStatus(item.status);
      onMessage(
        action.kind === 'create'
          ? '矩阵已创建'
          : action.kind === 'delete'
            ? '矩阵已移入回收站'
            : action.kind === 'restore'
              ? '矩阵已恢复'
              : action.kind === 'archive'
                ? '矩阵已归档'
                : action.kind === 'unarchive'
                  ? '矩阵已恢复编辑'
                  : '矩阵说明已保存',
      );
      invalidateMatrix();
    },
    onError: (cause) => onMessage(cause instanceof Error ? cause.message : '矩阵操作失败'),
  });
  const structureMutation = useMutation({
    mutationFn: async (action: {
      kind:
        | 'add-column'
        | 'remove-column'
        | 'move-column'
        | 'add-claim-row'
        | 'add-dimension-row'
        | 'remove-row'
        | 'move-row';
      id?: string;
      direction?: -1 | 1;
    }) => {
      if (!matrix) throw new Error('请先选择矩阵');
      let columns = matrix.columns.map((column) => ({
        id: column.id,
        workId: column.workId,
      }));
      let rows = [...matrix.rows];
      if (action.kind === 'add-column') {
        if (!workId) throw new Error('请选择文献');
        return putKnowledgeMatrixStructure(matrix.id, {
          ...structureInput(matrix, columns, rows),
          columns: [
            ...structureInput(matrix, columns, rows).columns,
            { workId, position: columns.length },
          ],
        });
      }
      if (action.kind === 'remove-column')
        columns = columns.filter((item) => item.id !== action.id);
      if (action.kind === 'move-column') {
        const index = columns.findIndex((item) => item.id === action.id);
        const target = index + (action.direction ?? 0);
        if (index >= 0 && target >= 0 && target < columns.length) {
          [columns[index], columns[target]] = [columns[target]!, columns[index]!];
        }
      }
      if (action.kind === 'add-claim-row') {
        if (!claimId) throw new Error('请选择观点');
        const base = structureInput(matrix, columns, rows);
        return putKnowledgeMatrixStructure(matrix.id, {
          ...base,
          rows: [...base.rows, { kind: 'claim', claimId, position: rows.length }],
        });
      }
      if (action.kind === 'add-dimension-row') {
        if (!dimensionTitle.trim()) throw new Error('请填写比较维度');
        const base = structureInput(matrix, columns, rows);
        return putKnowledgeMatrixStructure(matrix.id, {
          ...base,
          rows: [
            ...base.rows,
            {
              kind: 'dimension',
              title: dimensionTitle.trim(),
              question: null,
              position: rows.length,
            },
          ],
        });
      }
      if (action.kind === 'remove-row') rows = rows.filter((item) => item.id !== action.id);
      if (action.kind === 'move-row') {
        const index = rows.findIndex((item) => item.id === action.id);
        const target = index + (action.direction ?? 0);
        if (index >= 0 && target >= 0 && target < rows.length) {
          [rows[index], rows[target]] = [rows[target]!, rows[index]!];
        }
      }
      return putKnowledgeMatrixStructure(matrix.id, structureInput(matrix, columns, rows));
    },
    onSuccess: (_, action) => {
      if (action.kind === 'add-dimension-row') setDimensionTitle('');
      onMessage('矩阵结构已更新');
      invalidateMatrix();
    },
    onError: (cause) => onMessage(cause instanceof Error ? cause.message : '矩阵结构更新失败'),
  });
  const cellMutation = useMutation({
    mutationFn: async (action: { kind: 'save' | 'review'; cell?: MatrixCell }) => {
      if (!matrix || !selectedCoordinate) throw new Error('请选择单元格');
      if (action.kind === 'review')
        return postReviewMatrixCell(action.cell!.id, action.cell!.revision);
      if (action.cell) {
        return patchMatrixCell(action.cell.id, {
          synthesis,
          expectedRevision: action.cell.revision,
        });
      }
      return postMatrixCell(matrix.id, { ...selectedCoordinate, synthesis });
    },
    onSuccess: (_, action) => {
      onMessage(action.kind === 'review' ? '单元格已复核' : '单元格综合已保存');
      invalidateMatrix();
    },
    onError: (cause) => onMessage(cause instanceof Error ? cause.message : '单元格操作失败'),
  });
  const evidenceMutation = useMutation({
    mutationFn: async (action: {
      evidenceId: string;
      linkId: string | null;
      linkRevision: number | null;
    }) => {
      if (!selectedCell) throw new Error('请先保存单元格');
      return action.linkId
        ? deleteMatrixCellEvidence(action.linkId, action.linkRevision!)
        : postMatrixCellEvidence(selectedCell.id, { evidenceId: action.evidenceId });
    },
    onSuccess: () => {
      onMessage('单元格证据已更新');
      invalidateMatrix();
    },
    onError: (cause) => onMessage(cause instanceof Error ? cause.message : '证据选择失败'),
  });
  const busy =
    matrixMutation.isPending ||
    structureMutation.isPending ||
    cellMutation.isPending ||
    evidenceMutation.isPending;
  const canWrite = matrix?.status === 'active' && !contextArchived;
  const titleDirty =
    matrix !== null && (title !== matrix.title || description !== (matrix.description ?? ''));

  const selectCell = (rowId: string, columnId: string) => {
    setSelectedCoordinate({ rowId, columnId });
  };
  const moveCellSelection = (
    event: KeyboardEvent<HTMLButtonElement>,
    rowIndex: number,
    columnIndex: number,
  ) => {
    if (!matrix || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const nextRowIndex = Math.max(
      0,
      Math.min(
        matrix.rows.length - 1,
        rowIndex + (event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0),
      ),
    );
    const nextColumnIndex = Math.max(
      0,
      Math.min(
        matrix.columns.length - 1,
        columnIndex + (event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0),
      ),
    );
    const row = matrix.rows[nextRowIndex];
    const column = matrix.columns[nextColumnIndex];
    if (!row || !column) return;
    setColumnOffset(Math.floor(nextColumnIndex / WINDOW_SIZE) * WINDOW_SIZE);
    setRowOffset(Math.floor(nextRowIndex / ROW_WINDOW_SIZE) * ROW_WINDOW_SIZE);
    setSelectedCoordinate({ rowId: row.id, columnId: column.id });
  };

  return (
    <section className="relative grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[15rem_minmax(0,1fr)_22rem]">
      <aside className="hidden min-h-0 flex-col border-r border-line lg:flex">
        <div className="shrink-0 border-b border-line p-3">
          <div className="flex gap-1">
            {(['active', 'archived', 'deleted'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatus(value)}
                className={`px-2 py-1 text-[10px] font-semibold ${status === value ? 'bg-surface-2 text-ink' : 'text-muted'}`}
              >
                {statusLabels[value]}
              </button>
            ))}
          </div>
          {status === 'active' && !contextArchived && (
            <Button
              className="mt-3 w-full"
              size="sm"
              icon={<IconPlus size={12} />}
              disabled={busy}
              onClick={() => matrixMutation.mutate({ kind: 'create' })}
            >
              新建矩阵
            </Button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {matrices.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedId(item.id)}
              className={`block w-full border-b border-line px-4 py-3 text-left ${selectedId === item.id ? 'bg-surface-2' : 'hover:bg-surface-2/60'}`}
            >
              <span className="line-clamp-2 text-xs font-semibold leading-5 text-ink">
                {item.title}
              </span>
              <span className="mt-1 block text-[10px] text-muted">
                结构 v{item.structureRevision} · 内容 v{item.revision}
              </span>
            </button>
          ))}
        </div>
      </aside>

      <main className="flex min-h-0 flex-col border-r border-line">
        <header className="shrink-0 border-b border-line px-3 py-3 sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-2 lg:hidden">
            <select
              aria-label="矩阵状态"
              value={status}
              onChange={(event) => setStatus(event.target.value as MatrixStatus)}
              className="border border-line bg-surface px-2 py-2 text-xs text-ink"
            >
              {(['active', 'archived', 'deleted'] as const).map((value) => (
                <option key={value} value={value}>
                  {statusLabels[value]}
                </option>
              ))}
            </select>
            <select
              value={selectedId ?? ''}
              onChange={(event) => setSelectedId(event.target.value || null)}
              className="min-w-0 flex-1 border border-line bg-surface px-2 py-2 text-xs text-ink"
            >
              <option value="">选择矩阵</option>
              {matrices.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
            {status === 'active' && !contextArchived && (
              <Button size="sm" onClick={() => matrixMutation.mutate({ kind: 'create' })}>
                新建
              </Button>
            )}
          </div>
          {matrix && (
            <div className="mt-3 grid gap-2 lg:mt-0 lg:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_auto]">
              <input
                value={title}
                disabled={!canWrite}
                onChange={(event) => setTitle(event.target.value)}
                className="border border-line bg-surface px-2.5 py-2 text-xs font-semibold text-ink outline-none focus:border-accent"
              />
              <input
                value={description}
                disabled={!canWrite}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="矩阵说明"
                className="border border-line bg-surface px-2.5 py-2 text-xs text-ink outline-none focus:border-accent"
              />
              <Button
                size="sm"
                disabled={busy || !titleDirty || !title.trim()}
                onClick={() => matrixMutation.mutate({ kind: 'update', matrix })}
              >
                保存说明
              </Button>
            </div>
          )}
          {matrix && (
            <div className="mt-2 flex flex-wrap justify-end gap-2">
              {matrix.status === 'active' && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || contextArchived}
                  onClick={() => matrixMutation.mutate({ kind: 'archive', matrix })}
                >
                  归档
                </Button>
              )}
              {matrix.status === 'archived' && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || contextArchived}
                  onClick={() => matrixMutation.mutate({ kind: 'unarchive', matrix })}
                >
                  恢复编辑
                </Button>
              )}
              {matrix.status !== 'deleted' ? (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy || contextArchived}
                  onClick={() => matrixMutation.mutate({ kind: 'delete', matrix })}
                >
                  移入回收站
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={busy || contextArchived}
                  onClick={() => matrixMutation.mutate({ kind: 'restore', matrix })}
                >
                  恢复
                </Button>
              )}
            </div>
          )}
        </header>

        {!matrix ? (
          <div className="grid flex-1 place-items-center px-6 text-center text-xs text-muted">
            选择或新建一个跨论文矩阵。
          </div>
        ) : (
          <>
            {canWrite && (
              <div className="grid shrink-0 gap-2 border-b border-line p-3 xl:grid-cols-2">
                <div className="flex min-w-0 gap-2">
                  <select
                    value={workId}
                    onChange={(event) => setWorkId(event.target.value)}
                    className="min-w-0 flex-1 border border-line bg-surface px-2 py-1.5 text-xs text-ink"
                  >
                    <option value="">选择文献列</option>
                    {works
                      .filter((work) => !matrix.columns.some((column) => column.workId === work.id))
                      .map((work) => (
                        <option key={work.id} value={work.id}>
                          {work.title}
                        </option>
                      ))}
                  </select>
                  <Button
                    size="sm"
                    disabled={busy || !workId || matrix.columns.length >= 200}
                    onClick={() => structureMutation.mutate({ kind: 'add-column' })}
                  >
                    加列
                  </Button>
                </div>
                <div className="flex min-w-0 gap-2">
                  <select
                    value={claimId}
                    onChange={(event) => setClaimId(event.target.value)}
                    className="min-w-0 flex-1 border border-line bg-surface px-2 py-1.5 text-xs text-ink"
                  >
                    <option value="">选择观点行</option>
                    {claims
                      .filter(
                        (claim) =>
                          !matrix.rows.some(
                            (row) => row.kind === 'claim' && row.claimId === claim.id,
                          ),
                      )
                      .map((claim) => (
                        <option key={claim.id} value={claim.id}>
                          {claim.statement}
                        </option>
                      ))}
                  </select>
                  <Button
                    size="sm"
                    disabled={busy || !claimId || matrix.rows.length >= 50}
                    onClick={() => structureMutation.mutate({ kind: 'add-claim-row' })}
                  >
                    加观点
                  </Button>
                </div>
                <div className="flex min-w-0 gap-2 xl:col-span-2">
                  <input
                    value={dimensionTitle}
                    onChange={(event) => setDimensionTitle(event.target.value)}
                    placeholder="比较维度，例如样本、方法或限制"
                    className="min-w-0 flex-1 border border-line bg-surface px-2 py-1.5 text-xs text-ink"
                  />
                  <Button
                    size="sm"
                    disabled={busy || !dimensionTitle.trim() || matrix.rows.length >= 50}
                    onClick={() => structureMutation.mutate({ kind: 'add-dimension-row' })}
                  >
                    加维度
                  </Button>
                </div>
              </div>
            )}

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2 text-[10px] text-muted">
              <span>
                {matrix.columns.length} 篇文献 × {matrix.rows.length} 行
              </span>
              <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                <div className="flex items-center gap-1">
                  <span>文献</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={columnOffset === 0}
                    onClick={() => setColumnOffset(Math.max(0, columnOffset - WINDOW_SIZE))}
                  >
                    上一组
                  </Button>
                  <span>
                    {matrix.columns.length === 0 ? 0 : columnOffset + 1}–
                    {Math.min(matrix.columns.length, columnOffset + WINDOW_SIZE)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={columnOffset + WINDOW_SIZE >= matrix.columns.length}
                    onClick={() => setColumnOffset(columnOffset + WINDOW_SIZE)}
                  >
                    下一组
                  </Button>
                </div>
                <div className="flex items-center gap-1">
                  <span>行</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={rowOffset === 0}
                    onClick={() => setRowOffset(Math.max(0, rowOffset - ROW_WINDOW_SIZE))}
                  >
                    上一组
                  </Button>
                  <span>
                    {matrix.rows.length === 0 ? 0 : rowOffset + 1}–
                    {Math.min(matrix.rows.length, rowOffset + ROW_WINDOW_SIZE)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={rowOffset + ROW_WINDOW_SIZE >= matrix.rows.length}
                    onClick={() => setRowOffset(rowOffset + ROW_WINDOW_SIZE)}
                  >
                    下一组
                  </Button>
                </div>
              </div>
            </div>

            <div className="hidden min-h-0 flex-1 overflow-auto md:block">
              <table className="min-w-max border-separate border-spacing-0 text-left text-xs">
                <thead className="sticky top-0 z-20 bg-surface">
                  <tr>
                    <th className="sticky left-0 z-30 w-56 min-w-56 border-b border-r border-line bg-surface px-3 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                      行 / 文献
                    </th>
                    {visibleColumns.map((column, index) => (
                      <th
                        key={column.id}
                        className="w-52 min-w-52 border-b border-r border-line bg-surface px-3 py-3 align-top"
                      >
                        <p className="line-clamp-2 text-xs font-semibold leading-5 text-ink">
                          {column.workTitle}
                        </p>
                        {canWrite && (
                          <div className="mt-2 flex gap-1">
                            <button
                              type="button"
                              disabled={column.position === 0}
                              onClick={() =>
                                structureMutation.mutate({
                                  kind: 'move-column',
                                  id: column.id,
                                  direction: -1,
                                })
                              }
                              className="text-[10px] text-muted hover:text-ink"
                            >
                              ←
                            </button>
                            <button
                              type="button"
                              disabled={column.position === matrix.columns.length - 1}
                              onClick={() =>
                                structureMutation.mutate({
                                  kind: 'move-column',
                                  id: column.id,
                                  direction: 1,
                                })
                              }
                              className="text-[10px] text-muted hover:text-ink"
                            >
                              →
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                structureMutation.mutate({ kind: 'remove-column', id: column.id })
                              }
                              className="ml-auto text-[10px] text-critical"
                            >
                              移除
                            </button>
                          </div>
                        )}
                        <span className="sr-only">窗口列 {index + 1}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.id}>
                      <th className="sticky left-0 z-10 w-56 min-w-56 border-b border-r border-line bg-surface px-3 py-3 align-top">
                        <p className="line-clamp-4 text-xs font-semibold leading-5 text-ink">
                          {rowLabel(row, claimStatements)}
                        </p>
                        <p className="mt-1 text-[10px] text-muted">
                          {row.kind === 'claim' ? '观点' : '比较维度'}
                        </p>
                        {canWrite && (
                          <div className="mt-2 flex gap-2 text-[10px]">
                            <button
                              type="button"
                              disabled={row.position === 0}
                              onClick={() =>
                                structureMutation.mutate({
                                  kind: 'move-row',
                                  id: row.id,
                                  direction: -1,
                                })
                              }
                              className="text-muted hover:text-ink"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              disabled={row.position === matrix.rows.length - 1}
                              onClick={() =>
                                structureMutation.mutate({
                                  kind: 'move-row',
                                  id: row.id,
                                  direction: 1,
                                })
                              }
                              className="text-muted hover:text-ink"
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                structureMutation.mutate({ kind: 'remove-row', id: row.id })
                              }
                              className="ml-auto text-critical"
                            >
                              移除
                            </button>
                          </div>
                        )}
                      </th>
                      {visibleColumns.map((column) => {
                        const cell = cellByCoordinate.get(`${row.id}:${column.id}`) ?? null;
                        const selected =
                          selectedCoordinate?.rowId === row.id &&
                          selectedCoordinate.columnId === column.id;
                        return (
                          <td
                            key={column.id}
                            className={`h-28 border-b border-r border-line align-top ${selected ? 'bg-surface-2' : ''}`}
                          >
                            <button
                              type="button"
                              data-matrix-cell={`${row.id}:${column.id}`}
                              onClick={() => selectCell(row.id, column.id)}
                              onKeyDown={(event) =>
                                moveCellSelection(
                                  event,
                                  row.position,
                                  columnOffset + visibleColumns.indexOf(column),
                                )
                              }
                              className="h-full w-full px-3 py-3 text-left hover:bg-surface-2/60"
                            >
                              <p className="line-clamp-3 text-xs leading-5 text-secondary">
                                {cell?.synthesis || '填写综合说明'}
                              </p>
                              {cell && (
                                <span
                                  className={`mt-2 inline-block text-[10px] font-semibold ${cell.reviewState === 'needs-review' ? 'text-warning' : 'text-muted'}`}
                                >
                                  {cell.reviewState === 'needs-review'
                                    ? '需要复核'
                                    : `${cell.selectedEvidenceCount} 条证据`}
                                </span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto md:hidden">
              {visibleRows.map((row) => (
                <section key={row.id} className="border-b border-line">
                  <header className="sticky top-0 z-10 bg-surface px-4 py-3">
                    <p className="text-xs font-semibold leading-5 text-ink">
                      {rowLabel(row, claimStatements)}
                    </p>
                    <p className="mt-1 text-[10px] text-muted">
                      {row.kind === 'claim' ? '观点行' : '比较维度'}
                    </p>
                  </header>
                  {visibleColumns.map((column) => {
                    const cell = cellByCoordinate.get(`${row.id}:${column.id}`) ?? null;
                    return (
                      <button
                        key={column.id}
                        type="button"
                        onClick={() => selectCell(row.id, column.id)}
                        className="block w-full border-t border-line px-4 py-3 text-left hover:bg-surface-2"
                      >
                        <span className="block text-[10px] font-semibold text-muted">
                          {column.workTitle}
                        </span>
                        <span className="mt-1 line-clamp-3 block text-xs leading-5 text-secondary">
                          {cell?.synthesis || '填写综合说明'}
                        </span>
                        {cell?.reviewState === 'needs-review' && (
                          <span className="mt-1 block text-[10px] font-semibold text-warning">
                            需要复核
                          </span>
                        )}
                      </button>
                    );
                  })}
                </section>
              ))}
            </div>
          </>
        )}
      </main>

      <aside
        className={`${selectedCoordinate ? 'absolute inset-0 z-30 flex' : 'hidden'} min-h-0 flex-col bg-surface lg:static lg:z-auto lg:flex`}
      >
        {!selectedCoordinate || !selectedRow || !selectedColumn ? (
          <div className="grid h-full place-items-center px-6 text-center text-xs leading-5 text-muted">
            选择一个行列交点，填写综合并选择证据。
          </div>
        ) : (
          <>
            <header className="shrink-0 border-b border-line px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                  单元格
                </p>
                <button
                  type="button"
                  onClick={() => setSelectedCoordinate(null)}
                  className="text-xs font-semibold text-secondary lg:hidden"
                >
                  返回矩阵
                </button>
              </div>
              <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-ink">
                {rowLabel(selectedRow, claimStatements)}
              </p>
              <p className="mt-1 text-[10px] text-muted">{selectedColumn.workTitle}</p>
              {selectedCell && (
                <p
                  className={`mt-2 text-[10px] font-semibold ${selectedCell.reviewState === 'needs-review' ? 'text-warning' : 'text-accent'}`}
                >
                  {selectedCell.reviewState === 'needs-review' ? '需要复核' : '已复核当前来源'}
                </p>
              )}
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                人工综合
                <textarea
                  value={synthesis}
                  disabled={!canWrite}
                  onChange={(event) => setSynthesis(event.target.value)}
                  rows={6}
                  className="mt-2 w-full resize-y border border-line bg-surface px-3 py-2 text-sm normal-case leading-6 tracking-normal text-ink outline-none focus:border-accent"
                />
              </label>
              {canWrite && (
                <Button
                  className="mt-3 w-full"
                  variant="primary"
                  disabled={busy || (selectedCell !== null && synthesis === selectedCell.synthesis)}
                  onClick={() =>
                    cellMutation.mutate({ kind: 'save', cell: selectedCell ?? undefined })
                  }
                >
                  {selectedCell ? '保存综合' : '创建单元格'}
                </Button>
              )}
              <div className="mt-5 border-t border-line pt-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                  候选证据
                </p>
                <div className="mt-2 space-y-2">
                  {candidates.map(({ evidence, selectedLinkId, selectedLinkRevision }) => (
                    <article key={evidence.id} className="border border-line p-3">
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={selectedLinkId !== null}
                          disabled={!canWrite || !selectedCell || busy}
                          onChange={() =>
                            evidenceMutation.mutate({
                              evidenceId: evidence.id,
                              linkId: selectedLinkId,
                              linkRevision: selectedLinkRevision,
                            })
                          }
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-xs font-semibold text-ink">
                              {evidence.title || evidence.sourceSnapshot.workTitle}
                            </p>
                            <SourceStatus state={evidence.sourceState} compact />
                          </div>
                          <p className="mt-1 line-clamp-3 text-[10px] leading-4 text-secondary">
                            {evidence.summary ||
                              evidence.sourceSnapshot.anchor.textQuote?.exact ||
                              '区域证据'}
                          </p>
                          <a
                            href={sourceUrl(evidence)}
                            className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-accent hover:underline"
                          >
                            回到原文 <IconExternalLink size={10} />
                          </a>
                        </div>
                      </div>
                    </article>
                  ))}
                  {!candidatesQuery.isLoading && candidates.length === 0 && (
                    <p className="py-6 text-center text-xs text-muted">当前行列没有候选证据。</p>
                  )}
                </div>
              </div>
              {selectedCell && canWrite && (
                <Button
                  className="mt-4 w-full"
                  disabled={busy}
                  onClick={() => cellMutation.mutate({ kind: 'review', cell: selectedCell })}
                >
                  确认已复核
                </Button>
              )}
            </div>
          </>
        )}
      </aside>
    </section>
  );
}
