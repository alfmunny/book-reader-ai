# Chapter Comprehension Quiz

Issue: #991 (design) · parent feat: #557 · referenced from `docs/FEATURES.md` (Feature 12)

## Problem

Readers finishing a chapter have no way to self-check understanding before moving on. Especially valuable for language learners using the app's translation features — "did I actually follow this chapter in German, or just skim?". Today the reader has annotations and vocabulary lookup but no comprehension probe.

## User story

> "I just finished Chapter 12 of War and Peace in German. Before moving to 13, I want to answer 3–5 multiple-choice questions about what happened, so I can trust my comprehension before advancing."

## Non-goals

- Grading / pass-fail gates. This is self-assessment; the user decides what to do with a bad score.
- Free-form Q&A (that's what `/ai/chat` already does).
- Cross-chapter questions. One quiz = one chapter.
- Difficulty settings. v1 ships one default difficulty (comprehension-check, not nitpick).

## Solution

### Schema (new migration)

```sql
-- quiz_questions: AI-generated question bank per (book, chapter, target_language)
-- Cached and shared across users — first reader to request a quiz pays for the
-- Gemini call, everyone else hits cache (same pattern as translations and
-- chapter_summaries).
CREATE TABLE quiz_questions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id        INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_index  INTEGER NOT NULL,
    target_language TEXT   NOT NULL,  -- 'en' for source-language quizzes
    model          TEXT,
    question_json  TEXT   NOT NULL,   -- JSON: {prompt, choices[4], correct_index, explanation}
    ordinal        INTEGER NOT NULL,  -- 0..N, preserves AI's intended question order
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_quiz_questions_chapter
    ON quiz_questions (book_id, chapter_index, target_language);

-- quiz_attempts: per-user attempt history
CREATE TABLE quiz_attempts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id        INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_index  INTEGER NOT NULL,
    target_language TEXT   NOT NULL,
    answers_json   TEXT   NOT NULL,  -- JSON: [{question_id, chosen_index, correct}]
    score          INTEGER NOT NULL, -- correct count
    total          INTEGER NOT NULL, -- question count
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_quiz_attempts_user_chapter
    ON quiz_attempts (user_id, book_id, chapter_index);
```

**Why `target_language` is part of the cache key:** the quiz should be in the reader's active language. A German learner reading the German translation wants German questions; the same book chapter in English is a separate quiz. Keep the dimension explicit from day one — retrofitting is painful.

### Backend

New router `backend/routers/quiz.py`:

**`GET /api/quiz/{book_id}/{chapter_index}?target_language=de`**
Returns the cached quiz for this chapter+language, or 404 if not yet generated. Response shape:
```json
{
  "questions": [
    {"id": 1, "prompt": "Warum...", "choices": ["A...", "B...", "C...", "D..."]}
  ],
  "model": "gemini-3.1-flash-lite-preview"
}
```
Note: `correct_index` and `explanation` are NOT returned — client submits answers to `/submit` and only then learns which were right. Prevents users from inspecting DOM to cheat.

**`POST /api/quiz/{book_id}/{chapter_index}/generate`**
Generates + caches the quiz if not already cached. Idempotent — returns the existing cache on second call. Body:
```json
{"target_language": "de"}
```
Returns the same shape as GET, plus `"generated": true/false`.

**`POST /api/quiz/{book_id}/{chapter_index}/submit`**
Body:
```json
{
  "target_language": "de",
  "answers": [{"question_id": 1, "chosen_index": 2}]
}
```
Records attempt, returns per-question correctness + explanations + score:
```json
{
  "score": 3,
  "total": 5,
  "results": [
    {"question_id": 1, "chosen_index": 2, "correct": false, "correct_index": 1, "explanation": "..."}
  ]
}
```

**`GET /api/quiz/history?book_id=X`**
Returns the user's attempts for that book (across chapters), newest first. UI shows this as a "Quiz History" tab entry.

### AI prompt

Model: default chain — `gemini-flash-lite` priced ~$0.05/M input tokens, quizzes are short and rarely regenerated. Fallback to `gemini-flash` on rate limit.

Prompt shape (pseudocode, final lives in `services/quiz_ai.py`):

```
You are a reading-comprehension quiz writer. Based on the CHAPTER TEXT below,
produce {n_questions} multiple-choice questions that verify the reader
understood the chapter's key events, characters, and themes. Target language
for all questions: {target_language_name}.

Rules:
- 4 choices each. Exactly one correct.
- Plausible distractors — no obvious "gotchas" or trick questions.
- Questions must be answerable from the chapter alone (no outside knowledge).
- Return strict JSON matching this schema: {schema}.

CHAPTER TITLE: {title}
CHAPTER TEXT:
{text}
```

`n_questions` = 4 default, bounded 3–6 by backend validation.

**JSON schema** (validated with Pydantic before caching):
```python
class QuizQuestion(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=500)
    choices: list[str] = Field(..., min_length=4, max_length=4)
    correct_index: int = Field(..., ge=0, le=3)
    explanation: str = Field(..., min_length=1, max_length=500)
```

### Frontend

New `frontend/src/components/reader/QuizPanel.tsx`:
- Sidebar tab alongside Annotations / Vocabulary / Summary.
- States: `idle` → `generating` → `active` → `results` → `history`.
- Renders questions one-at-a-time with a progress indicator (1/5, 2/5, …).
- After all answered, submits once and shows results with inline explanations.
- "Retake" button resets to `active` and records a new attempt.

New `frontend/src/lib/api/quiz.ts` wraps the four endpoints with types.

### Caching behaviour

- First user on a chapter triggers generation (same cost model as `chapter_summaries`).
- `quiz_questions.(book_id, chapter_index, target_language)` is the cache key.
- Attempts never cache — they're always fresh inserts.
- Admin can delete a quiz cache entry to force regeneration (future admin-panel work; not in v1 scope).

## Schema / data migration

New tables only; no existing-data impact. Follows the CLAUDE.md migration policy:
- No UNIQUE-index cleanup needed (tables are new).
- No ADD COLUMN NOT NULL on existing tables.
- Declared FKs use `ON DELETE CASCADE` so deleting a book or user cascades cleanly.

## API changes (surface)

Four new endpoints under `/api/quiz/*`. No changes to existing endpoints.

## Test plan

**Backend:**
- `test_router_quiz.py` — happy paths: generate caches, second generate is no-op, submit records attempt + correct scoring, history returns user's attempts scoped correctly.
- Schema validation: malformed AI response (bad JSON, wrong choice count) triggers retry with a stricter prompt; if retry fails, 500 with a clear error.
- Auth: anonymous users can GET questions (cache hit only — no generation) but not `/submit` or `/history`.
- FK cascade: delete a user → their attempts gone; delete a book → its questions + attempts gone.

**Frontend:**
- Jest: QuizPanel state machine (idle → generating → active → results → history).
- RTL: user clicks through a full quiz, sees inline explanations after submit.
- E2E (smoke tag): open reader → switch to Quiz tab → generate → answer → see results.

**AI quality:**
- One golden test calling real Gemini with a known chapter from Pride & Prejudice, verifying the JSON schema validates. Gated behind `RUN_AI_TESTS=1` so CI never pays the cost.

## Open questions

1. **Where does the quiz LLM call happen?** Shared backend Gemini key (like chapter summaries) or user's own key (like translations)? Proposal: **shared key**, because the quiz is a cache-heavy read-most-once artifact just like `chapter_summaries` which already uses the shared path. Cost is bounded by unique (book, chapter, language) triples, not user count.

2. **Rate limits for generation?** A malicious client could hammer `/generate` on many chapters to deplete the shared Gemini key. Proposal: reuse `translation_queue.py`'s per-minute rate limiter pattern, capped at ~20 generations per minute globally.

3. **Question regeneration UX?** If a user thinks the quiz is bad, can they regenerate? v1: no. Admin can delete-and-regenerate from the admin panel (follow-up PR).

4. **History pagination?** Fine-grained pagination probably overkill for v1 (avg user might accrue 50–100 attempts). Load full list, `LIMIT 200 ORDER BY created_at DESC`. Revisit if a power-user hits the cap.

5. **Should the quiz consider the user's vocabulary?** E.g. biasing toward words they've saved. Proposal: out of scope for v1 — adds prompt complexity and a per-user cache dimension. Revisit after launch.

## Rollout

1. Merge this design doc (this PR)
2. **Implementation PR 1**: migration + backend router + tests (closes #557)
3. **Implementation PR 2**: frontend QuizPanel + history tab + Jest/RTL tests
4. **Implementation PR 3**: E2E smoke test (after the frontend is wired)

Each implementation PR stays under 500 LOC diff for reviewability. No PR depends on a later PR — they can ship in order with no forward references.

## References

- Parent feat issue: #557
- Pattern precedent: `docs/design/chapter-summary.md` (shared-key AI cache)
- Pattern precedent: `docs/design/declared-fks-schema.md` (ON DELETE CASCADE policy)
- Frontend sidebar precedent: `ChapterSummary` panel (component + lazy-load pattern)
