export interface ExtractedIdentifier {
  scheme: 'doi' | 'arxiv';
  value: string;
  normalizedValue: string;
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function stripUnbalancedClosingParentheses(value: string): string {
  let result = value;
  while (result.endsWith(')')) {
    const opens = (result.match(/\(/g) ?? []).length;
    const closes = (result.match(/\)/g) ?? []).length;
    if (closes <= opens) break;
    result = result.slice(0, -1);
  }
  return result;
}

export function normalizeDoi(raw: string): string | null {
  let value = decode(raw.trim())
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi\s*:\s*/i, '')
    .trim();
  value = stripUnbalancedClosingParentheses(value.replace(/[\s.,;:]+$/g, ''));
  if (!/^10\.\d{4,9}\/\S+$/i.test(value)) return null;
  return value.toLowerCase();
}

export function normalizeArxivId(raw: string): string | null {
  const value = raw
    .trim()
    .replace(/^https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|pdf)\//i, '')
    .replace(/\.pdf$/i, '')
    .replace(/^arxiv\s*:\s*/i, '')
    .replace(/[\s.,;:]+$/g, '');
  if (/^\d{4}\.\d{4,5}(?:v\d+)?$/i.test(value)) return value.toLowerCase();
  if (/^[a-z-]+(?:\.[a-z]{2})?\/\d{7}(?:v\d+)?$/i.test(value)) return value.toLowerCase();
  return null;
}

export function extractIdentifiers(text: string): ExtractedIdentifier[] {
  const found = new Map<string, ExtractedIdentifier>();
  const doiPattern = /(?:https?:\/\/(?:dx\.)?doi\.org\/|doi\s*:\s*)?(10\.\d{4,9}\/[^\s<>"']+)/gi;
  for (const match of text.matchAll(doiPattern)) {
    const value = match[1];
    if (!value) continue;
    const normalizedValue = normalizeDoi(value);
    if (!normalizedValue) continue;
    const key = `doi:${normalizedValue}`;
    if (!found.has(key)) found.set(key, { scheme: 'doi', value, normalizedValue });
  }

  const arxivPattern =
    /(?:arxiv\s*:\s*|arxiv\.org\/(?:abs|pdf)\/)?(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+(?:\.[a-z]{2})?\/\d{7}(?:v\d+)?)(?:\.pdf)?/gi;
  for (const match of text.matchAll(arxivPattern)) {
    const value = match[1];
    if (!value) continue;
    const normalizedValue = normalizeArxivId(value);
    if (!normalizedValue) continue;
    const key = `arxiv:${normalizedValue}`;
    if (!found.has(key)) found.set(key, { scheme: 'arxiv', value, normalizedValue });
  }
  return [...found.values()];
}
