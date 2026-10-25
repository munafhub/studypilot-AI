import { HttpError } from '../errors.js';

/** Gemini REST adapter that preserves the app's existing tool-call interface. */
export function createGeminiProvider({ apiKey, model, fetchImpl = globalThis.fetch, timeoutMs = 45000, logger = console }) {
  const toolNamesById = new Map();

  function toGeminiContents(messages = []) {
    const contents = [];
    for (const message of messages) {
      const role = message.role === 'assistant' ? 'model' : 'user';
      const value = message.content;
      if (typeof value === 'string') {
        contents.push({ role, parts: [{ text: value }] });
        continue;
      }
      if (!Array.isArray(value)) continue;
      if (role === 'model') {
        const parts = value.flatMap((block) => {
          if (block.type === 'text') return [{ text: block.text }];
          if (block.type === 'tool_use') {
            toolNamesById.set(block.id, block.name);
            return [{ functionCall: { name: block.name, args: block.input ?? {} } }];
          }
          return [];
        });
        if (parts.length) contents.push({ role: 'model', parts });
      } else {
        const parts = value.flatMap((block) => {
          if (block.type === 'tool_result') {
            const name = toolNamesById.get(block.tool_use_id) || 'unknown_tool';
            let response = block.content;
            try { response = JSON.parse(block.content); } catch {}
            return [{ functionResponse: { name, response: { result: response, isError: Boolean(block.is_error) } } }];
          }
          if (block.type === 'text') return [{ text: block.text }];
          return [];
        });
        if (parts.length) contents.push({ role: 'user', parts });
      }
    }
    return contents;
  }

  return {
    mode: 'gemini',
    model,
    async complete({ system, messages, tools, toolChoice, maxTokens = 1500 }) {
      const body = {
        systemInstruction: { parts: [{ text: system || 'You are a helpful study assistant.' }] },
        contents: toGeminiContents(messages),
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 },
      };
      if (tools?.length) {
        body.tools = [{ functionDeclarations: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema,
        })) }];
        const mode = toolChoice?.type === 'tool' ? 'ANY' : toolChoice?.type === 'auto' ? 'AUTO' : 'AUTO';
        body.toolConfig = { functionCallingConfig: {
          mode,
          ...(toolChoice?.type === 'tool' && toolChoice.name ? { allowedFunctionNames: [toolChoice.name] } : {}),
        } };
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        throw new HttpError(503, 'AI_UNAVAILABLE', err?.name === 'AbortError' ? 'The AI service took too long to respond.' : 'The AI service could not be reached.');
      } finally { clearTimeout(timer); }

      if (!response.ok) {
        logger.error?.(`Gemini API returned HTTP ${response.status}`);
        if (response.status === 429) throw new HttpError(503, 'AI_BUSY', 'The AI service is busy or its usage limit was reached. Please try again later.');
        throw new HttpError(503, 'AI_UNAVAILABLE', 'The Gemini AI service is unavailable. Check the API key, model, and API access.');
      }
      const data = await response.json();
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      const content = [];
      for (const part of parts) {
        if (part.text) content.push({ type: 'text', text: part.text });
        if (part.functionCall) {
          const id = `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          toolNamesById.set(id, part.functionCall.name);
          content.push({ type: 'tool_use', id, name: part.functionCall.name, input: part.functionCall.args ?? {} });
        }
      }
      return { content, stopReason: data.candidates?.[0]?.finishReason ?? 'STOP' };
    },
  };
}
