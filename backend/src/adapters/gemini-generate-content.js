import { AiProviderError } from './ai-provider-error.js';

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';

function responseDetails(body) {
  const details = {};
  if (Array.isArray(body?.candidates)) details.candidateCount = body.candidates.length;
  const finish = body?.candidates?.[0]?.finishReason;
  const block = body?.promptFeedback?.blockReason;
  const finishValues = ['STOP', 'MAX_TOKENS', 'SAFETY', 'RECITATION', 'LANGUAGE', 'OTHER', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'MALFORMED_FUNCTION_CALL', 'IMAGE_SAFETY', 'FINISH_REASON_UNSPECIFIED'];
  const blockValues = ['SAFETY', 'OTHER', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'IMAGE_SAFETY', 'BLOCK_REASON_UNSPECIFIED'];
  if (finish !== undefined) details.finishReason = finishValues.includes(finish) ? finish : 'UNKNOWN';
  if (block !== undefined) details.blockReason = blockValues.includes(block) ? block : 'UNKNOWN';
  for (const key of ['thoughtsTokenCount', 'candidatesTokenCount']) if (Number.isSafeInteger(body?.usageMetadata?.[key]) && body.usageMetadata[key] >= 0) details[key] = body.usageMetadata[key];
  return details;
}
function responseText(body) {
  if (body?.promptFeedback?.blockReason && body.promptFeedback.blockReason !== 'BLOCK_REASON_UNSPECIFIED') return null;
  const candidate = body?.candidates?.[0];
  if (!candidate || (candidate.finishReason && !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason))) return null;
  const text = (Array.isArray(candidate.content?.parts) ? candidate.content.parts : [])
    .filter(part => part?.thought !== true && typeof part?.text === 'string').map(part => part.text).join('').trim();
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
    let responseStatus = null;
    try {
      const response = await fetchImpl(url, { ...options, signal: controller.signal,
        headers: { ...headers, ...options.headers } });
      responseStatus = response.status;
      // Mantener el plazo también mientras se recibe y analiza el cuerpo.
      let body;
      if (response.ok) {
        try { body = await response.json(); }
        catch (error) { if (controller.signal.aborted || error?.name === 'AbortError') throw error; rejectInvalid(operation, response.status, Math.max(0, now() - startedAt)); }
      }
      return { response, body, durationMs: Math.max(0, now() - startedAt) };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      const category = controller.signal.aborted || error?.name === 'AbortError' ? 'TIMEOUT' : 'TRANSPORT';
      emit({ operation, outcome: 'error', category, status: responseStatus,
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

  function rejectInvalid(operation, status, durationMs, details = {}) {
    emit({ ...details, operation, outcome: 'error', category: 'INVALID_RESPONSE', status, durationMs });
    throw new AiProviderError('INVALID_RESPONSE');
  }

  return Object.freeze({
    async listModels() {
      const operation = 'listModels';
      const { response, body, durationMs } = await timedFetch(operation, `${API_ROOT}/models`);
      if (!response.ok) rejectHttp(operation, response, durationMs);
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
      const { response, body, durationMs } = await timedFetch(operation,
        `${API_ROOT}/${encodeURI(model)}:generateContent`, {
        method: 'POST',
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: instructions }] },
          contents: input.map(item => ({ role: item.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: item.content }] })),
          generationConfig: { maxOutputTokens: config.maximumOutputTokens },
        }),
      });
      if (!response.ok) rejectHttp(operation, response, durationMs);
      const text = responseText(body);
      const details = responseDetails(body);
      if (!text) rejectInvalid(operation, response.status, durationMs, details);
      emit({ ...details, operation, outcome: 'success', category: 'SUCCESS', status: response.status, durationMs });
      return text;
    },
  });
}
