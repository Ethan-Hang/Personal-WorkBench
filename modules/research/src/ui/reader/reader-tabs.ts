export const READER_LIVE_DOCUMENT_LIMIT = 4;
export const READER_BACKGROUND_IDLE_MS = 30_000;

export interface ReaderTab {
  assetId: string;
  title: string;
  sleeping: boolean;
  lastActiveAt: number;
  backgroundedAt: number | null;
}

export interface ReaderTabSession {
  activeAssetId: string | null;
  tabs: ReaderTab[];
}

export const EMPTY_READER_TAB_SESSION: ReaderTabSession = { activeAssetId: null, tabs: [] };

function enforceLiveLimit(session: ReaderTabSession): ReaderTabSession {
  const tabs = session.tabs.map((tab) => ({ ...tab }));
  const liveBackground = tabs
    .filter((tab) => !tab.sleeping && tab.assetId !== session.activeAssetId)
    .sort((left, right) => left.lastActiveAt - right.lastActiveAt);
  let liveCount = tabs.filter((tab) => !tab.sleeping).length;
  while (liveCount > READER_LIVE_DOCUMENT_LIMIT) {
    const candidate = liveBackground.shift();
    if (!candidate) break;
    const index = tabs.findIndex((tab) => tab.assetId === candidate.assetId);
    if (index >= 0) tabs[index] = { ...tabs[index]!, sleeping: true };
    liveCount -= 1;
  }
  return { ...session, tabs };
}

export function activateReaderTab(
  session: ReaderTabSession,
  assetId: string,
  now: number,
): ReaderTabSession {
  const existing = session.tabs.find((tab) => tab.assetId === assetId);
  const tabs = session.tabs.map((tab) => {
    if (tab.assetId === assetId) {
      return { ...tab, sleeping: false, lastActiveAt: now, backgroundedAt: null };
    }
    if (tab.assetId === session.activeAssetId) return { ...tab, backgroundedAt: now };
    return tab;
  });
  if (!existing) {
    tabs.push({
      assetId,
      title: '正在打开…',
      sleeping: false,
      lastActiveAt: now,
      backgroundedAt: null,
    });
  }
  return enforceLiveLimit({ activeAssetId: assetId, tabs });
}

export function sleepIdleReaderTabs(
  session: ReaderTabSession,
  now: number,
  idleMs = READER_BACKGROUND_IDLE_MS,
): ReaderTabSession {
  let changed = false;
  const tabs = session.tabs.map((tab) => {
    if (
      tab.assetId !== session.activeAssetId &&
      !tab.sleeping &&
      tab.backgroundedAt !== null &&
      now - tab.backgroundedAt >= idleMs
    ) {
      changed = true;
      return { ...tab, sleeping: true };
    }
    return tab;
  });
  return changed ? { ...session, tabs } : session;
}

export function closeReaderTab(
  session: ReaderTabSession,
  assetId: string,
  now: number,
): ReaderTabSession {
  const closingIndex = session.tabs.findIndex((tab) => tab.assetId === assetId);
  if (closingIndex < 0) return session;
  const tabs = session.tabs.filter((tab) => tab.assetId !== assetId);
  if (tabs.length === 0) return EMPTY_READER_TAB_SESSION;
  if (session.activeAssetId !== assetId) return { ...session, tabs };
  const next = tabs[Math.min(closingIndex, tabs.length - 1)]!;
  return activateReaderTab({ activeAssetId: null, tabs }, next.assetId, now);
}

export function renameReaderTab(
  session: ReaderTabSession,
  assetId: string,
  title: string,
): ReaderTabSession {
  const normalized = title.trim();
  if (!normalized) return session;
  let changed = false;
  const tabs = session.tabs.map((tab) => {
    if (tab.assetId !== assetId || tab.title === normalized) return tab;
    changed = true;
    return { ...tab, title: normalized };
  });
  return changed ? { ...session, tabs } : session;
}

export function parseReaderTabSession(value: string | null): ReaderTabSession {
  if (!value) return EMPTY_READER_TAB_SESSION;
  try {
    const parsed = JSON.parse(value) as Partial<ReaderTabSession>;
    if (!Array.isArray(parsed.tabs)) return EMPTY_READER_TAB_SESSION;
    const seen = new Set<string>();
    const tabs: ReaderTab[] = [];
    for (const candidate of parsed.tabs) {
      if (
        typeof candidate !== 'object' ||
        candidate === null ||
        typeof candidate.assetId !== 'string' ||
        !candidate.assetId ||
        seen.has(candidate.assetId)
      ) {
        continue;
      }
      seen.add(candidate.assetId);
      tabs.push({
        assetId: candidate.assetId,
        title: typeof candidate.title === 'string' && candidate.title ? candidate.title : 'PDF',
        sleeping: candidate.sleeping === true,
        lastActiveAt:
          typeof candidate.lastActiveAt === 'number' && Number.isFinite(candidate.lastActiveAt)
            ? candidate.lastActiveAt
            : 0,
        backgroundedAt:
          typeof candidate.backgroundedAt === 'number' && Number.isFinite(candidate.backgroundedAt)
            ? candidate.backgroundedAt
            : null,
      });
    }
    const activeAssetId =
      typeof parsed.activeAssetId === 'string' && seen.has(parsed.activeAssetId)
        ? parsed.activeAssetId
        : null;
    return { activeAssetId, tabs };
  } catch {
    return EMPTY_READER_TAB_SESSION;
  }
}
