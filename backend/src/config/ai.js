function integer(source, key, fallback, minimum, maximum) {
  const raw = source[key] === undefined || source[key] === '' ? String(fallback) : source[key];
  if (!/^[1-9]\d*$/.test(raw ?? '')) throw new Error('Invalid AI configuration');
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error('Invalid AI configuration');
  return value;
}

export function readAiConfig(source) {
  if (source.AI_ENABLED === undefined || source.AI_ENABLED === '' || source.AI_ENABLED === 'false') return null;
  if (source.AI_ENABLED !== 'true' || source.AI_PROVIDER !== 'openai') throw new Error('Invalid AI configuration');
  const apiKey = source.AI_API_KEY;
  const model = source.AI_MODEL;
  if (typeof apiKey !== 'string' || apiKey.length < 20 || apiKey.length > 512 || /[\s\r\n\0]/.test(apiKey) ||
      typeof model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/.test(model)) {
    throw new Error('Invalid AI configuration');
  }
  return Object.freeze({ provider: 'openai', apiKey, model,
    maximumOutputTokens: integer(source, 'AI_MAX_OUTPUT_TOKENS', 300, 32, 1000),
    timeoutMs: integer(source, 'AI_TIMEOUT_MS', 10000, 1000, 30000),
    rateLimit: Object.freeze({ maximum: integer(source, 'AI_RATE_LIMIT_MAX_REQUESTS', 10, 1, 60),
      windowMs: integer(source, 'AI_RATE_LIMIT_WINDOW_SECONDS', 60, 10, 3600) * 1000 }),
  });
}
