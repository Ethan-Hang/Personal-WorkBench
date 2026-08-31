import { useEffect, useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Button, IconAlertCircle } from '@workbench/ui';
import { useNavigate, useParams } from 'react-router';
import { fetchReaderManifest } from '../api.js';
import { ReaderTabs } from './ReaderTabs.js';
import { ReaderWorkspace } from './ReaderWorkspace.js';
import {
  activateReaderTab,
  closeReaderTab,
  parseReaderTabSession,
  renameReaderTab,
  sleepIdleReaderTabs,
  type ReaderTabSession,
} from './reader-tabs.js';

const READER_TABS_STORAGE_KEY = 'research:reader-tabs:v1';

function initialSession(assetId: string): ReaderTabSession {
  const stored =
    typeof window === 'undefined' ? null : window.sessionStorage.getItem(READER_TABS_STORAGE_KEY);
  return activateReaderTab(parseReaderTabSession(stored), assetId, Date.now());
}

export function ResearchReaderPage() {
  const navigate = useNavigate();
  const { assetId = '' } = useParams<{ assetId: string }>();
  const [session, setSession] = useState(() => initialSession(assetId));
  const manifestQueries = useQueries({
    queries: session.tabs.map((tab) => ({
      queryKey: ['research', 'reader', tab.assetId],
      queryFn: () => fetchReaderManifest(tab.assetId),
      enabled: !tab.sleeping,
      retry: false,
      staleTime: 30_000,
    })),
  });
  const resolvedTitles = manifestQueries
    .map((query) => query.data?.displayName ?? '')
    .join('\u0000');

  useEffect(() => {
    if (!assetId) return;
    setSession((current) =>
      current.activeAssetId === assetId ? current : activateReaderTab(current, assetId, Date.now()),
    );
  }, [assetId]);

  useEffect(() => {
    window.sessionStorage.setItem(READER_TABS_STORAGE_KEY, JSON.stringify(session));
  }, [session]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSession((current) => sleepIdleReaderTabs(current, Date.now()));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setSession((current) => {
      let next = current;
      for (const [index, tab] of current.tabs.entries()) {
        const title = manifestQueries[index]?.data?.displayName;
        if (title) next = renameReaderTab(next, tab.assetId, title);
      }
      return next;
    });
  }, [manifestQueries, resolvedTitles]);

  const queryByAssetId = useMemo(
    () => new Map(session.tabs.map((tab, index) => [tab.assetId, manifestQueries[index]] as const)),
    [manifestQueries, session.tabs],
  );
  const activeQuery = queryByAssetId.get(assetId);
  const back = () => navigate('/research');
  const activate = (nextAssetId: string) => {
    setSession((current) => activateReaderTab(current, nextAssetId, Date.now()));
    navigate(`/research/read/${encodeURIComponent(nextAssetId)}`);
  };
  const close = (closingAssetId: string) => {
    const next = closeReaderTab(session, closingAssetId, Date.now());
    setSession(next);
    if (closingAssetId !== assetId) return;
    if (next.activeAssetId) {
      navigate(`/research/read/${encodeURIComponent(next.activeAssetId)}`);
    } else {
      navigate('/research');
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-surface">
      <ReaderTabs
        activeAssetId={assetId}
        tabs={session.tabs}
        onActivate={activate}
        onClose={close}
      />
      <div className="relative min-h-0 flex-1">
        {session.tabs.map((tab) => {
          const manifest = queryByAssetId.get(tab.assetId)?.data;
          if (tab.sleeping || !manifest) return null;
          const active = tab.assetId === assetId;
          return (
            <div key={tab.assetId} className={active ? 'h-full' : 'hidden'}>
              <ReaderWorkspace active={active} manifest={manifest} onBack={back} />
            </div>
          );
        })}

        {!activeQuery?.data && activeQuery?.isLoading && (
          <div className="grid h-full min-h-80 place-items-center bg-surface">
            <p className="text-xs font-semibold text-secondary">正在准备阅读器…</p>
          </div>
        )}
        {!activeQuery?.data && !activeQuery?.isLoading && (
          <div className="grid h-full min-h-80 place-items-center bg-surface px-4">
            <div className="max-w-md border-y border-line py-8 text-center">
              <IconAlertCircle size={28} className="mx-auto text-critical" />
              <h1 className="mt-3 text-base font-bold text-ink">无法进入阅读器</h1>
              <p className="mt-2 text-xs leading-5 text-secondary">
                {activeQuery?.error instanceof Error
                  ? activeQuery.error.message
                  : '附件不存在或当前不可用'}
              </p>
              <Button className="mt-5" onClick={back}>
                返回文献库检查文件
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
