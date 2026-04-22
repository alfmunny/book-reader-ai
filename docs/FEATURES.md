# Book Reader AI — Feature Roadmap

## Session 3 — 2026-04-22

### Implemented this session
- [x] AI Chapter Summary (PR #262)
- [x] Reading Statistics Dashboard (PR #268)
- [x] Immersive Reading Mode (PR #301)

### Proposed (design docs below)
- [ ] Vocabulary Flashcards / Spaced Repetition System (SRS)

## Session 4 — 2026-04-22 (planning)

### Proposed this session
- [ ] Guest Reading Experience (Feature 6)
- [ ] User-Uploaded Books with chapter editor (Feature 7)
- [ ] Pre-Translation Tooling / offline models (Feature 8)

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

---

## Feature 6: Guest Reading Experience — PROPOSAL

### Overview
Non-logged-in users can browse and read any book, and see existing (cached) translations for free. They cannot generate new translations, cannot save vocabulary, and cannot access AI features. Reading progress lives in `localStorage` only. The goal: reduce friction to zero for first-time visitors and show the product's value before asking for a sign-up.

### User Story
> "I found this app via a link. I want to read the first few chapters of Pride and Prejudice in German before deciding whether to make an account."

### Current State (problem)
- Likely all API routes require auth; the reader breaks entirely for guests
- No guidance when a guest tries to enable features that require an account

### Design

#### What guests can do
| Feature | Guest | Logged-in |
|---|---|---|
| Browse book list | ✅ | ✅ |
| Read chapter text | ✅ | ✅ |
| View cached translations | ✅ (read-only) | ✅ |
| Generate new translations | ❌ → sign-in prompt | ✅ |
| TTS playback | ✅ (browser TTS or cached audio) | ✅ |
| Reading progress | localStorage only | Server + localStorage |
| Vocabulary save | ❌ → sign-in prompt | ✅ |
| Annotations / Chat / Insights | ❌ → sign-in prompt | ✅ |
| AI Chapter Summary | ❌ → sign-in prompt | ✅ |

#### Backend changes

**Public routes** (no auth required):
- `GET /books` — already public? confirm
- `GET /books/{id}` — confirm public
- `GET /books/{id}/chapters` — confirm public
- `GET /translation/status/{book_id}/{chapter_index}/{lang}` — make public; returns cached translations only
- `GET /ai/summary/{book_id}/{chapter_index}` — make public (read-only, no generation)

**Auth-required routes** (return `401` for guests; frontend handles gracefully):
- `POST /translation/translate` — triggers generation
- `POST /vocabulary`, `GET /vocabulary` — all vocab endpoints
- `POST /annotations`, etc.
- `POST /ai/summary`, `DELETE /ai/summary`
- `GET /user/stats`, `PUT /user/reading-progress`

The auth middleware should be adjusted to allow the public routes above without a session token. Currently it likely blanket-blocks everything.

#### Frontend changes

**Reading progress — localStorage fallback**
```typescript
// lib/guestProgress.ts
const KEY = (bookId: string) => `guest-progress-${bookId}`;
export function getGuestProgress(bookId: string): number { ... }
export function saveGuestProgress(bookId: string, chapter: number): void { ... }
```
When the user is not logged in, the reader reads/writes chapter index from `localStorage` instead of calling `PUT /user/reading-progress`.

**Translation toggle — guest behaviour**
1. User enables translation toggle.
2. Frontend fetches `GET /translation/status/{book_id}/{chapter}/{lang}`.
3. If cached translation exists → render it (no prompt needed).
4. If translation does not exist → show a non-blocking inline banner:

```
┌──────────────────────────────────────────────────────┐
│  No translation available for this chapter yet.      │
│  Sign in to generate one — it takes about 10 sec.   │
│                            [Sign in]  [Dismiss]      │
└──────────────────────────────────────────────────────┘
```

**Mobile-specific reminder (the key UX ask)**
On mobile, the translation panel is likely a bottom sheet or a toggle in the reader toolbar. If the guest tries to turn on translation and no cached data exists:
- Show a modal bottom sheet (not a tiny toast) explaining the situation clearly
- "This chapter hasn't been translated yet. Create a free account to generate translations — they're cached and shared for everyone."
- CTA: "Sign up free" / "Maybe later"

**Sidebar tabs for guests**
Tabs that require auth (Vocab, Chat, Notes, Insights, Summary) should:
- Still be visible (hiding them makes the product look limited)
- Show a brief locked state when tapped: "Sign in to access [feature name]" with a CTA
- Never silently 404

**Profile / Settings**
- Show a stripped settings page for guests: only typography settings (localStorage)
- No stats, no vocab, no annotation history
- Prominent "Create account" banner at the top

#### Sign-in prompt strategy
Use a single `<AuthPromptModal>` component triggered by any locked action. Props: `feature` (string shown in the message). This avoids duplicating sign-in UI across every locked feature.

```typescript
// Example usage
<AuthPromptModal
  open={showAuthPrompt}
  feature="vocabulary saving"
  onClose={() => setShowAuthPrompt(false)}
/>
```

### Edge Cases
- Guest changes language setting → save to localStorage; apply on next visit
- Guest clicks "Translate" on a chapter with a partial cache (some paragraphs done, some not) → show what's cached, show "Sign in to complete" for missing paragraphs
- Guest navigates to `/profile` → redirect to a minimal guest profile page, not a 404

### Tests
- Backend: public routes return data without auth token; restricted routes return 401
- Frontend: guest progress saved/loaded from localStorage; `AuthPromptModal` shown on locked actions; translation toggle shows banner when no cache exists; translation renders when cache exists

### Estimated effort
~5 hours (backend auth middleware changes + frontend guest state + AuthPromptModal + mobile UX)

---

## Feature 7: User-Uploaded Books (.txt / .epub) — PROPOSAL

### Overview
Logged-in users can upload their own books as `.txt` or `.epub` files. Each uploaded book is private — only the uploader and admins can read it. The hard problem is chapter detection: unlike Gutenberg HTML (which has semantic `<h2>` tags), uploaded files have no guaranteed structure. We solve this with auto-detection followed by a manual chapter editor where the user can adjust splits before finalising.

### User Story
> "I have a German novel as an epub that isn't on Gutenberg. I want to read it here with translation and TTS, the same way I read public books."

### Constraints
| Constraint | Value | Rationale |
|---|---|---|
| Max books per user | 10 | Prevent storage abuse |
| Max file size (.txt) | 3 MB | ~1.5M words — longer than any normal novel |
| Max file size (.epub) | 15 MB | Accounts for embedded images |
| Allowed formats | `.txt`, `.epub` | Common, parseable without heavy tooling |
| Visibility | Owner + admin only | Privacy |

### Database changes

```sql
-- Add columns to books table
ALTER TABLE books ADD COLUMN source TEXT NOT NULL DEFAULT 'gutenberg';
  -- values: 'gutenberg' | 'upload'
ALTER TABLE books ADD COLUMN owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
  -- NULL for gutenberg books (shared); set for uploads

-- Track upload metadata
CREATE TABLE IF NOT EXISTS book_uploads (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename    TEXT NOT NULL,
    file_size   INTEGER NOT NULL,
    format      TEXT NOT NULL,  -- 'txt' | 'epub'
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX book_uploads_user ON book_uploads(user_id);
```

Privacy enforcement: Every `SELECT` on `books` for non-admin users must add `AND (source = 'gutenberg' OR owner_user_id = ?)`. Enforced at the service layer, not just the route.

### Backend: Parsing Pipeline

#### Step 1 — Upload endpoint
```
POST /books/upload
Content-Type: multipart/form-data
Body: { file: <binary> }

Response:
{
  "book_id": 12345,
  "title": "Detected Title",
  "author": "Detected Author",
  "format": "epub",
  "detected_chapters": [
    { "index": 0, "title": "Chapter I", "start_offset": 0, "preview": "It was a dark..." },
    { "index": 1, "title": "Chapter II", "start_offset": 4821, "preview": "The next morning..." }
  ],
  "status": "pending_chapter_confirmation"
}
```

The upload stores raw text in a temp table and returns detected chapter boundaries for the user to review. The book is NOT yet queryable for reading until the user confirms splits.

#### Step 2 — Chapter detection

**For .epub:**
- Parse with `ebooklib` (Python)
- Use the spine + TOC: each spine item is typically one chapter
- Extract text per spine item; preserve order
- Title/author from OPF metadata

**For .txt:**
Apply heuristics in order of confidence:

```python
CHAPTER_PATTERNS = [
    r'^\s*CHAPTER\s+[IVXLC\d]+',          # CHAPTER I, CHAPTER 12
    r'^\s*Chapter\s+[IVXLC\d\w]+',         # Chapter One, Chapter 1
    r'^\s*PART\s+[IVXLC\d]+',              # PART I
    r'^\s*[IVX]{1,6}\.\s*$',               # Roman numeral alone on a line
    r'^\s*\d+\.\s*$',                       # "1." alone on a line
    r'^\s*[A-Z][A-Z\s]{4,40}\s*$',         # ALL CAPS SHORT LINE (title-like)
]
```

- Scan line by line; a "chapter boundary" is any line matching a pattern preceded by ≥2 blank lines
- If fewer than 2 boundaries detected: fall back to "split every N words" (N=5000), warn user
- Return at most 200 detected chapters (hard cap)

#### Step 3 — Confirm / edit endpoint
```
POST /books/{book_id}/chapters/confirm
Body: {
  "chapters": [
    { "title": "Chapter I", "start_offset": 0 },
    { "title": "Chapter II", "start_offset": 4821 }
  ]
}
```
On confirmation, the service writes rows into the `chapters` table and sets `books.status = 'active'`. The book is now readable.

#### Step 4 — Delete / quota check
```
DELETE /books/{book_id}   (owner or admin only)
GET    /books/upload/quota  → { used: 3, max: 10, bytes_used: 1240000, bytes_max: 31457280 }
```
Quota checked before accepting the upload. Return `429` with a clear message if exceeded.

### Frontend: Upload + Chapter Editor Flow

#### Upload page (`/upload`)

```
┌─────────────────────────────────────────────┐
│  Upload your book                            │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │   Drag & drop .txt or .epub here    │   │
│  │         or  [Choose file]           │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  3 / 10 books used  ████░░░░░░  (quota)    │
│                                             │
│  Limits: .txt ≤ 3 MB · .epub ≤ 15 MB       │
└─────────────────────────────────────────────┘
```

After upload: spinner with "Detecting chapters…" then transition to the Chapter Editor.

#### Chapter Editor (`/upload/{book_id}/chapters`)

This is the critical UX. Layout: two-panel.

```
┌─────────────────────────┬──────────────────────────┐
│  CHAPTER LIST  (left)   │  PREVIEW  (right)        │
│                         │                          │
│  [+ Add split here]     │  Selected chapter text   │
│                         │  shown here, scrollable  │
│  ▼ Chapter I            │                          │
│    "It was a dark ..."  │  First 500 chars of the  │
│    1,240 words          │  selected chapter.       │
│                         │                          │
│  ▼ Chapter II           │  Helps user verify the   │
│    "The next morning …" │  split is in the right   │
│    980 words            │  place.                  │
│                         │                          │
│  ▼ Chapter III          │                          │
│    [untitled]           │                          │
│    2,100 words          │                          │
│                         │                          │
│  [+ Add split here]     │                          │
│                         │                          │
│         [Confirm & Start Reading →]                │
└────────────────────────────────────────────────────┘
```

**Chapter list interactions:**
- **Click chapter** → preview pane shows its first 500 chars
- **Edit title** → inline text input, saved immediately
- **Merge with next** → ⌃ button; removes the boundary between this and the next chapter
- **Split** → "Add split here" inserts a new boundary; user can drag it up/down by line count
- **Drag to reorder** → not needed (chapters are positional; reordering would break the text)
- **Delete chapter** → only if it's a trivial/empty one; content merges into previous

**Word count badge:** Each chapter row shows word count. If a chapter is >8,000 words, highlight in amber ("Long chapter — consider splitting"). If <100 words, highlight in amber ("Short — consider merging").

**"Confirm & Start Reading"** sends `POST /books/{book_id}/chapters/confirm` and redirects to `/reader/{book_id}`.

### Book list integration
- Uploaded books appear in the main book list with a small "Uploaded" badge
- Sorting: uploaded books listed after public books by default, but user can filter
- Admin sees all uploaded books with owner name

### Tests
- Backend: upload quota enforcement, .epub spine parsing, .txt chapter detection patterns, confirm endpoint writes correct chapter rows, privacy filter (other users can't access)
- Frontend: file size validation before upload, chapter editor merge/split actions, word count badges, confirm redirects to reader

### Estimated effort
~12 hours. The chapter editor UI is the largest single piece (~5 hours). Backend parsing is ~3 hours. The rest is plumbing.

### Open questions
1. Should we store the original file, or just the parsed text? (Storage vs re-parse ability)
2. Should chapter titles be editable after confirmation? (Probably yes via a simple rename)
3. epub images: strip them (text-only reader) or store as base64? Recommend strip for v1.

---

## Feature 8: Pre-Translation Tooling (Offline Models) — PROPOSAL

### Problem
Translating a full book on-demand is slow (10–60 sec per chapter) and burns API credits. Pre-translating popular books offline and writing results directly to the DB would make the first user to read any chapter see instant translations. This is a developer/ops tooling feature, not a user-facing feature.

### Use Cases
1. Pre-populate translations for the 50 most-read Gutenberg books before launch
2. Nightly batch job for newly added books
3. Admins trigger re-translation of specific books after model upgrades

### Architecture (shared across all options)

```
CLI script: scripts/pretranslate.py
  --book-id <N>        (or --all for all books)
  --lang <de|fr|...>
  --provider <option>
  --dry-run

Flow:
  1. Load chapters from DB (skip already-translated ones)
  2. For each chapter: call translate(text, provider)
  3. Write result to chapter_translations table
  4. Log progress + cost estimate
```

The script reuses the same DB schema as the live app — no new tables needed. `cached=True` rows written this way are served instantly to users.

---

### Option A: Ollama + Local LLM (Llama 3, Mistral, Gemma)

**How it works:** Run an Ollama server locally or on a dedicated machine. The script calls `POST http://localhost:11434/api/generate` with a translation prompt. No API key required.

**Prompt approach (same as current Gemini prompt, adapted):**
```
Translate the following text to {lang}. Return only the translated text, no commentary.
Preserve paragraph breaks exactly.

{chapter_text}
```

**Pros:**
- Zero marginal cost after setup
- No rate limits
- Full data privacy (text never leaves your infra)
- Works air-gapped

**Cons:**
- Quality significantly below GPT-4 / Gemini 1.5 Pro for literary text (nuance, idiom, style)
- Needs a GPU for acceptable speed (~4–8 tokens/sec on CPU vs ~80+ on GPU)
- 7B models struggle with long context; chapters >2000 tokens may need chunking
- Setup overhead: pull model, configure Ollama, manage VRAM

**Best model choices:**
| Model | Quality | VRAM | Speed (GPU) |
|---|---|---|---|
| Mistral 7B | Good | 8 GB | ~40 tok/s |
| Llama 3 8B | Good | 8 GB | ~45 tok/s |
| Gemma 2 9B | Better | 10 GB | ~35 tok/s |
| Llama 3 70B | Near-GPT4 | 40 GB | ~15 tok/s |

**Verdict:** Good for cost-zero bulk pre-translation where quality is "good enough". Not suitable if translations are a quality differentiator.

---

### Option B: Helsinki-NLP / MarianMT (HuggingFace)

**How it works:** Dedicated encoder-decoder translation models trained on parallel corpora. Run entirely locally via `transformers` library. One model per language pair (e.g., `Helsinki-NLP/opus-mt-en-de`).

```python
from transformers import MarianMTModel, MarianTokenizer
model_name = "Helsinki-NLP/opus-mt-en-de"
tokenizer = MarianTokenizer.from_pretrained(model_name)
model = MarianMTModel.from_pretrained(model_name)
```

**Pros:**
- Deterministic, fast on CPU (~2–5 sec/paragraph)
- Small model size (~300 MB per language pair)
- High quality for supported pairs (en↔de, en↔fr, en↔es, en↔ru, etc.)
- Purpose-built for translation — no prompt engineering needed

**Cons:**
- Coverage: ~1,300 language pairs exist, but quality varies; rare languages are poor
- Hard token limit: 512 tokens per segment — long paragraphs must be split and re-joined
- No instruction following: can't tell it to preserve formatting or paragraph breaks
- No literary style adaptation (it's neural MT, not a generative model)

**Verdict:** Best choice for common European language pairs (de/fr/es/it/ru/nl) where you want fast, free, reliable pre-translation. Quality is roughly DeepL-equivalent for these pairs. A good default for v1 tooling.

---

### Option C: LibreTranslate (Self-hosted)

**How it works:** Open-source translation server wrapping Argos Translate (also MarianMT under the hood). Exposes an HTTP API identical to a hosted translation API.

```bash
docker run -ti --rm -p 5000:5000 libretranslate/libretranslate
curl -X POST http://localhost:5000/translate \
  -d '{"q":"Hello","source":"en","target":"de","format":"text"}'
```

**Pros:**
- Dead simple to run (one Docker command)
- Supports auto-detection of source language
- Same API shape regardless of backend; easy to swap
- Can download additional language models at runtime

**Cons:**
- Quality equivalent to MarianMT (it uses the same models)
- Extra HTTP hop vs calling HuggingFace directly
- Docker dependency
- No context window management — you must chunk yourself

**Verdict:** Good if you want a drop-in translation microservice and don't want to write HuggingFace code. Quality is identical to Option B. Choose B if you're already using Python; choose C if you want a language-agnostic HTTP service.

---

### Option D: DeepL API (Cheap Batch Tier)

**How it works:** DeepL offers a paid API at ~$25/million characters. A full novel (~600,000 chars) costs ~$15. DeepL quality is best-in-class for European languages, on par with GPT-4 for translation tasks.

```python
import deepl
translator = deepl.Translator(DEEPL_API_KEY)
result = translator.translate_text(chapter_text, target_lang="DE")
```

**Pros:**
- Best quality for European languages — noticeably better than MarianMT for literary text
- Fast (no GPU needed)
- Simple integration, reliable uptime
- Free tier: 500,000 chars/month

**Cons:**
- Not free at scale: 100 books × 10 chapters × 5,000 chars = 5M chars = ~$125/run
- Requires internet + API key
- Doesn't support all language pairs (strong for EU languages, weak for Asian)
- Text leaves your infrastructure

**Verdict:** Best quality-to-effort ratio for bulk pre-translation of European-language books when cost is acceptable. The free tier is enough for ~1–2 full novels/month.

---

### Option E: Current Gemini API (Async Batch)

**How it works:** Google's Gemini API now offers a batch inference endpoint at 50% discount vs real-time. The script submits all chapters as a batch job; results come back async (typically 30 min–24 hours).

**Pros:**
- Same quality as the live translation (consistent user experience)
- No infrastructure change — same Gemini key already in use
- 50% cheaper than real-time API for bulk

**Cons:**
- Not truly offline
- Latency: not instant, 30 min to 24 hours per batch
- Requires managing async job state (poll for completion)

**Verdict:** Good for pre-populating translations overnight with the same quality as live translations. Use this if consistency between pre-translated and user-triggered translations matters (avoids "why does this chapter look different?").

---

### Recommendation

| Goal | Recommended Option |
|---|---|
| Zero cost, acceptable quality (EU languages) | **B: Helsinki-NLP / MarianMT** |
| Zero cost, best quality, have a GPU | **A: Ollama + Llama 3 70B** |
| Zero infrastructure, best quality, small budget | **D: DeepL API** |
| Identical quality to live app | **E: Gemini Batch API** |
| Language-agnostic HTTP microservice | **C: LibreTranslate** |

**Suggested v1 implementation:** Start with **Option B (MarianMT)** for European pairs and fall back to **Option A (Ollama)** for other languages. Both are free and require no external API keys. Wrap them in the same `translate(text, lang, provider)` interface so options are swappable via CLI flag.

### Script interface (proposed)
```bash
# Pre-translate one book into German using MarianMT
python scripts/pretranslate.py --book-id 1342 --lang de --provider marian

# Pre-translate all books into French using Ollama/Llama3
python scripts/pretranslate.py --all --lang fr --provider ollama --model llama3:8b

# Dry run: shows what would be translated, estimated time, no DB writes
python scripts/pretranslate.py --book-id 1342 --lang de --provider marian --dry-run

# Re-translate (overwrite existing cache)
python scripts/pretranslate.py --book-id 1342 --lang de --provider deepl --force
```

### Estimated effort
- **Option B (MarianMT) script:** ~4 hours (HuggingFace setup, chunking for 512-token limit, DB write, progress bar)
- **Option A (Ollama) script:** ~3 hours (HTTP call to Ollama, same chunking logic)
- **Combined with shared interface:** ~6 hours total
