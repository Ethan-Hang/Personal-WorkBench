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
