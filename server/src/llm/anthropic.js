import { HttpError } from '../errors.js';

/** Minimal Anthropic Messages API client (tool calling). The API key never leaves the server. */
export function createAnthropicProvider({
  apiKey,
  model,
  fetchImpl = globalThis.fetch,
  timeoutMs = 45000,
  baseUrl = 'https://api.anthropic.com',
  logger = console,
}) {
  return {
    mode: 'anthropic',
    model,
    async complete({ system, messages, tools, toolChoice, maxTokens = 1500 }) {
      const body = { model, max_tokens: maxTokens, system, messages };
      if (tools) body.tools = tools;
      if (toolChoice) body.tool_choice = toolChoice;

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      let res;
      try {
        res = await fetchImpl(`${baseUrl}/v1/messages`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
      } catch (err) {
        throw new HttpError(
          503,
          'AI_UNAVAILABLE',
          err?.name === 'AbortError' ? 'The AI service took too long to respond.' : 'The AI service could not be reached.',
        );
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        logger.error(`Anthropic API returned HTTP ${res.status}`);
        if (res.status === 429) throw new HttpError(503, 'AI_BUSY', 'The AI service is busy. Please try again shortly.');
        throw new HttpError(503, 'AI_UNAVAILABLE', 'The AI service is currently unavailable.');
      }
      const data = await res.json();
      return { content: Array.isArray(data.content) ? data.content : [], stopReason: data.stop_reason };
    },
  };
}
