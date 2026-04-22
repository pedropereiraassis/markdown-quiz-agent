---
name: execute-review
description: Review a change set in this repo for correctness, spec adherence, safety, predictable memory behavior, and meaningful test coverage.
---

# Purpose
Use this skill to review implementation work before sign-off.

## Read First
1. `SPEC.md`
2. `AGENTS.md`
3. `./tasks/[feature-name]/plan.md` if it exists

## Review Workflow
1. Inspect `git status`, `git diff`, and full modified files.
2. Compare the change against `SPEC.md`, `AGENTS.md`, and the plan when present.
3. Use Context7 or Web Search when the review depends on unstable external behavior or current library details.
4. Run the smallest relevant validations first.
5. Report findings ordered by severity.
6. If there are no findings, still report residual risks and what was verified.

## Mandatory Checks
Review for:
- correctness bugs
- scoring regressions
- schema drift
- unsafe markdown ingestion changes
- provider constraint drift
- persistence mistakes
- missing or weak tests
- unnecessary complexity
- memory, buffering, or concurrency risks

## Repo-Specific Audit Points
### Scoring
Verify exactly:
- single-answer: exact match => `4`, otherwise `0`
- multiple-answer: `score = clamp(0, 4 * (TP - FP) / |correct|, 4)`
- final score uses 10% step-up weighting per question

### Ingestion
Verify:
- GitHub blob URL normalization
- timeout `10_000 ms`
- max redirects `3`
- max body size `1 MiB`
- text validation
- chunking before truncation
- prompt cap `24_000` characters

### Persistence and Provider
Verify:
- saved snapshots are still explainable
- OpenRouter remains pinned and constrained if present
- no broad fallbacks or auto-routing are introduced

## Validation
Prefer:
- `npm run typecheck`
- `npm test`
- `npm run verify`

If a command is not available or not needed, say so explicitly.

## Output Format
Report:
1. Summary
2. Validation status
3. Findings first, ordered by severity
4. Residual risks
5. Final verdict

If there are no findings, say `Findings: none`.
