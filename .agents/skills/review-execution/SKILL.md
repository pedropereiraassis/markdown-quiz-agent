---
name: review-execution
description: Review a slice for correctness, safety, validation, and interview readiness.
---

# Purpose
Use this skill to audit an implementation slice and fix issues if needed.

## Read First
1. `SPEC.md`
2. `AGENTS.md`

## Review Checklist
Check for:
- scoring bugs
- weighted score mistakes
- schema drift
- missing support for single vs multiple questions
- incorrect question count constraints
- options count not fixed at 4
- unsafe URL normalization
- unsafe remote fetch behavior
- oversized prompt ingestion
- persistence gaps
- missing tests
- unnecessary complexity

## Required Verifications
Run as appropriate:
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`

## Special Audit Points
### Scoring
Verify exactly:
- single-answer: exact match => `4`, else `0`
- multiple-answer:
  - `TP = |selected ∩ correct|`
  - `FP = |selected \ correct|`
  - `score = clamp(0, 4 * (TP - FP) / |correct|, 4)`

### Ingestion
Verify:
- GitHub blob URL normalization
- timeout `10_000 ms`
- max redirects `3`
- max body size `1 MiB`
- content-type validation
- chunk/truncate cap `24_000` characters

### Provider behavior
If OpenRouter exists, verify:
- pinned model
- no `openrouter/auto`
- no broad auto-routing
- require parameter support
- no broad fallbacks by default

## Output Format
Report findings first, ordered by severity.

If there are no findings, report:
- `Findings: none`
- `Residual risks: ...`
- `Verification run: ...`
