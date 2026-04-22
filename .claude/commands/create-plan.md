You are an AI assistant responsible for turning a task description into a single implementation plan that is ready to execute in this repository.

<critical>Output is ONE file: plan.md — do NOT create separate PRD, Tech Spec, or task files</critical>
<critical>EXPLORE THE PROJECT FIRST BEFORE ASKING CLARIFYING QUESTIONS</critical>
<critical>EACH EXECUTION TASK MUST BE A FUNCTIONAL AND INCREMENTAL DELIVERABLE WITH TESTS</critical>
<critical>BEFORE PLANNING, VALIDATE THAT THE TASK IS ACTUALLY NEEDED — check the current code, recent git history when available, and uncommitted work to determine whether the task is already done, in progress, or no longer relevant.</critical>
<critical>USE ASK-USER QUESTIONS, CONTEXT7, AND WEB SEARCH WHEN THEY MATERIALLY IMPROVE THE PLAN — but do not block on them when the answer is already clear from local project context.</critical>

## Objective

Create a single `plan.md` that combines:

1. Requirements understanding
2. Technical analysis and implementation approach
3. Small, incremental execution tasks with tests
4. Relevant risks, dependencies, and assumptions
5. Definition of done and verification steps

## Template and Output

- Final file name: `plan.md`
- Final directory: `./tasks/[feature-name]/`
- Feature name must be in kebab-case
- If `./.claude/templates/plan-template.md` exists, follow it
- If no template exists, use the section structure defined in this command

## Prerequisites

- Read `SPEC.md` first for product behavior
- Read `AGENTS.md` for repo-specific rules
- Load relevant skills from `.agents/skills` when they materially help (for example `vitest`, `zod`, `typescript-advanced`, `test-antipatterns`)

## Required Workflow

### 1. Understand the Request

- Read the task carefully
- Extract the user problem, desired outcome, constraints, dependencies, and non-goals
- Note ambiguity, but do not ask questions yet

### 2. Validate Task Relevance (Required)

Before drafting a plan, confirm the work is still needed:

- Check current implementation for overlapping behavior
- Check recent git history when there is enough history to make that useful
- Check the working tree for overlapping in-progress changes
- Confirm the problem or gap still exists

If the task is already done or clearly in progress, stop and report the evidence instead of generating a plan.

If the repository is too new for git history to help, state that limitation and continue with codebase inspection.

### 3. Deep Project Analysis (Required)

Before asking questions or drafting the plan:

- Identify relevant files, modules, tests, configuration, and data flow
- Map the affected layers:
  - `src/domain`
  - `src/application`
  - `src/infrastructure`
  - `src/interfaces/cli`
  - `src/config`
- Prefer extending existing patterns over creating new abstractions
- Call out any scoring, schema, ingestion, persistence, or provider constraints that the task may touch
- Note memory and performance risks such as unbounded buffering, prompt growth, or unnecessary concurrency

### 4. External Validation (When Needed)

- Use Context7 for current library and framework documentation when the plan depends on API behavior, version-specific usage, or implementation details that are not stable
- Use Web Search for unstable external facts such as provider constraints, pricing, product behavior, standards, or business rules
- Prefer primary and official sources
- If no external research is needed, say so explicitly in the plan

### 5. Clarify Only What Is Blocking

- Ask concise follow-up questions only when a missing answer would make the plan unreliable
- If your environment provides an Ask User Question tool, use it for grouped blocking questions after project exploration
- If that tool is unavailable, ask the user directly in plain text
- If the remaining ambiguity is low risk, document an assumption instead of blocking
- Group questions by topic and avoid asking what the codebase already answers

### 6. Create the Plan (Required)

Generate `plan.md` with these sections:

1. Summary
2. Scope
3. Open Questions and Assumptions
4. Codebase Findings
5. External Validation
6. Implementation Strategy
7. Execution Tasks
8. Verification
9. Risks and Mitigations
10. Definition of Done

The plan must include:

- Concise problem and outcome summary
- In-scope and out-of-scope definition
- Open questions and assumptions
- Relevant codebase findings and patterns to reuse
- External validation findings with sources when used
- Implementation strategy with risks and dependencies
- Incremental execution tasks with tests
- Verification commands appropriate for this repo
- Definition of done

### 7. Execution Task Guidelines

Each task must be:

- Functional
- Incremental
- Testable
- Small enough to review in isolation

For each task, define:

- Goal
- Specific code changes
- Files or areas affected
- Tests to add or update
- Dependencies on earlier tasks

Avoid more than 10 tasks. Prefer the smallest coherent vertical slices.

### 8. Save the File (Required)

- Create `./tasks/[feature-name]/` if needed
- Save the plan as `./tasks/[feature-name]/plan.md`
- If a plan already exists, update it in place instead of creating a parallel file

## Plan Quality Rules

- Keep the plan practical and implementation-ready
- Align with `SPEC.md` and `AGENTS.md`
- Preserve the current lightweight architecture
- Explicitly mention if the task touches:
  - scoring math
  - weighted final score
  - quiz schema validation
  - GitHub URL normalization
  - markdown fetch guardrails
  - prompt size caps
  - SQLite persistence
  - provider constraints
- Call out memory or heap growth risks where relevant
- Use repo-native validation commands when available, for example:
  - `npm run typecheck`
  - `npm test`
  - `npm run verify`

## Final Response

After saving the file:

- Provide the final file path
- Briefly summarize the plan
- List only truly blocking open questions, if any remain

## Quality Checklist

- [ ] Task description analyzed
- [ ] Task relevance validated
- [ ] Deep project analysis completed
- [ ] `SPEC.md` and `AGENTS.md` reviewed
- [ ] Relevant `.agents/skills` loaded when useful
- [ ] Context7 and Web Search used when materially helpful
- [ ] Blocking questions asked only if necessary
- [ ] `plan.md` generated
- [ ] Execution tasks are ordered, functional, and testable
- [ ] Each task includes specific tests
- [ ] File saved to `./tasks/[feature-name]/plan.md`
