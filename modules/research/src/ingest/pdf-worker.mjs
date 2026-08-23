import process from 'node:process';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

function optionalString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

async function extract(filePath) {
  const loadingTask = getDocument({
    url: filePath,
    isEvalSupported: false,
    useSystemFonts: true,
    stopEvent: true,
  });
  let document;
  try {
    document = await loadingTask.promise;
    const [rawMetadata, page] = await Promise.all([
      document.getMetadata().catch(() => null),
      document.getPage(1),
    ]);
    const textContent = await page.getTextContent();
    const firstPageText = textContent.items
      .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const info = rawMetadata?.info ?? {};
    return {
      pageCount: document.numPages,
      metadata: {
        title: optionalString(info.Title),
        author: optionalString(info.Author),
        subject: optionalString(info.Subject),
        keywords: optionalString(info.Keywords),
        creationDate: optionalString(info.CreationDate),
      },
      firstPageText,
    };
  } finally {
    await loadingTask.destroy();
  }
}

const filePath = process.argv[2];
if (!filePath) {
  process.stderr.write(JSON.stringify({ code: 'PDF_INPUT_MISSING', message: 'missing file path' }));
  process.exitCode = 2;
} else {
  try {
    const result = await extract(filePath);
    process.stdout.write(JSON.stringify(result));
  } catch (error) {
    process.stderr.write(
      JSON.stringify({
        code: 'PDF_INVALID',
        name: error?.name ?? 'Error',
        message: error?.message ?? String(error),
      }),
    );
    process.exitCode = 1;
  }
}
