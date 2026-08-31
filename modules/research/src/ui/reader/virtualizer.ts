export interface ReaderPageSize {
  width: number;
  height: number;
}

export interface ReaderPageLayout extends ReaderPageSize {
  pageNumber: number;
  top: number;
}

export interface ReaderVirtualWindow {
  pages: ReaderPageLayout[];
  visiblePages: number[];
  totalHeight: number;
}

export interface ReaderVirtualizerInput {
  pageCount: number;
  scrollTop: number;
  viewportHeight: number;
  pageGap: number;
  overscan: number;
  maxPages?: number;
  defaultPageSize: ReaderPageSize;
  pageSizes?: ReadonlyMap<number, ReaderPageSize>;
}

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function buildPageLayout({
  pageCount,
  pageGap,
  defaultPageSize,
  pageSizes,
}: Pick<
  ReaderVirtualizerInput,
  'pageCount' | 'pageGap' | 'defaultPageSize' | 'pageSizes'
>): ReaderPageLayout[] {
  const count = Math.max(0, Math.trunc(pageCount));
  const gap = Math.max(0, pageGap);
  const fallbackWidth = positive(defaultPageSize.width, 612);
  const fallbackHeight = positive(defaultPageSize.height, 792);
  const pages: ReaderPageLayout[] = [];
  let top = 0;
  for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
    const measured = pageSizes?.get(pageNumber);
    const width = positive(measured?.width ?? fallbackWidth, fallbackWidth);
    const height = positive(measured?.height ?? fallbackHeight, fallbackHeight);
    pages.push({ pageNumber, top, width, height });
    top += height + gap;
  }
  return pages;
}

function intersects(page: ReaderPageLayout, start: number, end: number): boolean {
  return page.top + page.height >= start && page.top <= end;
}

export function computeVirtualWindow(input: ReaderVirtualizerInput): ReaderVirtualWindow {
  const layout = buildPageLayout(input);
  const scrollTop = Math.max(0, input.scrollTop);
  const viewportHeight = positive(input.viewportHeight, input.defaultPageSize.height);
  const overscan = Math.max(0, input.overscan);
  const visibleEnd = scrollTop + viewportHeight;
  const renderStart = Math.max(0, scrollTop - overscan);
  const renderEnd = visibleEnd + overscan;
  const totalHeight =
    layout.length === 0 ? 0 : layout[layout.length - 1]!.top + layout[layout.length - 1]!.height;
  const center = scrollTop + viewportHeight / 2;
  const maxPages = Math.max(1, Math.trunc(input.maxPages ?? 8));
  const candidates = layout.filter((page) => intersects(page, renderStart, renderEnd));
  const pages =
    candidates.length <= maxPages
      ? candidates
      : [...candidates]
          .sort(
            (left, right) =>
              Math.abs(left.top + left.height / 2 - center) -
              Math.abs(right.top + right.height / 2 - center),
          )
          .slice(0, maxPages)
          .sort((left, right) => left.pageNumber - right.pageNumber);
  return {
    pages,
    visiblePages: layout
      .filter((page) => intersects(page, scrollTop, visibleEnd))
      .map((page) => page.pageNumber),
    totalHeight,
  };
}

export function positionAtViewportCenter(
  layout: readonly ReaderPageLayout[],
  scrollTop: number,
  viewportHeight: number,
): { pageNumber: number; pageOffsetRatio: number } {
  if (layout.length === 0) return { pageNumber: 1, pageOffsetRatio: 0 };
  const center = Math.max(0, scrollTop) + Math.max(0, viewportHeight) / 2;
  let nearest = layout[0]!;
  for (const page of layout) {
    if (center < page.top) break;
    nearest = page;
    if (center <= page.top + page.height) break;
  }
  return {
    pageNumber: nearest.pageNumber,
    pageOffsetRatio: Math.max(0, Math.min(1, (center - nearest.top) / nearest.height)),
  };
}

export function scrollTopForPosition(
  layout: readonly ReaderPageLayout[],
  pageNumber: number,
  pageOffsetRatio: number,
  viewportHeight: number,
): number {
  const page = layout[Math.max(0, Math.min(layout.length - 1, Math.trunc(pageNumber) - 1))];
  if (!page) return 0;
  const ratio = Math.max(0, Math.min(1, pageOffsetRatio));
  return Math.max(0, page.top + page.height * ratio - Math.max(0, viewportHeight) / 2);
}
