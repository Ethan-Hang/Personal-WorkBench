import type { ResearchErrorCode } from '../contract.js';

export class AnnotationError extends Error {
  constructor(
    readonly code: Extract<ResearchErrorCode, `ANNOTATION_${string}`>,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AnnotationError';
  }
}
