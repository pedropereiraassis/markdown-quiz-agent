# Repository Agent Guidance

`SPEC.md` is the source of truth for product behavior.
This file is Codex-specific repo guidance.

## Priorities
1. Working end-to-end CLI
2. Exact scoring correctness
3. Strict schema validation
4. Safe remote Markdown ingestion
5. Small, explainable changes
6. Predictable memory behavior

## Stack
- Node.js 24 LTS
- TypeScript
- `@clack/prompts`
- `langchain`
- `@langchain/openai` by default
- optional `@langchain/openrouter`
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
Single-answer:
- exact match => `4`
- otherwise => `0`

Multiple-answer:
- `TP = |selected ∩ correct|`
- `FP = |selected \ correct|`
- `score = clamp(0, 4 * (TP - FP) / |correct|, 4)`

Final weighted score:
- `w_i = 1.0 * (1.1 ^ (i - 1))`
- `finalScore = sum(score_i * w_i) / sum(w_i)`

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
Default implementation path:
- direct OpenAI with a pinned model

If OpenRouter is used:
- pinned model only
- no `openrouter/auto`
- no broad auto-routing
- require parameter support
- no broad fallbacks by default

## Workflow
- Read `SPEC.md` before coding
- Prefer the smallest coherent vertical slice
- Test deterministic logic first
- Run the smallest relevant verification first, then broader checks
- Keep progress updates concise
- Do not auto-commit

## Review Standard
When reviewing, prioritize:
1. correctness bugs
2. scoring regressions
3. schema drift
4. unsafe remote fetch behavior
5. persistence mistakes
6. missing tests
