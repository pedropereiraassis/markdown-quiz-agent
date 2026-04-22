# Source-Grounded Markdown Quiz CLI - Product Specification

## 1. Purpose
Build a compact, fully operational Node.js/TypeScript CLI application that:

1. Fetches knowledge from a remote Markdown file via a configurable URL.
2. Uses an LLM to generate a short multiple-choice quiz from that content.
3. Runs the quiz interactively in the terminal.
4. Scores the answers deterministically.
5. Stores the quiz session, individual answers, and final score in SQLite.

The product should feel credible in a short product review and still be useful as a real self-testing tool for docs and notes.

This document is the product source of truth. If implementation details conflict with this file, this file wins.

## 2. Scope
### In scope
- One interactive CLI flow.
- Remote Markdown ingestion from a user-provided URL.
- Quiz generation with strict schema validation.
- Support for both single-answer and multiple-answer questions.
- Deterministic scoring and weighted final score calculation.
- Plain-language result communication without showing formulas in the quiz flow.
- Explainable saved results.
- Persistence of results in SQLite.

### Out of scope for v1
- Web UI.
- Docker.
- Postgres.
- Vector databases.
- Background workers.
- Multi-agent orchestration.
- Streaming output.
- Long-term prompt/session memory.
- Broader study features such as summaries, flashcards, or adaptive tutoring.

## 3. Core User Flow
1. User provides a Markdown URL.
2. Application normalizes and fetches the Markdown.
3. Application validates and bounds the fetched content.
4. Application generates a quiz from the Markdown.
5. Application renders 5 to 8 questions in the CLI without showing a source preview first.
6. User answers each question.
7. Application computes per-question points and the weighted final score.
8. Application persists the full session and answers.
9. Application displays a final numeric result with simple score explanations.
10. Application confirms that the session was saved.

## 4. User Experience Guardrails
- The product should feel compact and purposeful.
- The quiz should stay clearly grounded in the supplied source.
- Multiple-answer questions must be clearly labeled before the user answers.
- User-facing copy must explain scoring in plain language.
- The quiz flow must not show formulas to the user.
- The application should not echo source excerpts or previews before the quiz begins.
- The final result should be numeric only.

## 5. Input Source Rules
### Allowed input
- A single remote `http://` or `https://` URL pointing to a Markdown document or plain text content intended to be treated as Markdown.

### GitHub URL normalization
If the user provides a GitHub blob URL, normalize it before fetching:

- From:
  `https://github.com/<owner>/<repo>/blob/<ref>/<path>.md`
- To:
  `https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>.md`

Normalization rules:
- Strip query strings and hash fragments before conversion.
- Only convert GitHub `.../blob/...` file URLs.
- Do not attempt to convert repository pages, trees, issues, or non-file URLs.

## 6. Remote Markdown Ingestion Guardrails
These are required behavior, not optional enhancements.

### Network guardrails
- Request timeout: `10_000 ms`
- Redirects: follow at most `3`
- Maximum response size: `1 MiB` raw body
- Reject unsupported URL schemes
- Reject empty responses

### Content validation
Accept only content that is reasonably text-based, including:
- `text/markdown`
- `text/plain`
- `text/x-markdown`

If the content type is missing or ambiguous, the application may proceed only if the body successfully decodes as UTF-8 text and remains within size limits.

### Normalization
After fetch:
- Decode as UTF-8
- Normalize line endings to `\n`
- Trim leading/trailing null bytes and obvious transport artifacts
- Preserve original Markdown semantics as much as possible

### Prompt-bounding rules
The full remote document must not be passed to the model unbounded.

Use these limits:
- Hard maximum retained text after normalization: `24_000` characters
- Preferred chunk target: `2_000` characters
- Chunking strategy: split by Markdown headings first, then by blank-line paragraph boundaries, then by hard character limit if necessary
- Preserve source order
- Keep only the first chunks that fit within the `24_000` character cap

The application must avoid unbounded buffering, unbounded concurrency, and loading arbitrarily large files into prompt context.

## 7. Quiz Generation Contract
### Required quiz constraints
- Total question count: `5` to `8`
- Each question must have exactly `4` answer options
- Questions may be:
  - `single`: exactly `1` correct option
  - `multiple`: `2` to `4` correct options
- Each question must include:
  - stable question id
  - prompt text
  - exactly 4 options
  - stable option ids
  - question type
  - correct option ids

### Determinism and validation
- The model output must be validated against a strict schema.
- Invalid model output must be rejected and retried or surfaced as an error.
- The scoring logic must not depend on the model after quiz generation.

## 8. Scoring Rules
### 8.1 Plain-language scoring summary
The user-facing experience should explain scoring like this:

- Single-answer questions give full credit for an exact match and zero otherwise.
- Multiple-answer questions can give partial credit.
- Selecting incorrect extra options reduces credit on multiple-answer questions.
- Later questions count slightly more in the final result.
- The CLI should show points and final numeric score, not formulas.

### 8.2 Per-question score
Each question produces a score in the range `0.0` to `4.0`.

#### Single-answer questions
Single-answer questions have exactly one correct option.

Score rule:
- If the user picks the exact correct option, score = `4`
- Otherwise, score = `0`

#### Multiple-answer questions
For multiple-answer questions:
- Count how many correct options the user selected.
- Count how many incorrect extra options the user selected.
- Subtract the wrong extras from the correct selections.
- Scale the result to the `0` to `4` range based on how many correct options the question has.
- Clamp the final value so it never goes below `0` or above `4`.

Exact implementation rule:
`score = clamp(0, 4 * (correctSelections - wrongExtraSelections) / totalCorrectOptions, 4)`

Implications:
- Exact match gives `4`
- Selecting some correct answers without wrong extras gives partial credit
- Selecting wrong extra answers reduces credit
- Score never goes below `0`
- Score never goes above `4`

### 8.3 Final weighted score
Weights are applied in the order questions are presented to the user.

Weighting rule:
- The first question has weight `1.0`.
- Each next question is weighted `10%` higher than the previous one.
- The final result is the weighted average of all question scores.

Exact implementation rule:
- `weight_1 = 1.0`
- `weight_next = previous_weight * 1.1`
- `finalScore = weighted average of all question scores using those weights`

### 8.4 Presentation and persistence precision
- Keep numeric precision internally for calculations
- Round only for display
- Persist numeric values with enough precision to reproduce the final result
- Do not show formulas in the user-facing quiz flow
- Explain results in plain language when presenting points

## 9. Persistence Requirements
Store the following in SQLite.

### Quiz session
- session id
- source URL provided by user
- normalized source URL used for fetch
- source title if available
- total question count
- final score
- created timestamp

### Question/answer record
- answer id
- session id
- question id
- question order
- question type
- question text snapshot
- serialized option snapshot
- correct option ids snapshot
- selected option ids
- per-question points awarded
- per-question weight applied

Persisting snapshots is intentional so the session remains explainable even if prompts or generation logic later change.

## 10. LLM Provider Constraints
### Primary provider
Use OpenRouter for the main implementation path.

OpenRouter requirements:
- Use a pinned model id provided through configuration
- Do not use `openrouter/auto`
- Do not rely on broad provider auto-routing
- Require parameter support
- Do not enable broad fallbacks by default
- Do not configure a direct-provider fallback in the MVP
- Fail fast if the configured model id is missing or invalid

## 11. Non-Functional Requirements
- Keep the architecture modular but lightweight.
- Prefer predictable memory behavior over clever abstractions.
- No unbounded retries.
- No parallel fan-out model calls for quiz generation.
- No unpinned or auto-routed model selection.
- Deterministic business logic must be unit tested.

## 12. Acceptance Criteria
The implementation is acceptable when all of the following are true:

1. A user can provide a Markdown URL and complete a quiz end-to-end in the CLI.
2. The quiz has 5 to 8 questions and each question has exactly 4 options.
3. Both single-answer and multiple-answer questions are supported.
4. The per-question scoring exactly matches Section 8.
5. The final score exactly matches the weighted formula in Section 8.
6. Results are saved to SQLite.
7. The result is understandable without exposing formulas in the quiz flow.
8. GitHub blob URLs are normalized to raw content URLs before fetch.
9. Remote ingestion guardrails from Section 6 are enforced.
10. The application does not show a source preview before the quiz starts.
11. Model output is schema-validated before use.
12. The code is modular enough to swap the CLI for another interface later without rewriting domain logic.
