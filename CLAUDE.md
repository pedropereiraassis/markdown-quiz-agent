# Claude Code Guidance

## Role
Build this project as a small, spec-driven Node.js/TypeScript application.

`SPEC.md` is the product source of truth.
This file is Claude-specific persistent implementation guidance.

## Project Priorities
1. End-to-end working CLI first
2. Deterministic scoring correctness
3. Strict quiz schema validation
4. Safe remote Markdown ingestion
5. Small, explainable changes
6. Predictable memory behavior

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

For single-answer questions:
- if selected option set equals correct option set, award `4`
- otherwise award `0`

For multiple-answer questions:
- `TP = |selected ∩ correct|`
- `FP = |selected \ correct|`
- `score = clamp(0, 4 * (TP - FP) / |correct|, 4)`

Final score:
- `w_i = 1.0 * (1.1 ^ (i - 1))`
- `finalScore = sum(score_i * w_i) / sum(w_i)`

Never reinterpret these rules without updating `SPEC.md`.

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
2. Pick the smallest vertical slice
3. Write tests first for deterministic logic
4. Implement the slice
5. Run the smallest relevant verification first
6. Run broader repo checks when the slice is integrated
7. Report what changed and any tradeoffs

## Verification Expectations
Use:
- `pnpm test`
- `pnpm typecheck`
- `pnpm build` when integration is ready

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
