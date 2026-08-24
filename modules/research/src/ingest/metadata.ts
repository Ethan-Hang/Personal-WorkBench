import { basename, extname } from 'node:path';
import type { MetadataSourceKind } from '../contract.js';
import { extractIdentifiers, type ExtractedIdentifier } from './identifiers.js';
import type { PdfExtractionResult } from './pdf-extractor.js';

export interface LocalMetadataSuggestion {
  fieldName: 'title' | 'authors' | 'subject' | 'keywords';
  value: string | string[];
  sourceKind: Extract<MetadataSourceKind, 'embedded-pdf' | 'first-page' | 'filename'>;
}

export interface LocalMetadataResult {
  suggestions: LocalMetadataSuggestion[];
  identifiers: Array<ExtractedIdentifier & { sourceKind: 'embedded-pdf' | 'first-page' }>;
  warnings: string[];
}

function filenameTitle(filePath: string): string | null {
  const name = basename(filePath, extname(filePath))
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return name === '' ? null : name;
}

function firstPageTitle(text: string): string | null {
  const candidate = text
    .split(/(?<=[.!?])\s+|\s{2,}/)
    .map((value) => value.trim())
    .find((value) => value.length >= 8 && value.length <= 240 && !/^doi\b|^arxiv\b/i.test(value));
  return candidate ?? null;
}

export function buildLocalMetadata(
  filePath: string,
  extraction: PdfExtractionResult | null,
  extractionWarning?: string,
): LocalMetadataResult {
  const suggestions: LocalMetadataSuggestion[] = [];
  const identifiers: LocalMetadataResult['identifiers'] = [];
  const warnings = extractionWarning ? [extractionWarning] : [];

  if (extraction) {
    if (extraction.metadata.title) {
      suggestions.push({
        fieldName: 'title',
        value: extraction.metadata.title,
        sourceKind: 'embedded-pdf',
      });
    }
    if (extraction.metadata.author) {
      suggestions.push({
        fieldName: 'authors',
        value: extraction.metadata.author
          .split(/\s*(?:;|\band\b)\s*/i)
          .map((value) => value.trim())
          .filter(Boolean),
        sourceKind: 'embedded-pdf',
      });
    }
    if (extraction.metadata.subject) {
      suggestions.push({
        fieldName: 'subject',
        value: extraction.metadata.subject,
        sourceKind: 'embedded-pdf',
      });
    }
    if (extraction.metadata.keywords) {
      suggestions.push({
        fieldName: 'keywords',
        value: extraction.metadata.keywords
          .split(/[,;]/)
          .map((value) => value.trim())
          .filter(Boolean),
        sourceKind: 'embedded-pdf',
      });
    }
    const pageTitle = firstPageTitle(extraction.firstPageText);
    if (pageTitle) {
      suggestions.push({ fieldName: 'title', value: pageTitle, sourceKind: 'first-page' });
    }
    for (const identifier of extractIdentifiers(
      [
        extraction.metadata.title,
        extraction.metadata.subject,
        extraction.metadata.keywords,
        extraction.firstPageText,
      ]
        .filter(Boolean)
        .join(' '),
    )) {
      identifiers.push({ ...identifier, sourceKind: 'first-page' });
    }
    if (extraction.firstPageText === '') warnings.push('PDF 首页没有可提取文本');
  }

  const fromFilename = filenameTitle(filePath);
  if (fromFilename) {
    suggestions.push({ fieldName: 'title', value: fromFilename, sourceKind: 'filename' });
  }
  return { suggestions, identifiers, warnings };
}
