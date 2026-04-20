---
name: execute-plan
description: Execute one implementation slice in this repo with deterministic tests, bounded scope, and interview-safe tradeoffs.
---

# Purpose
Use this skill to implement an approved slice directly.

## Read First
1. `SPEC.md`
2. `AGENTS.md`

## Execution Protocol
1. Reconfirm the slice and the acceptance target.
2. If deterministic logic is involved, write or update tests first.
3. Implement the smallest coherent change.
4. Keep domain logic pure.
5. Keep CLI, network, and DB code out of scoring logic.
6. Run the smallest relevant verification first.
7. Run broader checks once the slice is integrated.
8. Summarize what changed and any tradeoffs.

## Required Guardrails
Never drift from these rules:
- single-answer scoring is exact-match only
- multiple-answer scoring is:
  - `TP = |selected ∩ correct|`
  - `FP = |selected \ correct|`
  - `score = clamp(0, 4 * (TP - FP) / |correct|, 4)`
- final score uses geometric weighting
- GitHub blob URLs must normalize to raw URLs
- remote fetch must stay bounded
- prompt input must stay capped
- OpenRouter must remain pinned and constrained if enabled

## Quality Bar
Prefer:
- small pure functions
- bounded memory usage
- sequential control flow
- strict validation
- minimal file touches

Avoid:
- speculative abstractions
- extra dependencies without clear benefit
- broad fallbacks
- unbounded retries or concurrency
- auto-commits

## Verification
Use the smallest relevant command first, then broader checks such as:
- `npm test`
- `npm typecheck`
- `npm build`

## Report Format
Return:
1. Implemented
2. Verified
3. Tradeoffs / follow-ups
