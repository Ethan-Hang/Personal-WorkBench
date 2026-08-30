import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  IconAlertCircle,
  IconCheck,
  IconExternalLink,
  IconPlus,
  IconX,
} from '@workbench/ui';
import type {
  Claim,
  ClaimEditableStatus,
  ClaimEvidence,
  ClaimEvidenceRelation,
  ClaimStatus,
  Evidence,
} from '../../contract.js';
import {
  deleteClaimEvidence,
  deleteKnowledgeClaim,
  fetchClaimEvidence,
  fetchKnowledgeClaims,
  fetchKnowledgeEvidence,
  patchClaimEvidence,
  patchKnowledgeClaim,
  postClaimEvidence,
  postKnowledgeClaim,
  postRestoreClaimEvidence,
  postRestoreKnowledgeClaim,
} from '../api.js';
import { SourceStatus } from './SourceStatus.js';

const relationLabels: Record<ClaimEvidenceRelation, string> = {
  supports: '支持',
  refutes: '反驳',
  qualifies: '限定',
};

function RelationIcon({ relation }: { relation: ClaimEvidenceRelation }) {
  if (relation === 'supports') return <IconCheck size={11} aria-hidden="true" />;
  if (relation === 'refutes') return <IconX size={11} aria-hidden="true" />;
  return <IconAlertCircle size={11} aria-hidden="true" />;
}

const statusLabels: Record<ClaimStatus, string> = {
  draft: '草稿',
  active: '使用中',
  archived: '已归档',
  deleted: '回收站',
};

type MobilePane = 'claims' | 'edit' | 'relations';

function sourceUrl(evidence: Evidence) {
  const params = new URLSearchParams({
    page: String(evidence.sourceSnapshot.pageNumber),
    context: evidence.sourceSnapshot.contextId ?? 'general',
    annotation: evidence.annotationId,
  });
  return `/research/read/${encodeURIComponent(evidence.assetId)}?${params.toString()}`;
}

function RelationEditor({
  relation,
  evidence,
  busy,
  onSave,
  onDelete,
  onRestore,
}: {
  relation: ClaimEvidence;
  evidence: Evidence | null;
  busy: boolean;
  onSave: (relation: ClaimEvidence, type: ClaimEvidenceRelation, note: string | null) => void;
  onDelete: (relation: ClaimEvidence) => void;
  onRestore: (relation: ClaimEvidence) => void;
}) {
  const [type, setType] = useState(relation.relation);
  const [note, setNote] = useState(relation.note ?? '');
  useEffect(() => {
    setType(relation.relation);
    setNote(relation.note ?? '');
  }, [relation.id, relation.note, relation.relation, relation.revision]);
  const dirty = type !== relation.relation || note !== (relation.note ?? '');
  return (
    <article className="border-b border-line px-4 py-4 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-accent">
              <RelationIcon relation={relation.relation} />
              {relationLabels[relation.relation]}
            </span>
            {evidence && <SourceStatus state={evidence.sourceState} compact />}
            {relation.status === 'deleted' && (
              <span className="text-[10px] text-muted">已解除</span>
            )}
          </div>
          <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-ink">
            {evidence?.title || evidence?.sourceSnapshot.workTitle || '证据不可用'}
          </p>
          <p className="mt-1 line-clamp-3 text-xs leading-5 text-secondary">
            {evidence?.summary || evidence?.sourceSnapshot.anchor.textQuote?.exact || '区域证据'}
          </p>
        </div>
        {evidence && (
          <a
            href={sourceUrl(evidence)}
            aria-label="回到证据原文"
            className="shrink-0 text-accent hover:text-ink"
          >
            <IconExternalLink size={14} />
          </a>
        )}
      </div>
      {relation.status === 'active' ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-[7rem_1fr_auto]">
          <select
            value={type}
            onChange={(event) => setType(event.target.value as ClaimEvidenceRelation)}
            className="border border-line bg-surface px-2 py-1.5 text-xs text-ink outline-none focus:border-accent"
          >
            {(Object.keys(relationLabels) as ClaimEvidenceRelation[]).map((value) => (
              <option key={value} value={value}>
                {relationLabels[value]}
              </option>
            ))}
          </select>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="关系说明（可选）"
            className="min-w-0 border border-line bg-surface px-2 py-1.5 text-xs text-ink outline-none focus:border-accent"
          />
          <div className="flex gap-1">
            <Button
              size="sm"
              disabled={busy || !dirty}
              onClick={() => onSave(relation, type, note.trim() || null)}
            >
              保存
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDelete(relation)}>
              解除
            </Button>
          </div>
        </div>
      ) : (
        <Button className="mt-3" size="sm" disabled={busy} onClick={() => onRestore(relation)}>
          恢复关系
        </Button>
      )}
    </article>
  );
}

export function ClaimBoard({
  contextId,
  contextArchived,
  initialClaimId,
  initialStatus,
  onMessage,
}: {
  contextId: string | null | undefined;
  contextArchived: boolean;
  initialClaimId?: string | null;
  initialStatus?: ClaimStatus;
  onMessage: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ClaimStatus>(initialStatus ?? 'active');
  const [selectedId, setSelectedId] = useState<string | null>(initialClaimId ?? null);
  const [mobilePane, setMobilePane] = useState<MobilePane>('claims');
  const [statement, setStatement] = useState('');
  const [rationale, setRationale] = useState('');
  const [claimStatus, setClaimStatus] = useState<ClaimEditableStatus>('draft');
  const [candidateId, setCandidateId] = useState('');
  const [candidateRelation, setCandidateRelation] = useState<ClaimEvidenceRelation>('supports');

  const claimsQuery = useQuery({
    queryKey: ['research', 'knowledge', 'claims', contextId ?? 'all', status],
    queryFn: () =>
      fetchKnowledgeClaims({
        ...(contextId !== undefined ? { contextId } : {}),
        status,
        limit: 100,
      }),
  });
  const evidenceQuery = useQuery({
    queryKey: ['research', 'knowledge', 'evidence', 'claim-picker'],
    queryFn: () => fetchKnowledgeEvidence({ status: 'active', limit: 100 }),
  });
  const claims = claimsQuery.data?.claims ?? [];
  const selected = claims.find((claim) => claim.id === selectedId) ?? null;
  const evidence = evidenceQuery.data?.evidence ?? [];
  const evidenceById = useMemo(
    () => new Map(evidence.map((item) => [item.id, item] as const)),
    [evidence],
  );
  const relationsQuery = useQuery({
    queryKey: ['research', 'knowledge', 'claim-evidence', selectedId],
    queryFn: () => fetchClaimEvidence(selectedId!, true),
    enabled: selectedId !== null,
  });
  const relations = relationsQuery.data ?? [];

  useEffect(() => {
    if (selectedId && claims.some((claim) => claim.id === selectedId)) return;
    setSelectedId(claims[0]?.id ?? null);
  }, [claims, selectedId]);
  useEffect(() => {
    setStatement(selected?.statement ?? '');
    setRationale(selected?.rationale ?? '');
    setClaimStatus(
      selected?.status === 'active' || selected?.status === 'archived' ? selected.status : 'draft',
    );
  }, [
    selected?.id,
    selected?.rationale,
    selected?.revision,
    selected?.statement,
    selected?.status,
  ]);
  useEffect(() => {
    const linked = new Set(
      relations
        .filter((relation) => relation.status === 'active')
        .map((relation) => relation.evidenceId),
    );
    if (
      candidateId &&
      evidence.some((item) => item.id === candidateId) &&
      !linked.has(candidateId)
    ) {
      return;
    }
    setCandidateId(evidence.find((item) => !linked.has(item.id))?.id ?? '');
  }, [candidateId, evidence, relations]);

  const invalidateClaims = () =>
    queryClient.invalidateQueries({ queryKey: ['research', 'knowledge', 'claims'] });
  const invalidateRelations = () =>
    queryClient.invalidateQueries({ queryKey: ['research', 'knowledge', 'claim-evidence'] });
  const claimMutation = useMutation({
    mutationFn: async (action: {
      kind: 'create' | 'update' | 'delete' | 'restore';
      claim?: Claim;
    }) => {
      if (action.kind === 'create') {
        return postKnowledgeClaim({
          contextId: contextId ?? null,
          statement: '未命名观点',
          rationale: null,
          status: 'draft',
        });
      }
      const claim = action.claim!;
      if (action.kind === 'update') {
        return patchKnowledgeClaim(claim.id, {
          statement,
          rationale: rationale.trim() || null,
          status: claimStatus,
          expectedRevision: claim.revision,
        });
      }
      if (action.kind === 'delete') return deleteKnowledgeClaim(claim.id, claim.revision);
      return postRestoreKnowledgeClaim(claim.id, claim.revision);
    },
    onSuccess: (claim, action) => {
      setSelectedId(claim.id);
      setStatus(claim.status);
      setMobilePane(action.kind === 'create' ? 'edit' : mobilePane);
      onMessage(
        action.kind === 'create'
          ? '观点已创建'
          : action.kind === 'delete'
            ? '观点已移入回收站'
            : action.kind === 'restore'
              ? '观点已恢复'
              : '观点已保存',
      );
      void invalidateClaims();
    },
    onError: (cause) => onMessage(cause instanceof Error ? cause.message : '观点操作失败'),
  });
  const relationMutation = useMutation({
    mutationFn: async (action: {
      kind: 'create' | 'update' | 'delete' | 'restore';
      relation?: ClaimEvidence;
      type?: ClaimEvidenceRelation;
      note?: string | null;
    }) => {
      if (action.kind === 'create') {
        return postClaimEvidence(selected!.id, {
          evidenceId: candidateId,
          relation: candidateRelation,
          note: null,
        });
      }
      const relation = action.relation!;
      if (action.kind === 'update') {
        return patchClaimEvidence(relation.id, {
          relation: action.type,
          note: action.note,
          expectedRevision: relation.revision,
        });
      }
      if (action.kind === 'delete') return deleteClaimEvidence(relation.id, relation.revision);
      return postRestoreClaimEvidence(relation.id, relation.revision);
    },
    onSuccess: (_, action) => {
      onMessage(
        action.kind === 'create'
          ? '证据已加入观点'
          : action.kind === 'delete'
            ? '观点证据关系已解除'
            : action.kind === 'restore'
              ? '观点证据关系已恢复'
              : '观点证据关系已保存',
      );
      void invalidateRelations();
      void invalidateClaims();
    },
    onError: (cause) => onMessage(cause instanceof Error ? cause.message : '观点证据操作失败'),
  });
  const busy = claimMutation.isPending || relationMutation.isPending;
  const canWrite = !contextArchived && status !== 'deleted';
  const dirty =
    selected !== null &&
    (statement !== selected.statement ||
      rationale !== (selected.rationale ?? '') ||
      claimStatus !== selected.status);
  const activeLinkedIds = new Set(
    relations
      .filter((relation) => relation.status === 'active')
      .map((relation) => relation.evidenceId),
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="grid shrink-0 grid-cols-3 border-b border-line lg:hidden">
        {(
          [
            ['claims', '观点'],
            ['edit', '编辑'],
            ['relations', '证据关系'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMobilePane(value)}
            className={`py-2 text-xs font-semibold ${mobilePane === value ? 'bg-surface-2 text-ink' : 'text-muted'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[16rem_minmax(20rem,0.85fr)_minmax(24rem,1.15fr)]">
        <aside
          className={`${mobilePane === 'claims' ? 'flex' : 'hidden'} min-h-0 flex-col border-r border-line lg:flex`}
        >
          <div className="shrink-0 border-b border-line p-3">
            <div className="flex flex-wrap gap-1">
              {(['draft', 'active', 'archived', 'deleted'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatus(value)}
                  className={`px-2 py-1 text-[10px] font-semibold ${status === value ? 'bg-surface-2 text-ink' : 'text-muted hover:text-secondary'}`}
                >
                  {statusLabels[value]}
                </button>
              ))}
            </div>
            {status !== 'deleted' && !contextArchived && (
              <Button
                className="mt-3 w-full"
                size="sm"
                icon={<IconPlus size={12} />}
                disabled={busy}
                onClick={() => claimMutation.mutate({ kind: 'create' })}
              >
                新建观点
              </Button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {claims.map((claim) => (
              <button
                key={claim.id}
                type="button"
                onClick={() => {
                  setSelectedId(claim.id);
                  setMobilePane('edit');
                }}
                className={`block w-full border-b border-line px-4 py-3 text-left ${selectedId === claim.id ? 'bg-surface-2' : 'hover:bg-surface-2/60'}`}
              >
                <span className="line-clamp-3 text-xs font-semibold leading-5 text-ink">
                  {claim.statement}
                </span>
                <span className="mt-2 block text-[10px] text-muted">
                  {claim.evidenceCount === 0 ? '尚无证据' : `${claim.evidenceCount} 条证据`}
                  {' · '}v{claim.revision}
                </span>
              </button>
            ))}
            {!claimsQuery.isLoading && claims.length === 0 && (
              <p className="px-4 py-10 text-center text-xs text-muted">这个范围还没有观点。</p>
            )}
          </div>
        </aside>

        <main
          className={`${mobilePane === 'edit' ? 'flex' : 'hidden'} min-h-0 flex-col border-r border-line lg:flex`}
        >
          {!selected ? (
            <div className="grid h-full place-items-center px-6 text-center text-xs text-muted">
              选择或新建一个观点。
            </div>
          ) : (
            <>
              <header className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                    观点 · v{selected.revision}
                  </p>
                  <p className="mt-1 text-xs text-secondary">
                    {selected.evidenceCount === 0
                      ? '尚无证据'
                      : `${selected.evidenceCount} 条有效证据`}
                  </p>
                </div>
                {selected.status === 'deleted' ? (
                  <Button
                    size="sm"
                    disabled={busy || contextArchived}
                    onClick={() => claimMutation.mutate({ kind: 'restore', claim: selected })}
                  >
                    恢复
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy || contextArchived}
                    onClick={() => claimMutation.mutate({ kind: 'delete', claim: selected })}
                  >
                    删除
                  </Button>
                )}
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                  观点正文
                  <textarea
                    value={statement}
                    disabled={!canWrite}
                    onChange={(event) => setStatement(event.target.value)}
                    rows={7}
                    className="mt-2 w-full resize-y border border-line bg-surface px-3 py-2 text-sm normal-case leading-6 tracking-normal text-ink outline-none focus:border-accent"
                  />
                </label>
                <label className="mt-4 block text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                  说明
                  <textarea
                    value={rationale}
                    disabled={!canWrite}
                    onChange={(event) => setRationale(event.target.value)}
                    rows={5}
                    className="mt-2 w-full resize-y border border-line bg-surface px-3 py-2 text-sm normal-case leading-6 tracking-normal text-ink outline-none focus:border-accent"
                  />
                </label>
                {selected.status !== 'deleted' && (
                  <label className="mt-4 block text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                    状态
                    <select
                      value={claimStatus}
                      disabled={!canWrite}
                      onChange={(event) =>
                        setClaimStatus(event.target.value as ClaimEditableStatus)
                      }
                      className="mt-2 w-full border border-line bg-surface px-3 py-2 text-xs normal-case tracking-normal text-ink outline-none focus:border-accent"
                    >
                      <option value="draft">草稿</option>
                      <option value="active">使用中</option>
                      <option value="archived">已归档</option>
                    </select>
                  </label>
                )}
                {canWrite && (
                  <Button
                    className="mt-4 w-full"
                    variant="primary"
                    disabled={busy || !dirty || statement.trim().length === 0}
                    onClick={() => claimMutation.mutate({ kind: 'update', claim: selected })}
                  >
                    保存观点
                  </Button>
                )}
              </div>
            </>
          )}
        </main>

        <aside
          className={`${mobilePane === 'relations' ? 'flex' : 'hidden'} min-h-0 flex-col lg:flex`}
        >
          <header className="shrink-0 border-b border-line px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">证据关系</p>
            <p className="mt-1 text-xs text-secondary">关系属于观点与证据之间，不修改证据本身</p>
          </header>
          {selected && canWrite && (
            <div className="grid shrink-0 gap-2 border-b border-line p-4 sm:grid-cols-[1fr_7rem_auto]">
              <select
                value={candidateId}
                onChange={(event) => setCandidateId(event.target.value)}
                className="min-w-0 border border-line bg-surface px-2 py-2 text-xs text-ink outline-none focus:border-accent"
              >
                <option value="">选择证据</option>
                {evidence
                  .filter((item) => !activeLinkedIds.has(item.id))
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title || item.sourceSnapshot.workTitle}
                    </option>
                  ))}
              </select>
              <select
                value={candidateRelation}
                onChange={(event) =>
                  setCandidateRelation(event.target.value as ClaimEvidenceRelation)
                }
                className="border border-line bg-surface px-2 py-2 text-xs text-ink outline-none focus:border-accent"
              >
                {(Object.keys(relationLabels) as ClaimEvidenceRelation[]).map((value) => (
                  <option key={value} value={value}>
                    {relationLabels[value]}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                disabled={busy || !candidateId}
                onClick={() => relationMutation.mutate({ kind: 'create' })}
              >
                加入
              </Button>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {relations.map((relation) => (
              <RelationEditor
                key={relation.id}
                relation={relation}
                evidence={evidenceById.get(relation.evidenceId) ?? null}
                busy={busy || contextArchived}
                onSave={(item, type, note) =>
                  relationMutation.mutate({ kind: 'update', relation: item, type, note })
                }
                onDelete={(item) => relationMutation.mutate({ kind: 'delete', relation: item })}
                onRestore={(item) => relationMutation.mutate({ kind: 'restore', relation: item })}
              />
            ))}
            {selected && !relationsQuery.isLoading && relations.length === 0 && (
              <p className="px-6 py-12 text-center text-xs leading-5 text-muted">
                尚无证据。观点可以继续保持草稿，也可以先转为使用中。
              </p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
