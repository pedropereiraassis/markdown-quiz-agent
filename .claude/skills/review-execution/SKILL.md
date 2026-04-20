---
name: review-execution
description: Audit the current implementation for correctness, schema reliability, safety, and interview readiness.
---

# Claude Review Protocol

## Read First
1. `SPEC.md`
2. `CLAUDE.md`

## Review Goals
Find correctness bugs first.
Prioritize issues that would fail a live interview demo or create hard-to-explain behavior.

## Audit Checklist
1. Verify support for both single-answer and multiple-answer questions.
2. Verify question count stays within `5..8`.
3. Verify each question has exactly `4` options.
4. Verify scoring math exactly matches `SPEC.md`.
5. Verify weighted final score math exactly matches `SPEC.md`.
6. Verify schema validation is strict.
7. Verify GitHub URL normalization is correct.
8. Verify remote fetch guardrails are enforced.
9. Verify prompt input remains bounded.
10. Verify persistence stores enough detail to explain results later.
11. Verify the architecture remains lightweight and modular.
12. Verify tests cover deterministic logic.

## Commands
Run as appropriate:
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`

## Output Format
Return:
- `Findings`
- `Open questions / assumptions`
- `Verification`
- `Quick fix summary`

If there are no findings, say that explicitly and mention residual risks or missing tests.
