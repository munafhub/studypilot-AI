# StudyPilot AI

A web app that helps students organise study tasks, build a realistic study plan, and learn topics with AI explanations and quizzes.
Built from the *Week 6 Project Proposal*.

**Stack:** React (Vite) · Node.js + Express · SQLite · Anthropic Claude API with tool/function calling · Vitest + Supertest

## Features (all MVP items)

| Proposal requirement | Where it lives |
| --- | --- |
| Register / log in securely | `server/src/routes/auth.js` (scrypt password hashing, hashed revocable session tokens, rate limiting) |
| Add, edit, complete, delete tasks | `server/src/routes/tasks.js`, `client/src/pages/TasksPage.jsx` |
| Upload text-based syllabus PDF, review extracted topics/dates **before saving** | `POST /api/syllabus/extract` (draft only) → review table → `POST /api/syllabus/confirm` |
| Daily or weekly study plan from tasks + available time | `server/src/services/planService.js`, `scheduler.js`, `agent.js` |
| Revise plan when sessions are missed; student approves before it is saved | `POST /api/plans/revise` creates a *draft*; nothing changes until `POST /api/plans/:id/approve` |
| AI explains a topic and generates a short quiz | `POST /api/ai/explain`, `POST /api/ai/quiz`, `LearnPage.jsx` |
| AI agent with limited backend tools | `server/src/services/agent.js` + `tools.js` |
| Server-side validation of AI output | `server/src/services/validators.js` |
| API key only on backend; users see only their own data | `llm/anthropic.js`; every query is scoped by `user_id` |

## Quick start

Requires **Node.js 22.13 or newer** (uses the built-in `node:sqlite`, so there is no native module to compile).

```bash
npm install
cp .env.example server/.env        # optional - add ANTHROPIC_API_KEY for real AI
npm run seed                        # optional demo user: demo@studypilot.test / demo12345
npm run dev                         # API on :3001, web app on http://localhost:5173
```

Production style (single server, serves the built React app):

```bash
npm run build
npm start                           # http://localhost:3001
```

### AI modes

* **With `ANTHROPIC_API_KEY`** – plans are produced by a Claude tool-calling agent (validated server-side), explanations/quizzes/syllabus parsing are real AI output. Model defaults to `claude-sonnet-5-5`; override with `ANTHROPIC_MODEL`.
* **Without a key (demo mode)** – the app is fully usable. Plans use the built-in deterministic scheduler, syllabus extraction uses the built-in parser, and explanations/quizzes return generic content clearly labelled `[Demo]`. A banner in the UI says so.

If the AI is unreachable or returns an invalid plan, plan generation automatically falls back to the built-in scheduler and tells the student.

### Try it quickly

```bash
npm run sample-pdf --workspace server   # writes server/sample-syllabus.pdf
```
Upload it on the **Syllabus** page. A step-by-step demo script is in [`docs/DEMO.md`](docs/DEMO.md).

## How the AI agent stays safe

1. The model only gets **three tools**: `get_tasks`, `get_available_time`, `propose_plan`. Tools are bound to the logged-in user on the server; the model cannot pass a user id.
2. `propose_plan` input is **validated** (task ownership, dates in range, no scheduling after due date, minutes per task and per day within limits). Errors are fed back to the model for up to 6 steps, then the built-in scheduler takes over.
3. A plan is saved only as a **draft**. The student must press *Approve* – for new plans *and* for revisions. Revisions also refuse to apply if the saved plan changed after the draft was made.
4. Explanations, quizzes and syllabus items are forced through a single tool call and validated (e.g. exactly 4 distinct quiz options, valid ISO dates).
5. User text (topics, task titles, syllabus text) is passed as tagged data and the system prompts tell the model to treat it as untrusted.
6. The API key never leaves the server and is never included in error messages.

## API overview

All routes except register/login need `Authorization: Bearer <token>`. Errors look like `{ "error": { "code", "message", "fields?" } }`.

| Method & path | Purpose |
| --- | --- |
| `POST /api/auth/register`, `/login`, `/logout`; `GET /api/auth/me` | Accounts and sessions |
| `GET/PUT /api/settings` | Name and available minutes per weekday |
| `GET/POST /api/tasks`, `GET/PUT/PATCH/DELETE /api/tasks/:id` | Task CRUD (`?status=pending\|done\|all`) |
| `POST /api/syllabus/extract` | Body = raw PDF (`Content-Type: application/pdf`, ≤5 MB). Returns a draft, saves nothing |
| `POST /api/syllabus/confirm` | Saves the reviewed items as tasks |
| `POST /api/plans/generate` | `{scope:'daily'\|'weekly', today?}` → draft plan |
| `POST /api/plans/revise` | Draft revision after missed sessions |
| `GET /api/plans/active`, `/draft`, `/progress`, `/:id`, `/` | Read plans and progress |
| `POST /api/plans/:id/approve`, `/reject` | Approve or discard a draft |
| `PATCH /api/plans/:id/sessions/:sid` | `{status:'planned'\|'done'\|'missed'}` |
| `DELETE /api/plans/:id/sessions/:sid` | Remove a session from a draft |
| `GET /api/ai/status`, `POST /api/ai/explain`, `POST /api/ai/quiz` | AI learning tools |

## Project layout

```
server/src/
  app.js, index.js, config.js, db.js, security.js, middleware.js, errors.js
  routes/        auth, settings, tasks, syllabus, plans, ai
  services/      scheduler, agent, planService, aiService, validators,
                 syllabusParser, pdfExtract, tools, mappers
  llm/           anthropic (Messages API + tool use), mock (demo mode)
  utils/         dates, validate
server/tests/    Vitest + Supertest suites
client/src/      React app (hash-routed pages, plain CSS)
```

## Testing

```bash
npm test                 # Vitest + Supertest
npm run test:coverage    # adds a v8 coverage report (server/coverage/index.html)
```

The suite (87 tests) covers: authentication (register/login/logout, expiry, rate limiting), task ownership and CRUD, PDF extraction errors (empty, non-PDF, corrupt, scanned/no text, too large), syllabus review/confirm, AI response validation (plans, quizzes, explanations, syllabus items), the tool-calling agent (valid plan, self-correction, cross-user task injection, outages, unknown tools), and plan approval/revision (including stale-revision protection).

**Measured result:** I ran this suite with Node's built-in test runner and coverage tool, using lightweight stand-ins for `express`, `supertest` and `vitest` because the sandbox I built this in had no access to the npm registry. Result: **87/87 passing; 98.75% line, 91.39% branch, 96.45% function coverage** across `server/src` (excluding the `index.js` launcher). Please run `npm run test:coverage` on your machine and record your own number – it will differ slightly because Vitest's v8 provider counts differently, and the stand-ins are not the real libraries.

## Security notes

* Passwords: scrypt with a per-user salt, constant-time comparison, dummy hash on unknown emails to avoid timing leaks.
* Sessions: random 256-bit tokens, only their SHA-256 is stored, 7-day expiry, logout revokes server-side.
* Every data query includes `user_id`; other users' resources return 404.
* Input validation on every route, JSON body limit 100 kB, PDF limit 5 MB, auth and AI rate limits.
* Security headers (CSP, nosniff, frame deny); React escapes all user and AI text.
* SQL uses parameterised statements only.

## Known limits

* Scanned (image-only) PDFs are rejected with a clear message – OCR is out of scope.
* The built-in syllabus parser is heuristic; it is why the review screen exists. Ambiguous numeric dates (03/04/2026) are flagged.
* One approved plan per student at a time; approving a new plan supersedes the previous one.
* Session tokens are stored in `localStorage`; for a production deployment consider httpOnly cookies.
* `node:sqlite` prints an "experimental" warning on startup on some Node versions; it is harmless.
