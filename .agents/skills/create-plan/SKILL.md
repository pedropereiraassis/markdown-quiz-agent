---
name: create-plan
description: Create a repo-fit implementation plan under ./tasks/[feature-name]/plan.md after checking SPEC.md, AGENTS.md, existing code, and relevant tests.
---

# Purpose
Use this skill when a change should be planned before implementation.

## Read First
1. `SPEC.md`
2. `AGENTS.md`

## Workflow
1. Restate the requested outcome and constraints.
2. Check whether the work is already done, partially done, or in progress.
3. Inspect the relevant code, tests, and config before asking questions.
4. Use Context7 for library/framework questions and Web Search for unstable external facts when they materially improve the plan.
5. Ask only blocking clarifications. Use your environment's Ask User Question tool when available; otherwise ask directly.
6. Write one implementation-ready `plan.md` in `./tasks/[feature-name]/`.

## Plan Content
Include:
1. Summary
2. Scope
3. Open questions and assumptions
4. Codebase findings
5. External validation with sources if needed
6. Implementation strategy
7. Incremental tasks with tests
8. Verification
9. Risks and mitigations
10. Definition of done

## Repo-Specific Guardrails
If the task touches them, call these out explicitly:
- scoring math
- weighted final score
- quiz schema validation
- GitHub blob URL normalization
- markdown fetch bounds
- prompt cap
- SQLite persistence
- provider constraints

Always note memory and performance risks when relevant:
- heap growth
- buffering
- unbounded concurrency
- loading large files

## Task Design Rules
Each task should be:
- functional
- incremental
- testable
- small enough to review in isolation

Prefer the smallest coherent vertical slice.
Avoid inventing new architecture layers unless clearly necessary.

## Verification
Use repo-native commands when available:
- `npm run typecheck`
- `npm test`
- `npm run verify`

## Output
Return:
1. Plan path
2. Brief summary
3. Blocking questions only, if any remain
