# Markdown Quiz Agent

A small Node.js / TypeScript CLI that turns any Markdown document into a short
multiple-choice quiz, runs it interactively, scores the answers, and stores the
session in SQLite.

## How it works

1. You paste a Markdown URL (raw or a GitHub `blob/...` URL — both work).
2. The app fetches the document under strict guardrails (timeout, redirect cap,
   1 MiB size cap, content-type check) and chunks it down to a 24 000-character
   prompt window.
3. An LLM call to OpenRouter, bound to a Zod-validated schema, returns 5 to 8
   questions (single- or multiple-answer).
4. You answer in the terminal. Scoring is deterministic, runs locally, and uses
   a 0–4 per-question scale with weights `1.0`, `1.1`, `1.21`, ...
5. The session, every answer, and the final score are persisted to SQLite as
   snapshots so a saved run is replayable even if prompts change later.

## Requirements

- Node.js 24 LTS (see `.nvmrc`)
- An OpenRouter API key

## Setup

```bash
npm install
cp .env.example .env        # fill in OPENROUTER_API_KEY
npm run db:migrate          # creates SQLite tables
```

## Run

```bash
npm run cli                      # start an interactive quiz
npm run cli -- --help            # show available flags
npm run cli -- --source-url https://example.com/guide.md
npm run cli -- --last-session    # print the most recently saved session
npm run cli -- --list-sessions   # print recent saved session summaries
npm run cli -- --debug           # include provider logs (useful when debugging)
```

Sample interactive run:

```
┌  Markdown Quiz
│
◇  Paste a Markdown URL
│  https://github.com/pipecat-ai/pipecat/blob/main/README.md
│
◇  Prepared 6 questions.
│
◇  Q1. What is Pipecat designed to build?
│  ◉ Real-time voice and multimodal AI agents
│
... (answer all questions) ...
│
◇  Final score: 3.42 / 4.00
│  Later questions counted slightly more.
│
└  Saved session 0d4e... to ./quiz.db
```

## Verification

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
npm run test:coverage
npm run verify
```

Tests cover scoring, schema validation, URL normalization, fetch guardrails,
persistence, and the CLI flow.

## Architecture

Lightweight, layered, no DI framework:

```
src/
  domain/          pure types, Zod schemas, scoring math
  application/     use cases (prepare/complete a quiz session)
  infrastructure/  markdown fetcher, OpenRouter client, SQLite persistence
  interfaces/cli/  @clack/prompts terminal UX
  config/          env parsing and constants
```

Domain code has no I/O. The CLI could be replaced with HTTP without touching
scoring or schema logic.

## Configuration

| Variable             | Required | Notes                                                                                                  |
| -------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `OPENROUTER_API_KEY` | yes      | https://openrouter.ai/keys                                                                             |
| `OPENROUTER_MODEL`   | yes      | Pinned model id. `openrouter/auto` is rejected on purpose.                                             |
| `DATABASE_PATH`      | yes      | SQLite file path. Cannot be `:memory:` because session review commands read from a persistent DB file. |

## Design notes

- **Pinned model, no fallbacks.** `allow_fallbacks: false`,
  `require_parameters: true`, `temperature: 0`. Predictable behavior matters
  more than provider flexibility for an MVP.
- **Single structured generation call, not a tool loop.** The task only
  needs one bounded source fetch plus one schema-validated quiz generation
  step. A multi-step agent loop would add latency and nondeterminism without
  solving a real domain problem yet. If the project expanded to retrieval over
  multiple sources, critique loops, or external tools, that tradeoff would
  change.
- **Schema-validated structured output.** The model is wrapped with
  `withStructuredOutput(quizSchema)` and retried once on validation failure.
  The second attempt includes the first attempt's validation issues so the
  retry has concrete feedback instead of repeating the exact same prompt.
- **Bounded ingestion.** The fetcher streams, enforces a manual redirect
  budget, fails on >1 MiB, and decodes UTF-8 with `fatal: true`. No unbounded
  buffering. The current prompt cap is character-based rather than token-based
  on purpose: it is deterministic, cheap, and easy to reason about. If tighter
  model budget control were needed, this would be the place to switch to
  token-aware counting.
- **Snapshots over references.** Persisted answers carry the question text and
  options as they appeared at quiz time, so historical sessions stay
  explainable even if generation logic changes.
- **Provider swap stays local.** The OpenRouter-specific wiring lives under
  `src/infrastructure/llm/generate-quiz.ts`. The domain and application layers
  never import LangChain types, so swapping providers is an infrastructure
  change rather than a repo-wide refactor.
