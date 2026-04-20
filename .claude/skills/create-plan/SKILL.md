---
name: create-plan
description: Convert a request into a minimal, spec-driven implementation plan for this interview project.
---

# Claude Planning Protocol

## Read First
1. `SPEC.md`
2. `CLAUDE.md`

## Goal
Produce the smallest interview-safe plan that can be executed without redesigning the app.

## Steps
1. Restate the requested outcome in one sentence.
2. Identify the smallest vertical slice.
3. List dependencies or prerequisites.
4. Note which modules are affected:
   - `domain`
   - `application`
   - `infrastructure`
   - `interfaces/cli`
   - `config`
5. Define verification steps.
6. Call out memory/performance risks if relevant.

## Must Mention When Relevant
- exact scoring formula
- weighted average formula
- question count `5..8`
- exactly `4` options per question
- support for both single-answer and multiple-answer questions
- GitHub blob URL normalization
- remote fetch guardrails
- OpenRouter constraints if OpenRouter is in play

## Output
Return a short numbered plan.

If this skill is invoked directly for planning, stop after the plan and wait for the next instruction.
