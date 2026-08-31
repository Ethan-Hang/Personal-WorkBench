interface PdfFixtureOptions {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  lines?: string[];
  noText?: boolean;
}

function pdfString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** 生成只使用 Helvetica/ASCII 的最小 PDF；不提交第三方论文样本。 */
export function makePdfFixture(options: PdfFixtureOptions = {}): Buffer {
  const lines = options.noText
    ? []
    : (options.lines ?? ['Research Workbench', 'doi:10.1000/example']);
  const content = [
    'BT',
    '/F1 12 Tf',
    '72 720 Td',
    ...lines.flatMap((line, index) => [index === 0 ? '' : '0 -20 Td', `(${pdfString(line)}) Tj`]),
    'ET',
  ]
    .filter(Boolean)
    .join('\n');
  const info = [
    options.title ? `/Title (${pdfString(options.title)})` : '',
    options.author ? `/Author (${pdfString(options.author)})` : '',
    options.subject ? `/Subject (${pdfString(options.subject)})` : '',
    options.keywords ? `/Keywords (${pdfString(options.keywords)})` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]
       /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream`,
    `<< ${info} >>`,
  ];
  let output = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(output, 'binary'));
    output += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(output, 'binary');
  output += `xref\n0 ${objects.length + 1}\n`;
  output += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) {
    output += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\n`;
  output += `startxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(output, 'binary');
}

/** 生成可用于长文档索引和虚拟化测试的多页 ASCII PDF。 */
export function makePagedPdfFixture(
  pageCount: number,
  lineForPage: (pageNumber: number) => string = (pageNumber) =>
    `Research Workbench page ${pageNumber}`,
): Buffer {
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error('pageCount must be positive');
  const fontObjectNumber = 3 + pageCount * 2;
  const pageObjectNumbers = Array.from({ length: pageCount }, (_, index) => 3 + index * 2);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((value) => `${value} 0 R`).join(' ')}] /Count ${pageCount} >>`,
  ];
  for (let index = 0; index < pageCount; index += 1) {
    const pageNumber = index + 1;
    const contentObjectNumber = pageObjectNumbers[index]! + 1;
    const content = `BT\n/F1 12 Tf\n72 720 Td\n(${pdfString(lineForPage(pageNumber))}) Tj\nET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]
         /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >>
         /Contents ${contentObjectNumber} 0 R >>`,
      `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream`,
    );
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let output = '%PDF-1.7\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(output, 'binary'));
    output += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(output, 'binary');
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    output += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  output += `startxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(output, 'binary');
}
