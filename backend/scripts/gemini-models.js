import 'dotenv/config';
import { createGeminiGenerateContentClient } from '../src/adapters/gemini-generate-content.js';

const key = process.env.GEMINI_API_KEY;
if (process.env.AI_PROVIDER !== 'gemini' || typeof key !== 'string' || key.length < 20 ||
    key.length > 512 || /[\s\r\n\0]/.test(key)) {
  console.error('Gemini discovery configuration is incomplete');
  process.exitCode = 1;
} else {
  const timeout = Number(process.env.AI_TIMEOUT_MS ?? 10000);
  if (!Number.isSafeInteger(timeout) || timeout < 1000 || timeout > 30000) {
    console.error('Gemini discovery timeout is invalid');
    process.exitCode = 1;
  } else {
    const client = createGeminiGenerateContentClient({ provider: 'gemini', apiKey: key,
      model: 'discovery-only', timeoutMs: timeout, maximumOutputTokens: 32 });
    try {
      const models = await client.listModels();
      for (const model of models) console.info(model.name.replace(/^models\//, ''));
      if (models.length === 0) process.exitCode = 2;
    } catch {
      console.error('Unable to list Gemini models for this project');
      process.exitCode = 1;
    }
  }
}
