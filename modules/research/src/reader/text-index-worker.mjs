import { once } from 'node:events';
import process from 'node:process';
import { setImmediate as yieldImmediate } from 'node:timers/promises';
import { getDocument, version as pdfjsVersion } from 'pdfjs-dist/legacy/build/pdf.mjs';

async function emit(value) {
  if (!process.stdout.write(`${JSON.stringify(value)}\n`)) await once(process.stdout, 'drain');
}

function pageText(textContent) {
  let text = '';
  const positions = [];
  for (const item of textContent.items) {
    if (!('str' in item) || typeof item.str !== 'string') continue;
    const value = item.str.replace(/\s+/g, ' ').trim();
    if (!value) continue;
    if (text) text += ' ';
    const start = text.length;
    text += value;
    const transform = Array.isArray(item.transform) ? item.transform : [];
    const x = Number(transform[4] ?? 0);
    const y = Number(transform[5] ?? 0);
    const width = Math.max(0, Number(item.width ?? 0));
    const height = Math.max(0, Number(item.height ?? 0));
    positions.push({ start, end: text.length, x, y, width, height });
  }
  return { text, positions };
}

async function extract(filePath, startPage, priorityPage) {
  const loadingTask = getDocument({
    url: filePath,
    isEvalSupported: false,
    useSystemFonts: true,
    stopEvent: true,
  });
  try {
    const document = await loadingTask.promise;
    await emit({ type: 'metadata', totalPages: document.numPages, pdfjsVersion });
    const pages = [];
    if (priorityPage >= startPage && priorityPage <= document.numPages) pages.push(priorityPage);
    for (let pageNumber = startPage; pageNumber <= document.numPages; pageNumber += 1) {
      pages.push(pageNumber);
    }
    for (const pageNumber of new Set(pages)) {
      const page = await document.getPage(pageNumber);
      try {
        const content = await page.getTextContent({ includeMarkedContent: true });
        const extracted = pageText(content);
        const [left, bottom, right, top] = page.view;
        await emit({
          type: 'page',
          pageNumber,
          pageSize: { width: right - left, height: top - bottom },
          ...extracted,
        });
      } finally {
        page.cleanup();
      }
      await yieldImmediate();
    }
    await emit({ type: 'done' });
  } finally {
    await loadingTask.destroy();
  }
}

const filePath = process.argv[2];
const startPage = Number(process.argv[3] ?? 1);
const priorityPage = Number(process.argv[4] ?? startPage);

if (!filePath || !Number.isInteger(startPage) || startPage < 1) {
  process.stderr.write(JSON.stringify({ code: 'TEXT_INDEX_INPUT_INVALID' }));
  process.exitCode = 2;
} else {
  try {
    await extract(filePath, startPage, priorityPage);
  } catch (error) {
    process.stderr.write(
      JSON.stringify({
        code: 'TEXT_INDEX_PDF_FAILED',
        name: error?.name ?? 'Error',
        message: error?.message ?? String(error),
      }),
    );
    process.exitCode = 1;
  }
}
