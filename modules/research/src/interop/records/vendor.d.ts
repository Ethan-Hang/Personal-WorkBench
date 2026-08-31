declare module '@citation-js/core' {
  export class Cite {
    constructor(data?: unknown);
    data: Array<Record<string, unknown>>;
    format(name: string, options?: Record<string, unknown>): string;
  }
}

declare module '@citation-js/plugin-bibtex';
declare module '@citation-js/plugin-ris';

declare module '@retorquere/bibtex-parser' {
  export interface BibtexCreator {
    firstName?: string;
    lastName?: string;
    name?: string;
    suffix?: string;
    prefix?: string;
  }

  export interface BibtexEntry {
    type: string;
    key: string;
    fields: Record<string, unknown>;
    mode: Record<string, string>;
    input: string;
  }

  export interface BibtexParseError {
    error: string;
    input: string;
  }

  export interface BibtexParseResult {
    errors: BibtexParseError[];
    entries: BibtexEntry[];
    comments: unknown[];
    strings: Record<string, unknown>;
    preamble: unknown[];
    jabref: unknown;
  }

  export function parse(
    input: string,
    options?: { sentenceCase?: boolean; unsupported?: 'ignore' | 'error' },
  ): BibtexParseResult;
}
