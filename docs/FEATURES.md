# Book Reader AI — Feature Roadmap

## Session 3 — 2026-04-22

### Implemented this session
- [x] AI Chapter Summary (PR #262)
- [x] Reading Statistics Dashboard (PR #268)
- [x] Immersive Reading Mode (PR #301)

### Proposed (design docs below)
- [ ] Vocabulary Flashcards / Spaced Repetition System (SRS)

---

## Feature 1: AI Chapter Summary ✅ (merged — PR #262)

### Overview
When a user wants to recall what happened in a chapter before continuing, they can click "Summarize" in the reader sidebar to get a concise AI-generated summary. Summaries are cached in the database and shared across all users — just like translations.

### User Story
> "I put down War and Peace for two weeks. I need a quick 30-second refresher on Chapter 12 before I continue."

### Design

**Backend**

New migration `018_chapter_summaries.sql`:
```sql
CREATE TABLE IF NOT EXISTS chapter_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    chapter_index INTEGER NOT NULL,
    model TEXT,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(book_id, chapter_index)
);
```

New endpoint: `POST /ai/summary`
```json
Request:
{
  "book_id": 2600,
  "chapter_index": 12,
  "chapter_text": "...",
  "book_title": "War and Peace",
  "author": "Leo Tolstoy",
  "chapter_title": "Chapter XII"
}

Response:
{
  "summary": "**Overview**: ...\n\n**Key Events**: ...",
  "cached": true,
  "model": "gemini-3.1-flash-lite-preview"
}
```

Caching behaviour: If a summary for (book_id, chapter_index) already exists, return it immediately without calling Gemini. First user to read a chapter generates the summary for everyone.

**Uses the queue API key** (no personal key required) — making summaries freely available to all users.

**Frontend**

New "Summary" tab in the reader sidebar (alongside Chat, Notes, Vocab, Translate):
- Shows a loading skeleton while generating
- Renders the markdown summary using existing styles
- "Regenerate" button (admin only) to refresh stale summaries

### Summary Format (Gemini prompt)
```
Summarize Chapter {title} of "{book_title}" by {author} in a structured format:

**Overview** (2-3 sentences)
**Key Events** (3-5 bullet points)  
**Characters** (who appears and what they do)
**Themes** (1-2 literary themes or motifs)

Be concise. Focus on plot and character development. No spoilers beyond this chapter.
```

### Tests
- Backend: cached vs uncached flow, Gemini mock, 404 for missing book
- Frontend: render summary, loading state, error state

---

## Feature 2: Vocabulary Flashcards (SRS) — PROPOSAL

### Overview
Add Anki-style spaced repetition to the vocabulary system. After saving words while reading, users can review them daily with flashcards. The SM-2 algorithm schedules each card based on how well the user remembered it, surfacing cards at the optimal moment for retention.

### Inspiration
- **Anki** — gold standard for SRS
- **Duolingo** — gamified daily review streaks
- **Readwise** — review your highlights/vocabulary daily

### User Story
> "I've been reading German classics and saving words I don't know. I want a 5-minute daily review session so I actually remember them."

### Database Schema (PROPOSAL — no breaking changes, additive only)

```sql
CREATE TABLE flashcard_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vocabulary_id INTEGER NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
    -- SM-2 fields
    interval_days INTEGER NOT NULL DEFAULT 1,
    ease_factor REAL NOT NULL DEFAULT 2.5,
    repetitions INTEGER NOT NULL DEFAULT 0,
    due_date DATE NOT NULL DEFAULT (date('now')),
    last_reviewed_at TIMESTAMP,
    UNIQUE(user_id, vocabulary_id)
);
CREATE INDEX flashcard_reviews_due ON flashcard_reviews(user_id, due_date);
```

### SM-2 Algorithm (per review)
```
grade: 0-5 (0=blackout, 3=correct with difficulty, 5=perfect)

if grade < 3:
    interval = 1 day (reset)
    repetitions = 0
else:
    if repetitions == 0: interval = 1
    elif repetitions == 1: interval = 6
    else: interval = round(interval * ease_factor)
    repetitions += 1

ease_factor = max(1.3, ease_factor + 0.1 - (5-grade)*(0.08 + (5-grade)*0.02))
due_date = today + interval
```

### API Endpoints (PROPOSAL)
```
GET  /vocabulary/flashcards/due       → [{vocab_id, word, lemma, occurrences, definition}, ...]
POST /vocabulary/flashcards/{id}/review  body:{grade:0-5} → {next_due, interval, ease_factor}
GET  /vocabulary/flashcards/stats     → {total, due_today, streak, reviewed_today}
```

### Frontend (PROPOSAL)
- New route `/vocabulary/flashcards`
- Card front: word + example sentence from reading context
- Card back: definition (Wiktionary) + language + occurrences in books read
- Grade buttons: **Again** (0) | **Hard** (2) | **Good** (3) | **Easy** (5)
- Progress bar: reviewed_today / due_today
- Daily streak counter
- Confetti on completing all due cards

### Pros
- Dramatically increases vocabulary retention (proven pedagogy)
- Natural extension of existing vocabulary system
- No third-party dependency (SM-2 is simple math)
- Works offline (due cards can be fetched once, graded locally, synced later)

### Cons / Risks
- Adds a daily habit loop — if we don't polish the UX, users won't return
- Cold-start: new words must be "seen" once before SRS kicks in
- Definition fetch latency on first review (Wiktionary API)
- If a word is deleted, its review history should cascade-delete

### Proposal Decision
**Awaiting approval.** Implementation would take ~6 hours (backend + frontend + tests).

---

## Feature 3: Reading Statistics Dashboard ✅ (implemented — PR #268)

### Overview
A lightweight personal stats view shown on the Profile page. Shows how much a user has read, saved, and annotated — with a GitHub-style activity heatmap and a daily reading streak.

**Key insight:** `vocabulary.created_at`, `annotations.created_at`, and `book_insights.created_at` already exist in the DB, so the heatmap has real historical data from day 1. A new `reading_history` table adds chapter navigation events going forward.

### User Story
> "I've been using the app for two months. I want to see how consistent I've been, whether my vocabulary is growing, and which books I've spent the most time with."

### Design

**New DB table — `reading_history`** (migration 019, additive only)
```sql
CREATE TABLE reading_history (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id      INTEGER NOT NULL,
    chapter_index INTEGER NOT NULL,
    read_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX reading_history_user_date ON reading_history(user_id, read_at);
```

**Hook:** `PUT /user/reading-progress/{book_id}` calls `log_reading_event()` after upserting progress — one log row per chapter navigation. Lightweight, append-only.

**New endpoint: `GET /user/stats`**
```json
{
  "totals": {
    "books_started": 12,
    "vocabulary_words": 247,
    "annotations": 89,
    "insights": 34
  },
  "streak": 7,
  "longest_streak": 14,
  "activity": [
    { "date": "2026-04-22", "count": 5 },
    { "date": "2026-04-21", "count": 3 }
  ]
}
```

**Activity data** aggregates across all event types:
```sql
SELECT DATE(ts) as day, COUNT(*) as events FROM (
    SELECT created_at AS ts FROM vocabulary WHERE user_id=?
    UNION ALL SELECT created_at FROM annotations WHERE user_id=?
    UNION ALL SELECT created_at FROM book_insights WHERE user_id=?
    UNION ALL SELECT read_at FROM reading_history WHERE user_id=?
) WHERE ts >= DATE('now', '-365 days') GROUP BY day ORDER BY day DESC
```

**Streak algorithm** (Python):
- Count consecutive days ending today (or yesterday if today has no activity yet)

**Frontend — `ReadingStats.tsx` component**
- 4 stat cards: Books / Words / Annotations / Insights
- Streak badge with 🔥 icon
- Activity heatmap: 52-week × 7-day CSS grid, 4 intensity levels
- Embedded in `/profile` page (below preferences, above sign-out)

### Tests
- Backend: streak calculation edge cases (gap, today, yesterday, zero), stat totals, logging hook
- Frontend: renders stats, heatmap cell colors, zero-state

### Estimated effort: 3 hours

---

## Feature 4: Immersive Reading Mode ✅ (merged — PR #301)

### Overview
A distraction-free reading experience with typography customisation and paragraph-level focus + TTS.

### What shipped
- **Focus Mode** (`F` key / button): hides header chrome, shows floating HUD with chapter nav, "Read §" button, Aa panel, and exit
- **Typography Panel** (`Aa` button): font size (S/M/L/XL), font family (Serif/Sans), line spacing (Tight/Normal/Relaxed), content width (Narrow/Normal/Wide) — all persisted to localStorage
- **Paragraph Focus**: dims all paragraphs except the active one (opacity 0.2 → 1 transition). Focus tracks scroll when paused, and tracks TTS position when playing
- **Paragraph TTS**: "Read §" button seeks audio to the focused paragraph's start time and auto-pauses at its end time

### Key settings added
`lineHeight`, `contentWidth`, `fontFamily`, `paragraphFocus` added to `AppSettings`

### Tests
- `TypographyPanel.test.tsx` — 9 tests (controls, callbacks, outside-click, aria)
- `SentenceReader.focus.test.tsx` — 6 tests (para-dim/para-active classes, timings, scroll detection)
- `TTSControls.stopAt.test.tsx` — 2 tests (stopAtTime fires/does not fire)

---

## Feature 5: Chapter Comprehension Quiz (FUTURE)

After reading a chapter, ask 3-5 AI-generated multiple-choice questions to test comprehension. Results stored per user/chapter.

Estimated: 4 hours. Requires approval for DB schema.
