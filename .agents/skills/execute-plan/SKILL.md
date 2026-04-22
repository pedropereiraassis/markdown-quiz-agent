---
name: execute-plan
description: Execute one approved plan.md slice in this repo with small changes, deterministic validation, and an explicit final review pass.
---

# Purpose
Use this skill to implement an approved `plan.md` safely.

## Read First
1. `./tasks/[feature-name]/plan.md`
2. `SPEC.md`
3. `AGENTS.md`

## Workflow
1. Summarize the plan and confirm there are no blocking gaps.
2. Implement one task at a time.
3. Use Context7 or Web Search instead of guessing when implementation depends on unstable external behavior.
4. Ask blocking clarifications before coding if the plan is not executable as written. Use your environment's Ask User Question tool when available.
5. Add or update tests with each task.
6. Run the smallest relevant validation first.
7. Re-run broader validation before finishing.
8. Run the `execute-review` skill against the completed change set.
9. Update `plan.md` with execution status, including review outcome.

## Repo Guardrails
Do not drift from:
- scoring rules
- weighted final score
- strict quiz schema validation
- bounded markdown fetch behavior
- prompt-size caps
- predictable memory usage
- provider constraints

Keep:
- domain logic pure
- file touches small but coherent
- abstractions minimal

Avoid:
- speculative refactors
- broad fallbacks
- unbounded retries or concurrency
- auto-commits

## Validation
Prefer:
- targeted `vitest` runs while iterating
- `npm run typecheck`
- `npm test`
- `npm run verify`

## Output
Return:
1. Implemented
2. Verified
3. Review findings from `execute-review`, or `none`
4. Follow-ups or residual risks
