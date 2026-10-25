import { createAnthropicProvider } from './anthropic.js';
import { createGeminiProvider } from './gemini.js';
import { createMockProvider } from './mock.js';

export function createLlm(config, logger = console) {
  const { aiProvider, anthropicApiKey, anthropicModel, geminiApiKey, geminiModel } = config;
  if (aiProvider === 'mock') return createMockProvider();
  if (aiProvider === 'anthropic') {
    if (!anthropicApiKey) throw new Error('AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY.');
    return createAnthropicProvider({ apiKey: anthropicApiKey, model: anthropicModel, logger });
  }
  if (aiProvider === 'gemini') {
    if (!geminiApiKey) throw new Error('AI_PROVIDER=gemini requires GEMINI_API_KEY.');
    return createGeminiProvider({ apiKey: geminiApiKey, model: geminiModel, logger });
  }
  if (geminiApiKey) return createGeminiProvider({ apiKey: geminiApiKey, model: geminiModel, logger });
  if (anthropicApiKey) return createAnthropicProvider({ apiKey: anthropicApiKey, model: anthropicModel, logger });
  return createMockProvider();
}
