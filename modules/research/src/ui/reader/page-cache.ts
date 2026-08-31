import type { PDFPageProxy } from 'pdfjs-dist';

export interface PageResourceLease<T> {
  value: T;
  release(): void;
}

interface PageResourceEntry<T> {
  documentId: string;
  pageNumber: number;
  value: T;
  dispose: (value: T) => void;
  pins: number;
  touchedAt: number;
}

export interface PageResourceCacheStats {
  total: number;
  pinned: number;
  byDocument: Readonly<Record<string, number>>;
}

export class PageResourceCache<T> {
  private readonly entries = new Map<string, PageResourceEntry<T>>();
  private readonly pending = new Map<string, Promise<PageResourceEntry<T>>>();
  private readonly retiredDocuments = new Set<string>();
  private clock = 0;

  constructor(
    private readonly perDocumentLimit = 8,
    private readonly globalLimit = 16,
  ) {
    if (perDocumentLimit < 1 || globalLimit < 1 || perDocumentLimit > globalLimit) {
      throw new Error('页面缓存上限无效');
    }
  }

  private key(documentId: string, pageNumber: number): string {
    return `${documentId}\u0000${pageNumber}`;
  }

  private touch(entry: PageResourceEntry<T>): void {
    this.clock += 1;
    entry.touchedAt = this.clock;
  }

  private evictEntry(entry: PageResourceEntry<T>): void {
    this.entries.delete(this.key(entry.documentId, entry.pageNumber));
    entry.dispose(entry.value);
  }

  private finishRetirement(documentId: string): void {
    const hasEntries = [...this.entries.values()].some((entry) => entry.documentId === documentId);
    const hasPending = [...this.pending.keys()].some((key) =>
      key.startsWith(`${documentId}\u0000`),
    );
    if (!hasEntries && !hasPending) this.retiredDocuments.delete(documentId);
  }

  private evictOne(documentId?: string): boolean {
    const candidate = [...this.entries.values()]
      .filter(
        (entry) =>
          entry.pins === 0 && (documentId === undefined || entry.documentId === documentId),
      )
      .sort((left, right) => left.touchedAt - right.touchedAt)[0];
    if (!candidate) return false;
    this.evictEntry(candidate);
    return true;
  }

  private enforceLimits(documentId: string): void {
    const countForDocument = () =>
      [...this.entries.values()].filter((entry) => entry.documentId === documentId).length;
    while (countForDocument() > this.perDocumentLimit && this.evictOne(documentId)) {
      // Evict unpinned least-recently-used pages from this document first.
    }
    while (this.entries.size > this.globalLimit && this.evictOne()) {
      // Then enforce the cross-document limit.
    }
  }

  private withinLimits(documentId: string): boolean {
    const documentEntries = [...this.entries.values()].filter(
      (entry) => entry.documentId === documentId,
    ).length;
    return documentEntries <= this.perDocumentLimit && this.entries.size <= this.globalLimit;
  }

  async acquire(
    documentId: string,
    pageNumber: number,
    load: () => Promise<T>,
    dispose: (value: T) => void,
  ): Promise<PageResourceLease<T>> {
    const key = this.key(documentId, pageNumber);
    let entry = this.entries.get(key);
    let pinReserved = false;
    if (!entry) {
      let loading = this.pending.get(key);
      if (!loading) {
        loading = load().then((value) => {
          if (this.retiredDocuments.has(documentId)) {
            dispose(value);
            throw new Error('READER_PAGE_CACHE_RETIRED');
          }
          const loaded: PageResourceEntry<T> = {
            documentId,
            pageNumber,
            value,
            dispose,
            pins: 1,
            touchedAt: 0,
          };
          this.touch(loaded);
          this.entries.set(key, loaded);
          this.enforceLimits(documentId);
          if (!this.withinLimits(documentId)) {
            this.entries.delete(key);
            loaded.dispose(loaded.value);
            throw new Error('READER_PAGE_CACHE_CAPACITY');
          }
          return loaded;
        });
        this.pending.set(key, loading);
        void loading
          .finally(() => {
            this.pending.delete(key);
            this.finishRetirement(documentId);
          })
          .catch(() => undefined);
        pinReserved = true;
      }
      entry = await loading;
    }
    if (!pinReserved) entry.pins += 1;
    this.touch(entry);
    let released = false;
    return {
      value: entry.value,
      release: () => {
        if (released) return;
        released = true;
        entry!.pins = Math.max(0, entry!.pins - 1);
        this.touch(entry!);
        if (entry!.pins === 0 && this.retiredDocuments.has(documentId)) {
          this.evictEntry(entry!);
          this.finishRetirement(documentId);
          return;
        }
        this.enforceLimits(documentId);
      },
    };
  }

  clearDocument(documentId: string): void {
    this.retiredDocuments.add(documentId);
    for (const entry of [...this.entries.values()]) {
      if (entry.documentId === documentId && entry.pins === 0) this.evictEntry(entry);
    }
    this.finishRetirement(documentId);
  }

  clear(): void {
    for (const entry of [...this.entries.values()]) {
      if (entry.pins === 0) this.evictEntry(entry);
    }
  }

  stats(): PageResourceCacheStats {
    const byDocument: Record<string, number> = {};
    let pinned = 0;
    for (const entry of this.entries.values()) {
      byDocument[entry.documentId] = (byDocument[entry.documentId] ?? 0) + 1;
      if (entry.pins > 0) pinned += 1;
    }
    return { total: this.entries.size, pinned, byDocument };
  }
}

export const pdfPageCache = new PageResourceCache<PDFPageProxy>(8, 16);
