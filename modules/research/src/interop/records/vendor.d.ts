declare module '@citation-js/core' {
  export class Cite {
    constructor(data?: unknown);
    data: Array<Record<string, unknown>>;
    format(name: string, options?: Record<string, unknown>): string;
  }
  export const plugins: {
    config: {
      get(name: '@csl'): {
        styles: { add(name: string, value: string): void };
        locales: { add(name: string, value: string): void };
      };
    };
  };
}

declare module '@citation-js/plugin-bibtex';
declare module '@citation-js/plugin-ris';
declare module '@citation-js/plugin-csl';

declare module 'citeproc' {
  namespace CSL {
    interface System {
      retrieveLocale(language: string): string;
      retrieveItem(id: string): Record<string, unknown>;
    }

    class Engine {
      constructor(system: System, style: string, language?: string, forceLanguage?: boolean);
      setOutputFormat(format: 'text' | 'html'): void;
      updateItems(ids: string[]): void;
      makeBibliography(): [Record<string, unknown>, string[]];
      processCitationCluster(
        citation: {
          citationID: string;
          citationItems: Array<Record<string, unknown>>;
          properties: { noteIndex: number };
        },
        citationsPre: unknown[],
        citationsPost: unknown[],
      ): [unknown, Array<[unknown, string]>];
    }
  }
  export = CSL;
}

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
