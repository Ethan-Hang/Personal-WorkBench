import type { ResearchErrorCode } from '../contract.js';

export class KnowledgeError extends Error {
  constructor(
    readonly code: Extract<ResearchErrorCode, `KNOWLEDGE_${string}`>,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'KnowledgeError';
  }
}
