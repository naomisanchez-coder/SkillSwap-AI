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

function httpCategory(status) {
  if (status === 400) return 'BAD_REQUEST';
  if (status === 401 || status === 403) return 'FORBIDDEN';
  if (status === 429) return 'LIMITED';
  if (status >= 500 && status <= 599) return 'UPSTREAM';
  return 'HTTP_ERROR';
}

export function createGeminiGenerateContentClient(config, { fetchImpl = fetch, setTimer = setTimeout,
  clearTimer = clearTimeout, now = Date.now, onDiagnostic = () => {} } = {}) {
  if (!config || config.provider !== 'gemini') throw new Error('Gemini configuration required');
  const headers = Object.freeze({ 'x-goog-api-key': config.apiKey, 'Content-Type': 'application/json' });
  const emit = value => {
    try { onDiagnostic(Object.freeze({ provider: 'gemini', model: config.model, ...value })); } catch {}
  };

  async function timedFetch(operation, url, options = {}) {
    const startedAt = now();
    const controller = new AbortController();
    const timer = setTimer(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetchImpl(url, { ...options, signal: controller.signal,
        headers: { ...headers, ...options.headers } });
      return { response, durationMs: Math.max(0, now() - startedAt) };
    } catch (error) {
      const category = error?.name === 'AbortError' ? 'TIMEOUT' : 'TRANSPORT';
      emit({ operation, outcome: 'error', category, status: null,
        durationMs: Math.max(0, now() - startedAt) });
      throw new AiProviderError(category === 'TIMEOUT' ? 'TIMEOUT' : 'UNAVAILABLE');
    } finally {
      clearTimer(timer);
    }
  }

  function rejectHttp(operation, response, durationMs) {
    const category = httpCategory(response.status);
    emit({ operation, outcome: 'error', category, status: response.status, durationMs });
    throw new AiProviderError(category === 'LIMITED' ? 'LIMITED' : 'UNAVAILABLE');
  }

  function rejectInvalid(operation, status, durationMs) {
    emit({ operation, outcome: 'error', category: 'INVALID_RESPONSE', status, durationMs });
    throw new AiProviderError('INVALID_RESPONSE');
  }

  return Object.freeze({
    async listModels() {
      const operation = 'listModels';
      const { response, durationMs } = await timedFetch(operation, `${API_ROOT}/models`);
      if (!response.ok) rejectHttp(operation, response, durationMs);
      let body;
      try { body = await response.json(); } catch { rejectInvalid(operation, response.status, durationMs); }
      if (!Array.isArray(body?.models)) rejectInvalid(operation, response.status, durationMs);
      const models = body.models.filter(model => Array.isArray(model?.supportedGenerationMethods) &&
        model.supportedGenerationMethods.includes('generateContent') &&
        typeof model.name === 'string').map(model => Object.freeze({
        name: model.name, displayName: typeof model.displayName === 'string' ? model.displayName : null,
        inputTokenLimit: Number.isSafeInteger(model.inputTokenLimit) ? model.inputTokenLimit : null,
        outputTokenLimit: Number.isSafeInteger(model.outputTokenLimit) ? model.outputTokenLimit : null,
      }));
      emit({ operation, outcome: 'success', category: 'SUCCESS', status: response.status, durationMs });
      return models;
    },
    async respond({ instructions, input }) {
      const operation = 'generateContent';
      const model = modelResource(config.model);
      const { response, durationMs } = await timedFetch(operation,
        `${API_ROOT}/${encodeURI(model)}:generateContent`, {
        method: 'POST',
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: instructions }] },
          contents: input.map(item => ({ role: item.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: item.content }] })),
          generationConfig: { maxOutputTokens: config.maximumOutputTokens },
          store: false,
        }),
      });
      if (!response.ok) rejectHttp(operation, response, durationMs);
      let body;
      try { body = await response.json(); } catch { rejectInvalid(operation, response.status, durationMs); }
      const text = responseText(body);
      if (!text) rejectInvalid(operation, response.status, durationMs);
      emit({ operation, outcome: 'success', category: 'SUCCESS', status: response.status, durationMs });
      return text;
    },
  });
}
