import { AiProviderError } from './ai-provider-error.js';

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';

function responseText(body) {
  if (!body || !Array.isArray(body.candidates)) return null;
  const text = body.candidates.flatMap(candidate => Array.isArray(candidate?.content?.parts)
    ? candidate.content.parts.filter(part => typeof part?.text === 'string').map(part => part.text)
    : []).join('').trim();
  return text && text.length <= 12000 ? text : null;
}

function modelResource(model) {
  return model.startsWith('models/') ? model : `models/${model}`;
}

function requestError(error) {
  if (error instanceof AiProviderError) return error;
  return new AiProviderError(error?.name === 'AbortError' ? 'TIMEOUT' : 'UNAVAILABLE');
}

export function createGeminiGenerateContentClient(config, { fetchImpl = fetch, setTimer = setTimeout,
  clearTimer = clearTimeout } = {}) {
  if (!config || config.provider !== 'gemini') throw new Error('Gemini configuration required');
  const headers = Object.freeze({ 'x-goog-api-key': config.apiKey, 'Content-Type': 'application/json' });

  async function timedFetch(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimer(() => controller.abort(), config.timeoutMs);
    try {
      return await fetchImpl(url, { ...options, signal: controller.signal,
        headers: { ...headers, ...options.headers } });
    } catch (error) {
      throw requestError(error);
    } finally {
      clearTimer(timer);
    }
  }

  return Object.freeze({
    async listModels() {
      const response = await timedFetch(`${API_ROOT}/models`);
      if (response.status === 429) throw new AiProviderError('LIMITED');
      if (!response.ok) throw new AiProviderError('UNAVAILABLE');
      const body = await response.json();
      if (!Array.isArray(body?.models)) throw new AiProviderError('INVALID_RESPONSE');
      return body.models.filter(model => Array.isArray(model?.supportedGenerationMethods) &&
        model.supportedGenerationMethods.includes('generateContent') &&
        typeof model.name === 'string').map(model => Object.freeze({
        name: model.name, displayName: typeof model.displayName === 'string' ? model.displayName : null,
        inputTokenLimit: Number.isSafeInteger(model.inputTokenLimit) ? model.inputTokenLimit : null,
        outputTokenLimit: Number.isSafeInteger(model.outputTokenLimit) ? model.outputTokenLimit : null,
      }));
    },
    async respond({ instructions, input }) {
      const model = modelResource(config.model);
      const response = await timedFetch(`${API_ROOT}/${encodeURI(model)}:generateContent`, {
        method: 'POST',
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: instructions }] },
          contents: input.map(item => ({ role: item.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: item.content }] })),
          generationConfig: { maxOutputTokens: config.maximumOutputTokens },
          store: false,
        }),
      });
      if (response.status === 429) throw new AiProviderError('LIMITED');
      if (!response.ok) throw new AiProviderError('UNAVAILABLE');
      const text = responseText(await response.json());
      if (!text) throw new AiProviderError('INVALID_RESPONSE');
      return text;
    },
  });
}
