import type { ResearchErrorCode } from '../contract.js';

export class ReaderError extends Error {
  constructor(
    readonly code: Extract<ResearchErrorCode, `READER_${string}`>,
    message: string,
    readonly status: number,
    readonly details?: unknown,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ReaderError';
  }
}
