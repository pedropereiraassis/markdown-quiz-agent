# Markdown Quiz Agent - Product Specification

## 1. Purpose
Build a fully operational Node.js/TypeScript application that:

1. Fetches knowledge from a remote Markdown file via a configurable URL.
2. Uses an LLM to generate a short multiple-choice quiz from that content.
3. Runs the quiz interactively in the terminal.
4. Scores the answers deterministically.
5. Stores the quiz session, individual answers, and final score in SQLite.

This document is the product source of truth. If implementation details conflict with this file, this file wins.

## 2. Scope
### In scope
- One interactive CLI flow.
- Remote Markdown ingestion from a user-provided URL.
- Quiz generation with strict schema validation.
- Support for both single-answer and multiple-answer questions.
- Deterministic scoring and weighted final score calculation.
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

## 3. Core User Flow
1. User provides a Markdown URL.
2. Application normalizes and fetches the Markdown.
3. Application validates and bounds the fetched content.
4. Application generates a quiz from the Markdown.
5. Application renders 5 to 8 questions in the CLI.
6. User answers each question.
7. Application computes per-question points and the weighted final score.
8. Application persists the full session and answers.
9. Application displays the final result.

## 4. Input Source Rules
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

## 5. Remote Markdown Ingestion Guardrails
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

## 6. Quiz Generation Contract
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

## 7. Scoring Rules
### 7.1 Per-question score
Each question produces a score in the range `0.0` to `4.0`.

#### Single-answer questions
Let:
- `C` = set of correct option ids
- `S` = set of user-selected option ids

For single-answer questions, `|C| = 1`.

Score rule:
- If `S = C`, score = `4`
- Otherwise, score = `0`

#### Multiple-answer questions
Let:
- `C` = set of correct option ids
- `S` = set of user-selected option ids
- `TP = |S ∩ C|` = correctly selected correct options
- `FP = |S \ C|` = incorrectly selected options

Score formula:
`score = clamp(0, 4 * (TP - FP) / |C|, 4)`

Implications:
- Exact match gives `4`
- Selecting some correct answers without wrong extras gives partial credit
- Selecting wrong extra answers reduces credit
- Score never goes below `0`
- Score never goes above `4`

### 7.2 Final weighted score
Weights are applied in the order questions are presented to the user.

For question `i` starting at `1`:
`w_i = 1.0 * (1.1 ^ (i - 1))`

Final score formula:
`finalScore = sum(score_i * w_i) / sum(w_i)`

### 7.3 Presentation and persistence precision
- Keep numeric precision internally for calculations
- Round only for display
- Persist numeric values with enough precision to reproduce the final result

## 8. Persistence Requirements
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

## 9. LLM Provider Constraints
### Default provider
Default to direct OpenAI usage for the main implementation path.

### Optional OpenRouter path
If OpenRouter is used, all of the following are required:
- Use a pinned model id
- Do not use `openrouter/auto`
- Do not rely on broad provider auto-routing
- Require parameter support
- Do not enable broad fallbacks by default
- If any fallback is configured, it must be a small, explicitly tested fallback set

Recommended pinned model for the optional OpenRouter path:
- `openai/gpt-4.1-mini`

## 10. Non-Functional Requirements
- Keep the architecture modular but lightweight.
- Prefer predictable memory behavior over clever abstractions.
- No unbounded retries.
- No parallel fan-out model calls for quiz generation.
- Deterministic business logic must be unit tested.

## 11. Acceptance Criteria
The implementation is acceptable when all of the following are true:

1. A user can provide a Markdown URL and complete a quiz end-to-end in the CLI.
2. The quiz has 5 to 8 questions and each question has exactly 4 options.
3. Both single-answer and multiple-answer questions are supported.
4. The per-question scoring exactly matches Section 7.
5. The final score exactly matches the weighted formula in Section 7.
6. Results are saved to SQLite.
7. GitHub blob URLs are normalized to raw content URLs before fetch.
8. Remote ingestion guardrails from Section 5 are enforced.
9. Model output is schema-validated before use.
10. The code is modular enough to swap the CLI for another interface later without rewriting domain logic.
