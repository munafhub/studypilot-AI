import { loadConfig } from './config.js';
import { openDatabase } from './db.js';
import { createLlm } from './llm/index.js';
import { createApp } from './app.js';

const config = loadConfig();
const db = openDatabase(config.dbPath);
const llm = createLlm(config);
const app = createApp({ db, config, llm });

const server = app.listen(config.port, () => {
  console.log(`StudyPilot AI listening on http://localhost:${config.port}`);
  console.log(
    llm.mode === 'anthropic'
      ? `AI mode: Anthropic (${llm.model})`
      : 'AI mode: DEMO (no ANTHROPIC_API_KEY set). Plans still work; explanations/quizzes are generic demo content.',
  );
});

const shutdown = () => server.close(() => { db.close(); process.exit(0); });
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
