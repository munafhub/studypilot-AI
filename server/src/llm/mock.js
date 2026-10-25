// Offline "demo" provider. It answers the same forced tool calls as the real model with clearly labelled
// generic content so the whole app can be tried without an API key. Real planning never uses it.
const TEMPLATES = [
  ['Which habit helps you remember "{t}" for the long term?', 'Active recall spaced over several days', ['Re-reading the notes once', 'Highlighting every line', 'Cramming the night before'], 'Retrieving information from memory, repeated over time, beats passive review.'],
  ['What is a good first step when starting to learn "{t}"?', 'Skim the outline, then list what you already know', ['Memorise every definition immediately', 'Skip to the hardest problems', 'Wait until the exam is near'], 'Previewing structure and activating prior knowledge makes new material easier to place.'],
  ['How should you check that you understand "{t}"?', 'Explain it in your own words without notes', ['Copy the textbook explanation', 'Read it aloud twice', 'Ask a friend to summarise it for you'], 'If you can teach it simply, you probably understand it.'],
  ['What is the best use of practice questions on "{t}"?', 'Attempt them before looking at solutions', ['Read the solutions first', 'Only do the easy ones', 'Do them once and never revisit'], 'Struggling productively before checking answers strengthens learning.'],
  ['When you get a question about "{t}" wrong, what should you do?', 'Work out why, then retry it later', ['Ignore it and move on', 'Memorise the answer letter', 'Assume the question was unfair'], 'Errors show gaps; revisiting them later closes the gaps.'],
  ['How long should a focused study block on "{t}" usually be?', '25 to 50 minutes with a short break', ['6 hours without a break', '2 minutes', 'Exactly until you feel tired'], 'Focused blocks with breaks keep attention high.'],
  ['Which is a sign you should review "{t}" again?', 'You cannot recall it without looking', ['You recognise it when you see it', 'You studied it once last month', 'It looks familiar in your notes'], 'Recognition is not the same as recall.'],
  ['What helps connect "{t}" to other topics?', 'Drawing a concept map', ['Studying it in isolation', 'Deleting related notes', 'Memorising unrelated facts'], 'Linking ideas builds a network that is easier to retrieve.'],
];

const topicOf = (messages) => {
  const text = JSON.stringify(messages);
  const m = /<topic>(.*?)<\/topic>/.exec(text.replace(/\\"/g, '"'));
  return (m ? m[1] : 'this topic').slice(0, 120);
};
const countOf = (messages) => {
  const m = /<count>(\d+)<\/count>/.exec(JSON.stringify(messages));
  return m ? Number(m[1]) : 5;
};

export function createMockProvider() {
  return {
    mode: 'mock',
    model: 'demo',
    async complete({ messages, toolChoice }) {
      const name = toolChoice?.name;
      const topic = topicOf(messages);
      if (name === 'submit_explanation') {
        return {
          stopReason: 'tool_use',
          content: [{
            type: 'tool_use', id: 'mock_1', name,
            input: {
              explanation: `[Demo mode - no AI key is configured] Here is a study approach for "${topic}". Start by writing down what you already know, then read an overview and list the key terms. Next, explain each idea in your own words, and finish with practice questions. Add an ANTHROPIC_API_KEY on the server to get a real AI explanation of this topic.`,
              keyPoints: ['Activate what you already know', 'Learn the key terms', 'Explain ideas in your own words', 'Practise with questions'],
            },
          }],
        };
      }
      if (name === 'submit_quiz') {
        const n = Math.min(countOf(messages), 10);
        const questions = Array.from({ length: n }, (_, i) => {
          const [q, correct, wrong, why] = TEMPLATES[i % TEMPLATES.length];
          const options = [...wrong];
          const answerIndex = i % 4;
          options.splice(answerIndex, 0, correct);
          return { question: q.replace('{t}', topic), options, answerIndex, explanation: `[Demo] ${why}` };
        });
        return { stopReason: 'tool_use', content: [{ type: 'tool_use', id: 'mock_2', name, input: { questions } }] };
      }
      return { stopReason: 'end_turn', content: [{ type: 'text', text: 'Demo mode: no tool call was requested.' }] };
    },
  };
}
