export class AiProviderError extends Error {
  constructor(kind) { super('AI provider unavailable'); this.name = 'AiProviderError'; this.kind = kind; }
}

function outputText(body) {
  if (!body || !Array.isArray(body.output)) return null;
  const text = body.output.flatMap(item => item?.type === 'message' && Array.isArray(item.content)
    ? item.content.filter(part => part?.type === 'output_text' && typeof part.text === 'string').map(part => part.text)
    : []).join('').trim();
  return text && text.length <= 12000 ? text : null;
}

export function createOpenAiResponsesClient(config, { fetchImpl = fetch, setTimer = setTimeout,
  clearTimer = clearTimeout } = {}) {
  if (!config || config.provider !== 'openai') throw new Error('OpenAI configuration required');
  return Object.freeze({
    async respond({ instructions, input }) {
      const controller = new AbortController();
      const timer = setTimer(() => controller.abort(), config.timeoutMs);
      try {
        const response = await fetchImpl('https://api.openai.com/v1/responses', {
          method: 'POST', signal: controller.signal,
          headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: config.model, instructions, input,
            max_output_tokens: config.maximumOutputTokens, store: false }),
        });
        if (response.status === 429) throw new AiProviderError('LIMITED');
        if (!response.ok) throw new AiProviderError('UNAVAILABLE');
        const text = outputText(await response.json());
        if (!text) throw new AiProviderError('INVALID_RESPONSE');
        return text;
      } catch (error) {
        if (error instanceof AiProviderError) throw error;
        throw new AiProviderError(error?.name === 'AbortError' ? 'TIMEOUT' : 'UNAVAILABLE');
      } finally { clearTimer(timer); }
    },
  });
}
