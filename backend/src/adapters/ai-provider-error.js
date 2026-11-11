export class AiProviderError extends Error {
  constructor(kind) {
    super('AI provider unavailable');
    this.name = 'AiProviderError';
    this.kind = kind;
  }
}
