import { readAiConfig } from '../../config/ai.js';
import { createGeminiGenerateContentClient } from '../../adapters/gemini-generate-content.js';
import { createOpenAiResponsesClient } from '../../adapters/openai-responses.js';
import { createAiService } from './ai.service.js';
import { createAiLimiter } from './ai.limiter.js';

/** Inicialización compartida por Express y pruebas con transporte sustituible. Sin peticiones al construir. */
export function createConfiguredAiService(source, { repository, onDiagnostic = () => {}, transport = {} }) {
  const config = readAiConfig(source);
  if (!config) return undefined;
  const client = config.provider === 'gemini'
    ? createGeminiGenerateContentClient(config, { ...transport, onDiagnostic })
    : createOpenAiResponsesClient(config, transport);
  return createAiService({ repository, client, limiter: createAiLimiter(config.rateLimit) });
}
