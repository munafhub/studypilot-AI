import { PLANNER_SYSTEM } from '../prompts.js';
import { TOOLS } from './tools.js';
import { validatePlanProposal } from './validators.js';
import { eachDay, isValidDate } from '../utils/dates.js';
import { capacityFor } from './scheduler.js';

const MAX_STEPS = 6;
const PLANNING_TOOLS = [TOOLS.get_tasks, TOOLS.get_available_time, TOOLS.propose_plan];

/**
 * Tool-calling planning agent.
 * The model can only READ this student's data (tools are bound to ctx, never to a model-supplied user id)
 * and PROPOSE a plan. The proposal is validated here; nothing is saved by the agent.
 * Returns { sessions, summary } or null when the model never produced a valid plan.
 */
export async function runPlanningAgent({ llm, tasks, availability, startDate, endDate, used = {}, request, logger = console }) {
  const messages = [{ role: 'user', content: request }];
  const ctx = { tasks, availability, startDate, endDate, used };

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const res = await llm.complete({
      system: PLANNER_SYSTEM,
      messages,
      tools: PLANNING_TOOLS,
      toolChoice: { type: 'auto' },
      maxTokens: 3000,
    });
    messages.push({ role: 'assistant', content: res.content });

    const toolUses = res.content.filter((b) => b.type === 'tool_use');
    if (toolUses.length === 0) {
      messages.push({ role: 'user', content: 'Please call propose_plan now with your schedule.' });
      continue;
    }

    const results = [];
    let accepted = null;
    for (const tu of toolUses) {
      const out = executeTool(tu, ctx);
      if (tu.name === 'propose_plan' && out.validated?.ok) accepted = out.validated;
      results.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: out.content,
        ...(out.isError ? { is_error: true } : {}),
      });
    }
    if (accepted) return { sessions: accepted.sessions, summary: accepted.summary };
    messages.push({ role: 'user', content: results });
  }
  logger.warn?.('Planning agent did not produce a valid plan; falling back to the built-in scheduler.');
  return null;
}

function executeTool(tu, ctx) {
  const input = tu.input ?? {};
  switch (tu.name) {
    case 'get_tasks':
      return {
        content: JSON.stringify(
          ctx.tasks.map((t) => ({
            id: t.id, title: t.title, subject: t.subject ?? '', dueDate: t.dueDate, priority: t.priority, remainingMinutes: t.remaining,
          })),
        ),
      };
    case 'get_available_time': {
      const { startDate, endDate } = input;
      if (!isValidDate(startDate) || !isValidDate(endDate) || startDate > endDate) {
        return { isError: true, content: 'startDate and endDate must be valid YYYY-MM-DD dates with startDate <= endDate.' };
      }
      const from = startDate < ctx.startDate ? ctx.startDate : startDate;
      const to = endDate > ctx.endDate ? ctx.endDate : endDate;
      const days = from <= to ? eachDay(from, to) : [];
      return { content: JSON.stringify(days.map((date) => ({ date, availableMinutes: capacityFor(date, ctx.availability, ctx.used) }))) };
    }
    case 'propose_plan': {
      const validated = validatePlanProposal(input, ctx);
      if (validated.ok) return { content: 'Plan accepted for the student to review.', validated };
      return { isError: true, content: `The plan was rejected:\n- ${validated.errors.slice(0, 10).join('\n- ')}`, validated };
    }
    default:
      return { isError: true, content: `Unknown tool "${tu.name}".` };
  }
}
