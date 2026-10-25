export const TOOLS = {
  get_tasks: {
    name: 'get_tasks',
    description: "Read the student's unfinished tasks (id, title, subject, dueDate, priority 1-3, remainingMinutes).",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  get_available_time: {
    name: 'get_available_time',
    description: 'Get the minutes the student can study on each date in a range (inclusive).',
    input_schema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'YYYY-MM-DD' },
        endDate: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: ['startDate', 'endDate'],
    },
  },
  propose_plan: {
    name: 'propose_plan',
    description: 'Submit the proposed study schedule. The student must approve it before it is saved.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'One or two sentences explaining the plan.' },
        sessions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              taskId: { type: 'integer' },
              date: { type: 'string', description: 'YYYY-MM-DD' },
              minutes: { type: 'integer' },
              note: { type: 'string', description: 'Short focus for the session' },
            },
            required: ['taskId', 'date', 'minutes'],
          },
        },
      },
      required: ['sessions'],
    },
  },
  submit_explanation: {
    name: 'submit_explanation',
    description: 'Submit the explanation of the topic.',
    input_schema: {
      type: 'object',
      properties: {
        explanation: { type: 'string' },
        keyPoints: { type: 'array', items: { type: 'string' } },
      },
      required: ['explanation', 'keyPoints'],
    },
  },
  submit_quiz: {
    name: 'submit_quiz',
    description: 'Submit the multiple-choice quiz.',
    input_schema: {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              question: { type: 'string' },
              options: { type: 'array', items: { type: 'string' } },
              answerIndex: { type: 'integer', description: 'Index 0-3 of the correct option' },
              explanation: { type: 'string' },
            },
            required: ['question', 'options', 'answerIndex', 'explanation'],
          },
        },
      },
      required: ['questions'],
    },
  },
  submit_syllabus_items: {
    name: 'submit_syllabus_items',
    description: 'Submit the extracted syllabus items.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              dueDate: { type: ['string', 'null'] },
              kind: { type: 'string', enum: ['exam', 'deadline', 'event', 'topic'] },
            },
            required: ['title', 'dueDate', 'kind'],
          },
        },
      },
      required: ['items'],
    },
  },
};
