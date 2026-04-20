---
name: execute-plan
description: Implement one approved slice using the agreed stack, bounded scope, and deterministic verification.
---

# Claude Execution Protocol

## Read First
1. `SPEC.md`
2. `CLAUDE.md`

## Rules
- Keep the implementation modular but lightweight.
- Prefer pure functions for business logic.
- Test deterministic logic first.
- Keep network, CLI, and DB concerns out of scoring logic.
- Use the agreed stack only unless there is a clear reason to change it.

## Do Not Drift From
### Scoring
- single-answer: exact match => `4`, else `0`
- multiple-answer:
  - `TP = |selected ∩ correct|`
  - `FP = |selected \ correct|`
  - `score = clamp(0, 4 * (TP - FP) / |correct|, 4)`

### Final score
- `w_i = 1.0 * (1.1 ^ (i - 1))`
- `finalScore = sum(score_i * w_i) / sum(w_i)`

### Ingestion
- normalize GitHub blob URLs to raw URLs
- timeout `10_000 ms`
- max redirects `3`
- max size `1 MiB`
- validate text content
- cap prompt input at `24_000` characters

### Provider behavior
Default path:
- direct OpenAI with pinned model

If OpenRouter is enabled:
- pinned model only
- no `openrouter/auto`
- no broad auto-routing
- require parameter support
- no broad fallbacks by default

## Verification
Run the smallest relevant verification first, then broader checks:
- targeted test file if available
- `pnpm test`
- `pnpm typecheck`
- `pnpm build` when integration is ready

## Report
Return:
1. What was implemented
2. What was verified
3. Any tradeoffs or follow-ups

Do not auto-commit.
