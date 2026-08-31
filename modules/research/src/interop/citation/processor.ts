import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import CSL from 'citeproc';
import type { CitationRenderResult, CslStyle } from '../../contract.js';

interface AssetManifest {
  assets: Record<string, { file: string; sha256: string }>;
}

interface LoadedAssets {
  locale: string;
  styles: Record<CslStyle, string>;
}

let assetPromise: Promise<LoadedAssets> | null = null;

async function loadAssets(): Promise<LoadedAssets> {
  const manifest = JSON.parse(
    await readFile(new URL('./assets/manifest.json', import.meta.url), 'utf8'),
  ) as AssetManifest;
  const load = async (name: string) => {
    const entry = manifest.assets[name];
    if (!entry) throw new Error(`CSL asset manifest entry missing: ${name}`);
    const content = await readFile(new URL(`./assets/${entry.file}`, import.meta.url), 'utf8');
    const actual = createHash('sha256').update(content).digest('hex');
    if (actual !== entry.sha256) throw new Error(`CSL asset hash mismatch: ${name}`);
    return content;
  };
  const [apa, ieee, chicago, locale] = await Promise.all([
    load('apa'),
    load('ieee'),
    load('chicago-author-date'),
    load('en-US'),
  ]);
  return {
    locale,
    styles: { apa, ieee, 'chicago-author-date': chicago },
  };
}

function assets(): Promise<LoadedAssets> {
  assetPromise ??= loadAssets();
  return assetPromise;
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity.toLocaleLowerCase()] ?? match;
  });
}

export function sanitizeCslHtml(value: string): string {
  const withoutDangerous = value.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
  return withoutDangerous.replace(/<\/?([a-z0-9-]+)([^>]*)>/gi, (raw, tagText, attributes) => {
    const tag = String(tagText).toLocaleLowerCase();
    const allowed = new Set(['div', 'p', 'span', 'i', 'b', 'em', 'strong', 'a', 'br']);
    if (!allowed.has(tag)) return '';
    if (raw.startsWith('</')) return `</${tag}>`;
    if (tag === 'br') return '<br>';
    if (tag !== 'a') return `<${tag}>`;
    const href = /\bhref\s*=\s*(["'])(.*?)\1/i.exec(String(attributes))?.[2] ?? '';
    return /^(https?:|mailto:)/i.test(href)
      ? `<a href="${href.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}">`
      : '<a>';
  });
}

export function cslHtmlToMarkdown(value: string): string {
  return decodeEntities(
    sanitizeCslHtml(value)
      .replace(/<a href="([^"]+)">([\s\S]*?)<\/a>/gi, '[$2]($1)')
      .replace(/<(i|em)>([\s\S]*?)<\/\1>/gi, '*$2*')
      .replace(/<(b|strong)>([\s\S]*?)<\/\1>/gi, '**$2**')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(div|p)>/gi, '\n')
      .replace(/<(div|p|span)>/gi, '')
      .replace(/<\/span>/gi, '')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface CitationProcessorInput {
  style: CslStyle;
  locale: 'en-US';
  mode: 'citation' | 'bibliography';
  items: Array<{
    workId: string;
    csl: Record<string, unknown>;
    locator: string | null;
    label: string | null;
    prefix: string | null;
    suffix: string | null;
    suppressAuthor: boolean;
  }>;
}

function renderWithEngine(input: {
  style: string;
  locale: string;
  items: Record<string, Record<string, unknown>>;
  citationItems: Array<Record<string, unknown>>;
  mode: 'citation' | 'bibliography';
  format: 'text' | 'html';
}): string {
  const engine = new CSL.Engine(
    {
      retrieveLocale: () => input.locale,
      retrieveItem: (id) => input.items[id]!,
    },
    input.style,
    'en-US',
    true,
  );
  engine.setOutputFormat(input.format);
  const ids = input.citationItems.map((item) => String(item.id));
  if (input.mode === 'bibliography') {
    engine.updateItems(ids);
    return engine.makeBibliography()[1].join('');
  }
  const result = engine.processCitationCluster(
    {
      citationID: randomUUID(),
      citationItems: input.citationItems,
      properties: { noteIndex: 0 },
    },
    [],
    [],
  );
  return result[1].map((entry) => entry[1]).join('');
}

export class CitationProcessor {
  async render(input: CitationProcessorInput): Promise<CitationRenderResult> {
    const loaded = await assets();
    const records = input.items.map((item, index) => ({
      id: `citation-${index}-${item.workId}`,
      item,
    }));
    const itemMap = Object.fromEntries(records.map(({ id, item }) => [id, { ...item.csl, id }]));
    const citationItems = records.map(({ id, item }) => ({
      id,
      ...(item.locator ? { locator: item.locator } : {}),
      ...(item.label ? { label: item.label } : {}),
      ...(item.prefix ? { prefix: item.prefix } : {}),
      ...(item.suffix ? { suffix: item.suffix } : {}),
      ...(item.suppressAuthor ? { 'suppress-author': true } : {}),
    }));
    const shared = {
      style: loaded.styles[input.style],
      locale: loaded.locale,
      items: itemMap,
      citationItems,
      mode: input.mode,
    };
    const text = renderWithEngine({ ...shared, format: 'text' });
    const html = sanitizeCslHtml(renderWithEngine({ ...shared, format: 'html' }));
    return {
      style: input.style,
      locale: 'en-US',
      mode: input.mode,
      itemCount: input.items.length,
      workIds: input.items.map((item) => item.workId),
      text: decodeEntities(text).trim(),
      markdown: cslHtmlToMarkdown(html),
      html,
    };
  }
}

export async function verifyCitationAssets(): Promise<void> {
  await assets();
}
