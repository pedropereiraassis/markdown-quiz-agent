# Claude Code Guidance

## Role
Build this project as a small, spec-driven Node.js/TypeScript CLI application for generating source-grounded quizzes from Markdown.

`SPEC.md` is the product source of truth.
This file is Claude-specific persistent implementation guidance.

## Project Priorities
1. End-to-end working CLI first
2. Source-grounded quiz quality
3. Deterministic scoring correctness
4. Strict quiz schema validation
5. Safe remote Markdown ingestion
6. Predictable memory behavior
7. Small, explainable changes

## Final Stack
- Runtime: Node.js `24 LTS`
- Language: TypeScript
- CLI: `@clack/prompts`
- AI orchestration: `langchain`
- Default provider: `@langchain/openai`
- Optional provider gateway: `@langchain/openrouter`
- Validation: `zod`
- Database: `knex` + `better-sqlite3`
- Tests: `vitest`
- Dev runner: `tsx`
- Config: `dotenv`

## Architecture
Use a lightweight modular structure:

- `src/domain`
  - pure types
  - Zod schemas
  - scoring logic
- `src/application`
  - use cases / orchestration of domain + infrastructure
- `src/infrastructure`
  - markdown fetcher
  - LLM client
  - persistence
- `src/interfaces/cli`
  - terminal prompts and rendering
- `src/config`
  - env parsing and constants

Do not introduce deeper architecture layers unless they clearly reduce complexity.

## Provider Rules
### Default path
Use direct OpenAI for the main implementation path.

Recommended default model:
- `gpt-4.1-mini`

### Optional OpenRouter path
If OpenRouter is enabled:
- use a pinned model
- do not use `openrouter/auto`
- do not use broad provider auto-routing
- require parameter support
- do not enable broad fallbacks by default
- keep the default pinned model as:
  - `openai/gpt-4.1-mini`

## Scoring Rules
Implement exactly this logic.

Keep implementation exact, but keep user-facing explanations simple and non-formulaic.

For single-answer questions:
- if selected option set equals correct option set, award `4`
- otherwise award `0`

For multiple-answer questions:
- count correct selections
- count wrong extra selections
- subtract wrong extras from correct selections
- scale that result to the `0` to `4` range based on how many correct answers exist
- clamp the final result to stay between `0` and `4`

Final score:
- first question weight = `1.0`
- each next question weight = previous weight plus `10%`
- final score = weighted average of question scores

Never reinterpret these rules without updating `SPEC.md`.

User-facing result expectations:
- show per-question points and a final numeric score
- explain partial credit in plain language
- mention that later questions count slightly more
- do not show formulas in the quiz flow

## Remote Markdown Rules
Always enforce:
- `10_000 ms` timeout
- max `3` redirects
- max `1 MiB` response size
- text content-type validation
- UTF-8 decode
- GitHub blob URL normalization
- chunk/truncate before prompt use
- hard prompt input cap `24_000` characters
- no unbounded buffering or concurrency

GitHub normalization:
- `https://github.com/<owner>/<repo>/blob/<ref>/<path>`
- `https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>`

## Implementation Workflow
1. Read `SPEC.md`
2. Read the approved PRD before changing product-facing behavior
3. Pick the smallest vertical slice
4. Write tests first for deterministic logic
5. Implement the slice
6. Run the smallest relevant verification first
7. Run broader repo checks when the slice is integrated
8. Report what changed and any tradeoffs

## Verification Expectations
Use the smallest direct verification command that fits the current repo state.
Do not assume `package.json` scripts exist yet.

Typical examples:
- `npx vitest`
- `npx tsc --noEmit`
- a future build command once build scripts exist

Focus test coverage on:
- scoring math
- schema validation
- URL normalization
- markdown guardrails
- persistence boundaries

## Change Discipline
- Keep file touches minimal but coherent
- Prefer pure functions for business logic
- Keep CLI concerns out of domain logic
- Keep DB and network code out of scoring logic
- Preserve room to replace the CLI with HTTP/UI later
- Keep product language focused on a compact source-grounded quiz tool
- Avoid product wording about interviews, hiring exercises, or evaluation ceremonies

## Memory / Performance Safety
Always evaluate whether a change increases:
- heap growth
- buffering risk
- retry storms
- prompt size
- concurrency
- database lock contention

Prefer sequential, bounded operations.
Avoid loading more data than needed.
