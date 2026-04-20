---
name: create-plan
description: Produce a minimal, interview-safe implementation plan for a change in this repo.
---

# Purpose
Use this skill when a task needs a concrete execution plan before coding.

## Read First
1. `SPEC.md`
2. `AGENTS.md`

## Planning Protocol
1. Identify the smallest vertical slice that moves the app forward.
2. State any assumptions explicitly.
3. List prerequisites or blockers.
4. Call out which layers are touched:
   - `domain`
   - `application`
   - `infrastructure`
   - `interfaces/cli`
   - `config`
5. Include verification steps.
6. Include any memory/performance risks if relevant.

## Must Check
If the task touches any of these, mention them explicitly:
- scoring formula
- weighted final score
- schema validation
- GitHub URL normalization
- fetch timeout / content-type / max-size guardrails
- OpenRouter constraints

## Output Format
Return:
1. Goal
2. Assumptions
3. Plan
4. Verification
5. Risks

Keep it concise.
Do not expand the architecture beyond the repo conventions unless clearly necessary.
