import { useEffect, useState } from 'react';
import { Button } from '@workbench/ui';
import type { OcrJob, OcrLanguage, PageTextSearchResult, TextIndexJob } from '../../contract.js';

export type TextSearchScope = 'document' | 'library';
export type TextIndexControl = 'start' | 'pause' | 'cancel' | 'resume' | 'rebuild';
export type OcrControl = 'start' | 'pause' | 'cancel' | 'resume' | 'rebuild';

const STATUS_LABELS: Record<TextIndexJob['status'], string> = {
  queued: '等待索引',
  running: '正在索引',
  paused: '已暂停',
  completed: '索引完成',
  cancelled: '已取消',
  failed: '索引失败',
  interrupted: '等待恢复',
  'ocr-recommended': '建议 OCR',
};

const OCR_STATUS_LABELS: Record<OcrJob['status'], string> = {
  queued: '等待识别',
  running: '正在识别',
  paused: '已暂停',
  completed: '识别完成',
  cancelled: '已取消',
  failed: '识别失败',
  interrupted: '等待恢复',
};

export function ReaderSearchPanel({
  job,
  ocrJob,
  query,
  scope,
  results,
  busy,
  ocrBusy,
  searching,
  error,
  onSearch,
  onScope,
  onControl,
  onOcrControl,
  onLocate,
}: {
  job: TextIndexJob | null;
  ocrJob: OcrJob | null;
  query: string;
  scope: TextSearchScope;
  results: PageTextSearchResult[];
  busy: boolean;
  ocrBusy: boolean;
  searching: boolean;
  error: string | null;
  onSearch: (query: string) => void;
  onScope: (scope: TextSearchScope) => void;
  onControl: (control: TextIndexControl) => void;
  onOcrControl: (control: OcrControl, languages: OcrLanguage[]) => void;
  onLocate: (result: PageTextSearchResult) => void;
}) {
  const [draft, setDraft] = useState(query);
  const [ocrLanguages, setOcrLanguages] = useState<OcrLanguage[]>(['chi_sim', 'eng']);
  useEffect(() => setDraft(query), [query]);
  useEffect(() => {
    if (ocrJob) setOcrLanguages(ocrJob.languages);
  }, [ocrJob]);
  const progress = job?.totalPages ? Math.min(1, job.indexedPages / job.totalPages) : 0;
  const ocrProgress = ocrJob?.totalPages
    ? Math.min(1, ocrJob.processedPages / ocrJob.totalPages)
    : 0;
  const canResume =
    job?.status === 'paused' ||
    job?.status === 'cancelled' ||
    job?.status === 'failed' ||
    job?.status === 'interrupted';
  const canResumeOcr =
    ocrJob?.status === 'paused' ||
    ocrJob?.status === 'cancelled' ||
    ocrJob?.status === 'failed' ||
    ocrJob?.status === 'interrupted';
  const ocrActive = ocrJob?.status === 'queued' || ocrJob?.status === 'running';
  const toggleOcrLanguage = (language: OcrLanguage) => {
    setOcrLanguages((current) =>
      current.includes(language)
        ? current.filter((candidate) => candidate !== language)
        : [...current, language].sort(),
    );
  };

  return (
    <div className="px-4 py-4">
      <section className="border-b border-line pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">正文索引</p>
            <p className="mt-1 text-xs font-semibold text-ink">
              {job ? STATUS_LABELS[job.status] : '尚未建立'}
            </p>
          </div>
          <span className="font-mono text-[10px] text-muted">
            {job ? `${job.indexedPages}/${job.totalPages || '—'}` : '0/—'}
          </span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
          <div
            className="h-full bg-accent transition-[width] duration-200"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {!job && (
            <Button size="sm" disabled={busy} onClick={() => onControl('start')}>
              建立索引
            </Button>
          )}
          {(job?.status === 'queued' || job?.status === 'running') && (
            <>
              <Button size="sm" disabled={busy} onClick={() => onControl('pause')}>
                暂停
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onControl('cancel')}>
                取消
              </Button>
            </>
          )}
          {canResume && (
            <Button size="sm" disabled={busy} onClick={() => onControl('resume')}>
              继续
            </Button>
          )}
          {job && job.status !== 'queued' && job.status !== 'running' && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onControl('rebuild')}>
              重建
            </Button>
          )}
        </div>
        {job?.status === 'ocr-recommended' && (
          <p className="mt-2 text-[11px] leading-5 text-secondary">
            文本层不足，当前结果保持可见；需要识别扫描页时再明确启动 OCR。
          </p>
        )}
        {job?.errorCode && job.status !== 'ocr-recommended' && (
          <p className="mt-2 break-all font-mono text-[10px] text-critical">{job.errorCode}</p>
        )}
      </section>

      <section className="border-b border-line py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">本地 OCR</p>
            <p className="mt-1 text-xs font-semibold text-ink">
              {ocrJob ? OCR_STATUS_LABELS[ocrJob.status] : '尚未启动'}
            </p>
          </div>
          <span className="font-mono text-[10px] text-muted">
            {ocrJob
              ? `${ocrJob.processedPages}/${ocrJob.totalPages || '—'}`
              : `预计 ${job?.totalPages || '—'} 页`}
          </span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
          <div
            className="h-full bg-accent transition-[width] duration-200"
            style={{ width: `${ocrProgress * 100}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] leading-5 text-secondary">
          {job?.status === 'ocr-recommended'
            ? 'PDF 文本层为空或过少，搜索会漏掉扫描页，因此建议识别。'
            : '用于扫描页和图片型正文；已有可靠 PDF 文本的页面会保留原文。'}
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-secondary">
          {(
            [
              ['chi_sim', '简体中文'],
              ['eng', '英文'],
            ] as const
          ).map(([language, label]) => (
            <label key={language} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={ocrLanguages.includes(language)}
                disabled={ocrActive || ocrBusy}
                onChange={() => toggleOcrLanguage(language)}
              />
              {label}
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {!ocrJob && (
            <Button
              size="sm"
              disabled={ocrBusy || ocrLanguages.length === 0}
              onClick={() => onOcrControl('start', ocrLanguages)}
            >
              确认并启动
            </Button>
          )}
          {ocrActive && (
            <>
              <Button size="sm" disabled={ocrBusy} onClick={() => onOcrControl('pause', [])}>
                暂停
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={ocrBusy}
                onClick={() => onOcrControl('cancel', [])}
              >
                取消
              </Button>
            </>
          )}
          {canResumeOcr && (
            <Button size="sm" disabled={ocrBusy} onClick={() => onOcrControl('resume', [])}>
              继续
            </Button>
          )}
          {ocrJob && !ocrActive && (
            <Button
              size="sm"
              variant="ghost"
              disabled={ocrBusy || ocrLanguages.length === 0}
              onClick={() => onOcrControl('rebuild', ocrLanguages)}
            >
              从头重建
            </Button>
          )}
        </div>
        {ocrJob?.errorCode && (
          <p className="mt-2 break-all font-mono text-[10px] text-critical">{ocrJob.errorCode}</p>
        )}
        <p className="mt-2 text-[10px] leading-4 text-muted">
          只在本机运行一个 OCR worker；识别期间暂停后台正文索引，原始 PDF 不会改写。
        </p>
      </section>

      <section className="pt-4">
        <div className="flex gap-2" role="group" aria-label="正文搜索范围">
          {(['document', 'library'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={scope === value}
              onClick={() => onScope(value)}
              className={`border-b px-1 pb-1 text-[11px] font-semibold ${
                scope === value ? 'border-accent text-ink' : 'border-transparent text-muted'
              }`}
            >
              {value === 'document' ? '当前 PDF' : '全部文献'}
            </button>
          ))}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim()) onSearch(draft.trim());
          }}
        >
          <input
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="搜索 PDF 正文"
            className="min-w-0 flex-1 rounded-control border border-line bg-surface-2 px-2.5 py-2 text-xs text-ink outline-none focus:border-accent"
          />
          <Button type="submit" size="sm" disabled={!draft.trim() || searching}>
            {searching ? '搜索中' : '搜索'}
          </Button>
        </form>
        {error && <p className="mt-2 text-[11px] text-critical">{error}</p>}
        <div className="mt-3 space-y-2">
          {results.map((result) => (
            <button
              key={`${result.assetId}-${result.pageNumber}-${result.matchStart}`}
              type="button"
              className="w-full border-l-2 border-line py-1 pl-3 text-left transition hover:border-accent"
              onClick={() => onLocate(result)}
            >
              <span className="block text-[10px] font-semibold text-muted">
                {scope === 'library' ? `${result.displayName} · ` : ''}第 {result.pageNumber} 页 ·{' '}
                {result.source === 'ocr' ? 'OCR' : 'PDF'}
              </span>
              <span className="mt-1 block text-xs leading-5 text-secondary">{result.snippet}</span>
            </button>
          ))}
          {query && !searching && results.length === 0 && (
            <p className="py-6 text-center text-xs leading-5 text-muted">没有匹配的页正文。</p>
          )}
          {!query && (
            <p className="py-6 text-center text-xs leading-5 text-muted">
              搜索结果按页返回，点击可直接定位。
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
