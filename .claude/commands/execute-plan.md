You are an AI assistant responsible for executing a task from a single implementation plan in this repository.

<critical>`plan.md` is the source of truth — read it fully before coding, resolve blocking questions first, and update it as you execute</critical>
<critical>The task is not complete until the required validations for the affected area are passing</critical>
<critical>Do not auto-commit or assume extra review tooling exists</critical>
<critical>USE CONTEXT7, WEB SEARCH, AND ASK-USER QUESTIONS WHEN THEY MATERIALLY REDUCE IMPLEMENTATION RISK OR RESOLVE BLOCKING UNCERTAINTY</critical>

## Inputs

- Plan: `./tasks/[feature-name]/plan.md`
- Project rules: `AGENTS.md`
- Product spec: `SPEC.md`
- Relevant repo skills under `.agents/skills`

## Objective

Execute the plan safely and completely by:

1. Understanding the intended change
2. Summarizing the plan before coding
3. Implementing the work task by task
4. Adding or updating tests for each task
5. Verifying correctness with repo-appropriate commands
6. Reviewing the final diff against the plan and repo rules
7. Updating `plan.md` to reflect what was actually done

## Required Workflow

### 1. Pre-Implementation Setup (Required)

- Read the entire `plan.md`
- Read `SPEC.md` and `AGENTS.md`
- Read the relevant files referenced by the plan
- Load relevant skills from `.agents/skills` when they materially help
- If the task touches framework or provider behavior that may have changed, verify that with current docs using Context7 when possible
- Use Web Search for unstable external constraints when local context is insufficient

### 2. Plan Analysis and Summary (Required)

Before writing code, summarize:

```text
Plan Name: [brief description]
Context: [scope and intended outcome]
Tech Requirements: [main implementation requirements]
Dependencies: [task dependencies or external constraints]
Main Objectives: [primary functional goals]
Risks/Challenges: [important technical risks]
```

Confirm:

- Scope is clear enough to implement
- Tasks are ordered correctly
- Required tests are known
- No blocking question remains

If the plan is vague or wrong, refine it first and then continue.
If a blocking product or technical uncertainty remains, ask the user before implementing. Use your environment's Ask User Question tool when available; otherwise ask directly.

### 3. Approach Plan (Required)

Outline the execution sequence before editing:

```text
1. [first task]
2. [second task]
3. [next task]
```

### 4. Implement Task by Task (Required)

For each task:

1. Re-read the relevant files
2. Implement the code changes
3. Add or update tests
4. Run the smallest relevant validation first
5. Update that task status in `plan.md`

Prefer task order unless the plan clearly marks work as independent.

### 5. Validate Thoroughly (Required)

Use the smallest useful commands first, then broader checks.

Typical commands for this repo:

- targeted `vitest` runs while iterating
- `npm run typecheck`
- `npm test`
- `npm run verify`

If a command is unavailable or redundant, note that explicitly.

### 6. Self-Review (Required)

Review the final result with:

- `git diff`
- `plan.md`
- `SPEC.md`
- `AGENTS.md`

Verify:

- Implementation matches the plan or justified deviations are documented
- Tests cover the new behavior meaningfully
- Architecture stays lightweight
- No dead code or partial work remains
- Memory behavior stays predictable

### 7. Final Review Pass (Required)

Perform the `execute-review` workflow before considering the work done:

- Review findings against repo rules and the plan
- Fix any issues found
- Re-run the necessary validations after fixes

### 8. Update the Plan (Required)

Before finishing:

- Mark completed tasks as done
- Mark skipped items with a reason
- Update implementation notes with important discoveries or deviations
- Keep the verification section accurate

## Execution Principles

- Follow existing project patterns before introducing new abstractions
- Prefer small, explainable changes
- Keep domain logic pure where possible
- Keep CLI, network, and persistence concerns out of scoring logic
- Protect bounded memory behavior, prompt size, and fetch safety
- Use Context7 or Web Search instead of guessing about unstable external behavior
- Stop and ask only if a product decision blocks correctness

## Final Response

After execution:

- Summarize what was implemented
- Report which validations were run and their outcomes
- Call out deviations, remaining risks, or follow-up items

## Quality Checklist

- [ ] `plan.md` read completely
- [ ] `SPEC.md` and `AGENTS.md` reviewed
- [ ] Relevant code and tests reviewed
- [ ] Pre-implementation summary and approach plan produced
- [ ] Blocking questions resolved before coding
- [ ] Work executed task by task
- [ ] Tests added or updated
- [ ] Required validations passing
- [ ] Self-review completed with `git diff`
- [ ] Final review pass completed
- [ ] `plan.md` updated to reflect final status
