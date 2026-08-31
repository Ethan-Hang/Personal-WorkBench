import { readFile } from 'node:fs/promises';
import { Cite, plugins } from '@citation-js/core';
import '@citation-js/plugin-csl';
import { describe, expect, it } from 'vitest';
import type { InteropRepository } from '../records/repository.js';
import type { ExportRecordProjection } from '../export/model.js';
import {
  CitationProcessor,
  cslHtmlToMarkdown,
  sanitizeCslHtml,
  verifyCitationAssets,
} from './processor.js';

function record(input: {
  id: string;
  title: string;
  year: number | null;
  author?: { displayName: string; givenName: string | null; familyName: string | null };
}): Omit<ExportRecordProjection, 'citationKey'> {
  return {
    work: {
      id: input.id,
      revision: 1,
      type: 'article',
      title: input.title,
      abstract: null,
      year: input.year,
    },
    edition: {
      id: `${input.id}-edition`,
      revision: 1,
      kind: 'journal',
      title: input.title,
      publicationTitle: 'Journal of Tests',
      publisher: null,
      publishedDate: input.year === null ? null : String(input.year),
      volume: '4',
      issue: '2',
      pages: '10-20',
    },
    contributors: input.author ? [{ ...input.author, sequence: 0 }] : [],
    identifiers: [{ scheme: 'doi', value: `10.1000/${input.id}` }],
    attachmentCount: 0,
    source: null,
  };
}

const records = [
  record({
    id: 'smith-a',
    title: 'Alpha Study',
    year: 2026,
    author: { displayName: 'Jane Smith', givenName: 'Jane', familyName: 'Smith' },
  }),
  record({
    id: 'smith-b',
    title: 'Beta Study',
    year: 2026,
    author: { displayName: 'Jane Smith', givenName: 'Jane', familyName: 'Smith' },
  }),
  record({
    id: 'organization',
    title: 'Institutional Report',
    year: 2025,
    author: { displayName: 'Research Group', givenName: null, familyName: null },
  }),
  record({
    id: 'literal-zh',
    title: '中文研究',
    year: null,
    author: { displayName: '联合研究组', givenName: null, familyName: null },
  }),
];

function repository(): InteropRepository {
  return {
    projectExportRecords: () => records,
  } as unknown as InteropRepository;
}

describe('CitationProcessor', () => {
  it('固定资产 hash 通过并为三种样式生成三种安全表示', async () => {
    await expect(verifyCitationAssets()).resolves.toBeUndefined();
    const processor = new CitationProcessor(repository());
    for (const style of ['apa', 'ieee', 'chicago-author-date'] as const) {
      const result = await processor.render({
        style,
        locale: 'en-US',
        mode: 'bibliography',
        items: records.map((value) => ({
          workId: value.work.id,
          editionId: value.edition!.id,
          locator: null,
          label: null,
          prefix: null,
          suffix: null,
          suppressAuthor: false,
        })),
      });
      expect(result).toMatchObject({
        style,
        itemCount: 4,
        workIds: records.map((value) => value.work.id),
      });
      expect(result.text).toContain('Alpha Study');
      expect(result.markdown).toContain('Alpha Study');
      expect(result.html).toContain('Alpha Study');
      expect(result.html).not.toMatch(/style=|class=|<script/i);
      expect({ style, text: result.text, markdown: result.markdown }).toMatchSnapshot();
    }
  });

  it('文内引用保留 locator、prefix、suffix 和输入顺序', async () => {
    const result = await new CitationProcessor(repository()).render({
      style: 'apa',
      locale: 'en-US',
      mode: 'citation',
      items: [
        {
          workId: 'smith-b',
          editionId: 'smith-b-edition',
          locator: '17',
          label: 'page',
          prefix: 'see ',
          suffix: ', emphasis added',
          suppressAuthor: false,
        },
        {
          workId: 'organization',
          editionId: 'organization-edition',
          locator: null,
          label: null,
          prefix: null,
          suffix: null,
          suppressAuthor: false,
        },
      ],
    });
    expect(result.text).toContain('17');
    expect(result.text).toContain('see');
    expect(result.workIds).toEqual(['smith-b', 'organization']);
    expect(result).toMatchSnapshot();
  });

  it('Citation.js 包装层与直接引擎对固定 APA bibliography 一致', async () => {
    const style = await readFile(new URL('./assets/apa.csl', import.meta.url), 'utf8');
    const locale = await readFile(new URL('./assets/locales-en-US.xml', import.meta.url), 'utf8');
    plugins.config.get('@csl').styles.add('workbench-apa', style);
    plugins.config.get('@csl').locales.add('en-US', locale);
    const direct = await new CitationProcessor(repository()).render({
      style: 'apa',
      locale: 'en-US',
      mode: 'bibliography',
      items: records.map((value) => ({
        workId: value.work.id,
        editionId: value.edition!.id,
        locator: null,
        label: null,
        prefix: null,
        suffix: null,
        suppressAuthor: false,
      })),
    });
    const items = records.map((value) => ({
      id: value.work.id,
      type: 'article-journal',
      title: value.work.title,
      author: value.contributors[0]?.familyName
        ? [{ family: value.contributors[0].familyName, given: value.contributors[0].givenName }]
        : [{ literal: value.contributors[0]?.displayName }],
      ...(value.work.year === null ? {} : { issued: { 'date-parts': [[value.work.year]] } }),
      'container-title': value.edition?.publicationTitle,
      volume: value.edition?.volume,
      issue: value.edition?.issue,
      page: value.edition?.pages,
      DOI: value.identifiers[0]?.value,
    }));
    const wrapped = new Cite(items).format('bibliography', {
      format: 'text',
      template: 'workbench-apa',
      lang: 'en-US',
    });
    expect(wrapped.trim()).toBe(direct.text);
  });

  it('HTML 白名单删除危险内容并生成受控 Markdown', () => {
    const sanitized = sanitizeCslHtml(
      '<div class="x"><script>alert(1)</script><i>Title</i> <a href="javascript:x">bad</a> <a href="https://example.test">good</a></div>',
    );
    expect(sanitized).toBe(
      '<div><i>Title</i> <a>bad</a> <a href="https://example.test">good</a></div>',
    );
    expect(cslHtmlToMarkdown(sanitized)).toBe('*Title* bad [good](https://example.test)');
  });
});
