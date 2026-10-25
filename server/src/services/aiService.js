import { HttpError } from '../errors.js';
import { EXPLAIN_SYSTEM, QUIZ_SYSTEM, EXTRACT_SYSTEM } from '../prompts.js';
import { TOOLS } from './tools.js';
import { validateExplanation, validateQuiz, validateSyllabusItems } from './validators.js';
import { parseSyllabusText } from './syllabusParser.js';

/** Force one tool call and validate its input; retry once with the validation feedback. */
async function structuredCall({ llm, system, tool, userText, validate, logger }) {
  const messages = [{ role: 'user', content: userText }];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await llm.complete({
      system,
      messages,
      tools: [tool],
      toolChoice: { type: 'tool', name: tool.name },
      maxTokens: 3500,
    });
    const tu = res.content.find((b) => b.type === 'tool_use' && b.name === tool.name);
    const checked = tu ? validate(tu.input) : { ok: false, errors: ['no tool call was returned'] };
    if (checked.ok) return checked.value;
    logger.warn?.(`AI output failed validation (attempt ${attempt + 1}): ${checked.errors?.join('; ')}`);
    messages.push({ role: 'assistant', content: res.content });
    messages.push({
      role: 'user',
      content: tu
        ? [{ type: 'tool_result', tool_use_id: tu.id, is_error: true, content: `Invalid output: ${checked.errors.join('; ')}. Call ${tool.name} again with a corrected version.` }]
        : `You must call ${tool.name}.`,
    });
  }
  throw new HttpError(502, 'AI_INVALID_OUTPUT', 'The AI returned an answer we could not use. Please try again.');
}

export async function explainTopic({ llm, logger }, { topic, level }) {
  const value = await structuredCall({
    llm, logger, system: EXPLAIN_SYSTEM, tool: TOOLS.submit_explanation,
    userText: `Explain this topic for a ${level} student.\n<topic>${topic}</topic>`,
    validate: validateExplanation,
  });
  return { topic, level, ...value, mode: llm.mode };
}

export async function createQuiz({ llm, logger }, { topic, count, difficulty }) {
  const value = await structuredCall({
    llm, logger, system: QUIZ_SYSTEM, tool: TOOLS.submit_quiz,
    userText: `Write a ${difficulty} multiple-choice quiz.\n<topic>${topic}</topic>\n<count>${count}</count>`,
    validate: (input) => validateQuiz(input, count),
  });
  return { topic, difficulty, ...value, mode: llm.mode };
}

/** Syllabus text -> draft items. Uses the model when available, else (or on failure) the heuristic parser. */
export async function extractSyllabusItems({ llm, logger, now }, text) {
  if (['anthropic', 'gemini'].includes(llm.mode)) {
    try {
      const items = await structuredCall({
        llm, logger, system: EXTRACT_SYSTEM, tool: TOOLS.submit_syllabus_items,
        userText: `Extract the items from this syllabus text:\n<syllabus>\n${text.slice(0, 14000)}\n</syllabus>`,
        validate: validateSyllabusItems,
      });
      return { items, usedAI: true };
    } catch (err) {
      logger.warn?.(`AI syllabus extraction failed (${err.code ?? err.message}); using the built-in parser.`);
    }
  }
  return { items: parseSyllabusText(text, { now: now() }), usedAI: false };
}
