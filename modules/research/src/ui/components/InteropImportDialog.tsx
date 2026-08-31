import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Chip,
  IconAlertCircle,
  IconCheck,
  IconDatabase,
  IconUpload,
  Modal,
  ProgressBar,
  controlClass,
} from '@workbench/ui';
import { WORK_TYPES, type InteropAttachmentCandidate, type InteropFormat } from '../../contract.js';
import {
  fetchInteropImport,
  fetchInteropImportRecords,
  fetchWork,
  postCancelInteropImport,
  postCommitInteropImport,
  postCreateInteropImport,
  postPickInteropSource,
  postStartInteropImport,
  putInteropRecordDecision,
  type InteropCommitResult,
  type InteropImportJob,
  type InteropRecord,
  type InteropRecordsPage,
  type WorkDetail,
} from '../api.js';
import { InteropReviewTable } from './InteropReviewTable.js';

type DecisionAction =
  'accept' | 'skip' | 'match-existing' | 'create-new-edition' | 'suggestions-only';

function attachmentsOf(record: InteropRecord | null): InteropAttachmentCandidate[] {
  const shadow = record?.formatShadow;
  if (!shadow || typeof shadow !== 'object' || Array.isArray(shadow)) return [];
  const candidates = (shadow as { attachmentCandidates?: unknown }).attachmentCandidates;
  return Array.isArray(candidates) ? (candidates as InteropAttachmentCandidate[]) : [];
}

function duplicateCandidatesOf(record: InteropRecord | null) {
  const shadow = record?.formatShadow;
  if (!shadow || typeof shadow !== 'object' || Array.isArray(shadow)) return [];
  const candidates = (shadow as { duplicateCandidates?: unknown }).duplicateCandidates;
  return Array.isArray(candidates)
    ? (candidates as Array<{ workId: string; editionId: string }>)
    : [];
}

function formatLabel(format: InteropFormat) {
  return format === 'bibtex' ? 'BibTeX' : format === 'ris' ? 'RIS' : 'CSL JSON';
}

export function InteropImportDialog({
  open,
  onClose,
  onCommitted,
}: {
  open: boolean;
  onClose: () => void;
  onCommitted: () => void;
}) {
  const [format, setFormat] = useState<InteropFormat>('bibtex');
  const [job, setJob] = useState<InteropImportJob | null>(null);
  const [page, setPage] = useState<InteropRecordsPage | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [action, setAction] = useState<DecisionAction>('accept');
  const [targetWorkId, setTargetWorkId] = useState<string | null>(null);
  const [targetEditionId, setTargetEditionId] = useState<string | null>(null);
  const [currentWork, setCurrentWork] = useState<WorkDetail | null>(null);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<(typeof WORK_TYPES)[number]>('unknown');
  const [attachmentActions, setAttachmentActions] = useState<
    Record<string, 'ignore' | 'managed' | 'linked'>
  >({});
  const [result, setResult] = useState<InteropCommitResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => page?.items.find((record) => record.id === selectedId) ?? null,
    [page, selectedId],
  );
  const candidates = useMemo(() => duplicateCandidatesOf(selected), [selected]);
  const attachments = useMemo(() => attachmentsOf(selected), [selected]);

  useEffect(() => {
    if (open) return;
    setJob(null);
    setPage(null);
    setSelectedId(null);
    setResult(null);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!job || !['parsing', 'committing'].includes(job.status)) return;
    const timer = window.setInterval(() => {
      void fetchInteropImport(job.id)
        .then((next) => {
          setJob(next);
          if (next.status === 'awaiting-review') {
            return fetchInteropImportRecords(next.id, { offset: 0, limit: 50 }).then((records) => {
              setPage(records);
              setSelectedId(records.items[0]?.id ?? null);
            });
          }
          return undefined;
        })
        .catch((cause) => setError(cause instanceof Error ? cause.message : '任务状态读取失败'));
    }, 500);
    return () => window.clearInterval(timer);
  }, [job]);

  useEffect(() => {
    if (!selected) return;
    setTitle(selected.mapped?.title ?? '');
    setType(selected.mapped?.type ?? 'unknown');
    const duplicate = duplicateCandidatesOf(selected)[0];
    setAction(selected.status === 'invalid' ? 'skip' : 'accept');
    setTargetWorkId(null);
    setTargetEditionId(null);
    setCurrentWork(null);
    setAttachmentActions(
      Object.fromEntries(attachmentsOf(selected).map((candidate) => [candidate.id, 'ignore'])),
    );
    if (duplicate) {
      setTargetWorkId(duplicate.workId);
      setTargetEditionId(duplicate.editionId);
    }
  }, [selected]);

  useEffect(() => {
    if (!targetWorkId || action === 'accept' || action === 'skip') {
      setCurrentWork(null);
      return;
    }
    void fetchWork(targetWorkId)
      .then(setCurrentWork)
      .catch(() => setCurrentWork(null));
  }, [action, targetWorkId]);

  const loadPage = async (offset: number) => {
    if (!job) return;
    const records = await fetchInteropImportRecords(job.id, { offset, limit: 50 });
    setPage(records);
    setSelectedId(records.items[0]?.id ?? null);
  };

  const begin = async () => {
    setBusy(true);
    setError(null);
    try {
      const picked = await postPickInteropSource(format);
      if (!picked.source) return;
      const created = await postCreateInteropImport({
        requestId: crypto.randomUUID(),
        sourcePath: picked.source.path,
        displayName: picked.source.displayName,
        format: picked.source.inferredFormat,
      });
      setJob(await postStartInteropImport(created.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '文献数据导入失败');
    } finally {
      setBusy(false);
    }
  };

  const saveRecord = async () => {
    if (!job || !selected) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await putInteropRecordDecision(job.id, selected.id, {
        expectedRevision: selected.revision,
        decision: {
          action,
          workId: targetWorkId,
          editionId: targetEditionId,
          fieldSuggestions:
            action === 'skip' || !selected.mapped
              ? []
              : [
                  {
                    field: 'title',
                    currentValue: currentWork?.work.title ?? null,
                    sourceValue: selected.mapped.title,
                    selectedValue: title,
                    selection: title === selected.mapped.title ? 'source' : 'custom',
                    userConfirmed: true,
                    conflict:
                      currentWork !== null && currentWork.work.title !== selected.mapped.title,
                  },
                  {
                    field: 'type',
                    currentValue: currentWork?.work.type ?? null,
                    sourceValue: selected.mapped.type,
                    selectedValue: type,
                    selection: type === selected.mapped.type ? 'source' : 'custom',
                    userConfirmed: true,
                    conflict:
                      currentWork !== null && currentWork.work.type !== selected.mapped.type,
                  },
                ],
          attachmentCandidates: attachments.map((candidate) => ({
            ...candidate,
            action: attachmentActions[candidate.id] ?? 'ignore',
          })),
        },
      });
      setPage((current) =>
        current
          ? {
              ...current,
              items: current.items.map((record) => (record.id === saved.id ? saved : record)),
            }
          : current,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '记录决定保存失败');
    } finally {
      setBusy(false);
    }
  };

  const acceptPage = async () => {
    if (!job || !page) return;
    setBusy(true);
    setError(null);
    try {
      for (const record of page.items) {
        if (!['valid', 'needs-review'].includes(record.status) || attachmentsOf(record).length > 0)
          continue;
        await putInteropRecordDecision(job.id, record.id, {
          expectedRevision: record.revision,
          decision: {
            action: 'accept',
            workId: null,
            editionId: null,
            fieldSuggestions: [],
            attachmentCandidates: [],
          },
        });
      }
      await loadPage(page.offset);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '本页批量接受失败');
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!job) return;
    setBusy(true);
    setError(null);
    try {
      const latest = await fetchInteropImport(job.id);
      const committed = await postCommitInteropImport(job.id, latest.revision);
      setJob(await fetchInteropImport(job.id));
      setResult(committed);
      onCommitted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '提交失败');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!job) return;
    setBusy(true);
    try {
      setJob(await postCancelInteropImport(job.id));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="导入文献数据"
      description="解析 BibTeX、RIS 或 CSL JSON，逐条确认后写入文献库。"
      maxWidth="max-w-[min(96vw,1380px)]"
    >
      {!job ? (
        <div className="grid min-h-[360px] place-items-center border-y border-line py-10">
          <div className="w-full max-w-xl">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent">
                <IconDatabase size={20} />
              </span>
              <div>
                <h4 className="text-base font-semibold text-ink">选择交换格式</h4>
                <p className="mt-0.5 text-xs text-secondary">
                  原始记录和未知字段会保留供审查与往返。
                </p>
              </div>
            </div>
            <div className="mt-8 grid grid-cols-3 border-y border-line">
              {(['bibtex', 'ris', 'csl-json'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFormat(value)}
                  className={`border-r border-line px-3 py-5 text-sm font-semibold transition last:border-r-0 ${
                    format === value
                      ? 'bg-accent-soft text-accent'
                      : 'text-secondary hover:bg-surface-2'
                  }`}
                >
                  {formatLabel(value)}
                </button>
              ))}
            </div>
            <Button
              className="mt-8 w-full"
              variant="primary"
              size="lg"
              icon={<IconUpload size={15} />}
              disabled={busy}
              onClick={begin}
            >
              选择 {formatLabel(format)} 文件
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex h-[min(76vh,780px)] min-h-[560px] flex-col overflow-hidden border-y border-line">
          <div className="shrink-0 border-b border-line px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{job.source.displayName}</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {formatLabel(job.source.format)} · {job.source.byteSize.toLocaleString()} bytes ·{' '}
                  {job.status}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {job.status === 'parsing' && (
                  <Button disabled={busy} onClick={cancel}>
                    取消
                  </Button>
                )}
                {job.status === 'awaiting-review' && (
                  <>
                    <Button disabled={busy} onClick={acceptPage}>
                      接受本页无附件记录
                    </Button>
                    <Button variant="primary" disabled={busy} onClick={commit}>
                      提交已决定记录
                    </Button>
                  </>
                )}
              </div>
            </div>
            {job.status === 'parsing' && (
              <ProgressBar
                className="mt-3"
                size="sm"
                value={job.summary.processed}
                max={Math.max(job.summary.total, 1)}
              />
            )}
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-secondary">
              <span>总计 {job.summary.total}</span>
              <span className="text-good">有效 {job.summary.valid}</span>
              <span className="text-warning">待审查 {job.summary.needsReview}</span>
              <span className="text-critical">无效 {job.summary.invalid}</span>
              <span>已接受 {job.summary.accepted}</span>
              <span>已跳过 {job.summary.skipped}</span>
            </div>
          </div>

          {result ? (
            <div className="grid min-h-0 flex-1 place-items-center px-6 py-10">
              <div className="max-w-lg text-center animate-scale-in">
                <span className="mx-auto grid size-12 place-items-center rounded-full bg-good-soft text-good">
                  <IconCheck size={22} />
                </span>
                <h4 className="mt-4 text-lg font-semibold text-ink">导入完成</h4>
                <p className="mt-2 text-sm leading-6 text-secondary">
                  新建 {result.created} 条，新版本 {result.newEdition} 条，匹配 {result.matched}{' '}
                  条，跳过 {result.skipped} 条。
                </p>
                {result.attachments.some((item) => item.status === 'failed') && (
                  <p className="mt-2 text-xs text-critical">
                    {result.attachments.filter((item) => item.status === 'failed').length}{' '}
                    个附件处理失败
                  </p>
                )}
                <Button className="mt-6" variant="primary" onClick={onClose}>
                  返回文献库
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(280px,0.8fr)_minmax(520px,1.5fr)]">
              <div className="flex min-h-0 max-h-[220px] flex-col border-b border-line lg:max-h-none lg:border-b-0 lg:border-r">
                <InteropReviewTable
                  page={page}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onPage={(offset) => void loadPage(offset)}
                />
              </div>
              <div className="min-h-0 overflow-y-auto px-5 py-4">
                {!selected ? (
                  <p className="py-12 text-center text-xs text-muted">选择一条记录开始审查</p>
                ) : (
                  <div className="animate-fade-in">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                          记录 {selected.ordinal + 1}
                        </p>
                        <h4 className="mt-1 text-base font-semibold text-ink">
                          {selected.mapped?.title || selected.sourceKey || '无法识别的记录'}
                        </h4>
                      </div>
                      <Chip tone={selected.status === 'invalid' ? 'critical' : 'neutral'}>
                        revision {selected.revision}
                      </Chip>
                    </div>

                    {selected.diagnostics.length > 0 && (
                      <div className="mt-4 border-y border-line py-3">
                        {selected.diagnostics.map((diagnostic, index) => (
                          <p
                            key={`${diagnostic.code}-${index}`}
                            className={`flex gap-2 py-1 text-xs ${
                              diagnostic.severity === 'error'
                                ? 'text-critical'
                                : diagnostic.severity === 'warning'
                                  ? 'text-warning'
                                  : 'text-secondary'
                            }`}
                          >
                            <IconAlertCircle size={13} className="mt-0.5 shrink-0" />
                            {diagnostic.message}
                          </p>
                        ))}
                      </div>
                    )}

                    {candidates.length > 0 && selected.status !== 'invalid' && (
                      <div className="mt-5">
                        <p className="text-xs font-semibold text-ink">重复候选</p>
                        <div className="mt-2 divide-y divide-line border-y border-line">
                          {candidates.map((candidate) => (
                            <div
                              key={`${candidate.workId}:${candidate.editionId}`}
                              className="py-3"
                            >
                              <p className="font-mono text-[11px] text-muted">{candidate.workId}</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setAction('match-existing');
                                    setTargetWorkId(candidate.workId);
                                    setTargetEditionId(candidate.editionId);
                                  }}
                                >
                                  匹配现有版本
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setAction('create-new-edition');
                                    setTargetWorkId(candidate.workId);
                                    setTargetEditionId(null);
                                  }}
                                >
                                  作为新版本
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setAction('suggestions-only');
                                    setTargetWorkId(candidate.workId);
                                    setTargetEditionId(candidate.editionId);
                                  }}
                                >
                                  仅保存建议
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selected.status !== 'invalid' && selected.mapped && (
                      <div className="mt-5 overflow-x-auto">
                        <div className="grid min-w-[640px] grid-cols-[120px_1fr_1fr_1fr] border-y border-line text-xs">
                          <div className="px-3 py-2 font-semibold text-muted">字段</div>
                          <div className="border-l border-line px-3 py-2 font-semibold text-muted">
                            当前值
                          </div>
                          <div className="border-l border-line px-3 py-2 font-semibold text-muted">
                            来源值
                          </div>
                          <div className="border-l border-line px-3 py-2 font-semibold text-muted">
                            最终值
                          </div>
                          <div className="border-t border-line px-3 py-3 font-semibold text-ink">
                            标题
                          </div>
                          <div className="border-l border-t border-line px-3 py-3 text-secondary">
                            {currentWork?.work.title ?? '新建记录'}
                          </div>
                          <div className="border-l border-t border-line px-3 py-3 text-secondary">
                            {selected.mapped.title || '—'}
                          </div>
                          <div className="border-l border-t border-line p-2">
                            <input
                              className={controlClass}
                              value={title}
                              onChange={(event) => setTitle(event.target.value)}
                            />
                          </div>
                          <div className="border-t border-line px-3 py-3 font-semibold text-ink">
                            类型
                          </div>
                          <div className="border-l border-t border-line px-3 py-3 text-secondary">
                            {currentWork?.work.type ?? '新建记录'}
                          </div>
                          <div className="border-l border-t border-line px-3 py-3 text-secondary">
                            {selected.mapped.type}
                          </div>
                          <div className="border-l border-t border-line p-2">
                            <select
                              className={controlClass}
                              value={type}
                              onChange={(event) =>
                                setType(event.target.value as (typeof WORK_TYPES)[number])
                              }
                            >
                              {WORK_TYPES.map((value) => (
                                <option key={value}>{value}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    )}

                    {attachments.length > 0 && (
                      <div className="mt-5">
                        <p className="text-xs font-semibold text-ink">附件候选</p>
                        <div className="mt-2 divide-y divide-line border-y border-line">
                          {attachments.map((candidate) => (
                            <div
                              key={candidate.id}
                              className="flex items-center justify-between gap-3 py-3"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-xs font-medium text-ink">
                                  {candidate.displayName}
                                </p>
                                <p className="mt-0.5 truncate text-[11px] text-muted">
                                  {candidate.resolvedPath ?? candidate.sourceValue}
                                </p>
                              </div>
                              <select
                                className={`${controlClass} w-28 shrink-0`}
                                value={attachmentActions[candidate.id] ?? 'ignore'}
                                onChange={(event) =>
                                  setAttachmentActions((values) => ({
                                    ...values,
                                    [candidate.id]: event.target.value as
                                      'ignore' | 'managed' | 'linked',
                                  }))
                                }
                              >
                                <option value="ignore">忽略</option>
                                <option value="managed" disabled={candidate.exists === false}>
                                  托管
                                </option>
                                <option value="linked" disabled={candidate.exists === false}>
                                  链接
                                </option>
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <details className="mt-5 border-y border-line py-3 text-xs text-secondary">
                      <summary className="cursor-pointer font-semibold text-ink">
                        查看来源原文
                      </summary>
                      <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-5">
                        {selected.rawRecord}
                      </pre>
                    </details>

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={action === 'accept' ? 'secondary' : 'ghost'}
                          disabled={selected.status === 'invalid'}
                          onClick={() => setAction('accept')}
                        >
                          新建记录
                        </Button>
                        <Button
                          size="sm"
                          variant={action === 'skip' ? 'secondary' : 'ghost'}
                          onClick={() => setAction('skip')}
                        >
                          跳过
                        </Button>
                      </div>
                      <Button variant="primary" disabled={busy} onClick={saveRecord}>
                        保存决定
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {error && <p className="mt-3 text-xs text-critical">{error}</p>}
    </Modal>
  );
}
