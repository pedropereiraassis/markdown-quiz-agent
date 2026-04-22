# Repository Agent Guidance

`SPEC.md` is the source of truth for product behavior.
This file is Codex-specific repo guidance.

## Priorities

1. Working end-to-end CLI
2. Source-grounded quiz quality
3. Exact scoring correctness
4. Strict schema validation
5. Safe remote Markdown ingestion
6. Predictable memory behavior
7. Small, explainable changes

## Stack

- Node.js 24 LTS
- TypeScript
- `@clack/prompts`
- `langchain`
- `@langchain/openrouter` (sole provider for the MVP)
- `zod`
- `knex`
- `better-sqlite3`
- `vitest`
- `tsx`
- `dotenv`

## Architecture

Keep the app lightweight and modular:

- `src/domain`: types, schemas, scoring
- `src/application`: use cases
- `src/infrastructure`: markdown fetch, LLM, persistence
- `src/interfaces/cli`: prompts and rendering
- `src/config`: env and constants

Do not add extra architecture layers unless they clearly simplify the code.

## Rules That Must Not Drift

### Scoring

Keep the scoring math exact, but keep user-facing explanations simple.

Single-answer:

- exact match => `4`
- otherwise => `0`

Multiple-answer:

- count correct selections
- ignore any incorrect extra selections
- scale the number of correct selections to the `0` to `4` range based on how many correct answers exist
- clamp the final result to stay between `0` and `4`

Final weighted score:

- first question weight = `1.0`
- each next question weight = previous weight plus `10%`
- final score = weighted average of question scores

User-facing result copy:

- show per-question points and final numeric score
- explain partial credit in plain language
- do not show formulas in the quiz flow

### Remote markdown ingestion

Always enforce:

- GitHub blob URL normalization to raw URL
- `10_000 ms` timeout
- max redirects `3`
- max size `1 MiB`
- text content validation
- UTF-8 normalization
- prompt cap `24_000` characters
- heading/paragraph-aware chunking before truncation

### Provider constraints

The MVP uses OpenRouter as the sole provider:

- pinned model only (configured via `OPENROUTER_MODEL`)
- no `openrouter/auto`
- no broad auto-routing
- `require_parameters: true`
- `allow_fallbacks: false`
- no direct-provider fallback
- fail fast if `OPENROUTER_API_KEY` or `OPENROUTER_MODEL` is missing or invalid

## Workflow

- Read `SPEC.md` before coding
- Read the approved PRD before changing product-facing behavior
- Prefer the smallest coherent vertical slice
- Test deterministic logic first
- Run the smallest relevant verification first, then broader checks
- Do not assume `package.json` scripts exist yet; use the simplest direct command until scripts are added
- Keep progress updates concise
- Do not auto-commit
- Keep product copy focused on a compact source-grounded quiz tool
- Avoid product wording about interviews, hiring exercises, or evaluation ceremonies

## Review Standard

When reviewing, prioritize:

1. correctness bugs
2. source-grounding regressions
3. scoring regressions
4. schema drift
5. unsafe remote fetch behavior
6. persistence mistakes
7. missing tests
