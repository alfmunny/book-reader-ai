# Per-User Translation Versions

**Status:** Draft — all open questions resolved by owner (2026-08-26); awaiting formal approval
**Author:** Dev (Claude session, owner-directed)
**Date:** 2026-08-26
**Priority:** P1
**Prior work:** #2734 (this design's issue), #2658/#2662 (BYOK provider keys + dispatch), #2683 (actionable provider errors), migration 033 (editorial `translations` table), #2624 (fossilized editorial pipeline)

## Problem

Translations today are **editorial and global**: one cached version per `(book, chapter, language)`, produced by the admin's queue/fossilized pipeline and shared by every reader. A reader cannot:

- create their **own** translation with their **own** provider key (DeepSeek / Claude),
- steer the **style** ("elegant written Chinese, keep the verse line structure, prefer 意译 over 直译"),
- work through a book **gradually** — one chapter or one passage at a time,
- **fix or replace** a passage they dislike, or
- compare/switch against the editorial version.

The owner also wants a future path where a polished personal version can be **published** for other readers to read, comment on, and discuss.

## Solution overview

A user-owned translation layer beside the editorial one:

```
                       ┌───────────────────────────────┐
  Reader translation   │  Version switcher (toolbar)   │
  tab                  │  ◉ Editorial                  │
                       │  ○ Mine · deepseek-v4-flash   │
                       │  ○ (future: published by X)   │
                       └───────────────────────────────┘
                                   │ renders through the SAME
                                   ▼ parallel/inline pipeline
                    paragraphs[] aligned to the chapter split
```

- **Storage**: per-user version header + per-paragraph rows, so partial coverage is natural (translate as you read; untranslated paragraphs fall back visibly).
- **Provider**: the existing BYOK dispatch (deepseek → claude, per user choice), each stored paragraph **tagged with the model** that produced it.
- **Style prompt**: a per-version instruction the user writes once and can edit; sent as part of the system prompt on every run; last-used value is the default for new runs.
- **Operations in the reading page**: translate chapter, translate one paragraph, retranslate (optionally with a different provider), edit manually, delete paragraph, delete version, switch version.
- **Publishing**: schema and status field designed in now; endpoints/UI ship as a follow-up phase.

## Schema (migration 044 — additive only, no cleanup step required)

The unit of work is a **named translation session** (owner refinement, 2026-08-26): the user starts translating a book under a name they choose ("诗意版", "Literal study"), all work lands in that session across chapters, and they can switch sessions or start a new one at any time.

```sql
CREATE TABLE translation_sessions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    book_id         INTEGER NOT NULL REFERENCES books(id)  ON DELETE CASCADE,
    name            TEXT    NOT NULL,                  -- user-chosen session name
    target_language TEXT    NOT NULL,                  -- one language per session
    style_prompt    TEXT,                              -- user's standing instructions
    provider        TEXT    NOT NULL,                  -- default provider for new runs
    status          TEXT    NOT NULL DEFAULT 'private',-- 'private' | 'published' (phase 2)
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, book_id, name)
);

CREATE TABLE translation_session_paragraphs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      INTEGER NOT NULL REFERENCES translation_sessions(id) ON DELETE CASCADE,
    chapter_index   INTEGER NOT NULL,
    paragraph_index INTEGER NOT NULL,                  -- aligns with chapter paragraph split
    text            TEXT    NOT NULL,
    provider        TEXT    NOT NULL,                  -- what ACTUALLY produced this paragraph
    model           TEXT    NOT NULL,                  -- e.g. 'deepseek-v4-flash' — the visible tag
    edited_by_user  INTEGER NOT NULL DEFAULT 0,        -- 1 after a manual edit (tag shows "edited")
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, chapter_index, paragraph_index)
);
CREATE INDEX ts_paragraphs_by_chapter ON translation_session_paragraphs(session_id, chapter_index, paragraph_index);
```

A session is **book-scoped** — it spans chapters, so "continue translating where I stopped" is the natural flow, and per-book session management (rename, delete, switch) lives in one place. Sessions carry exactly one target language; a zh session and an en session are simply two sessions.

Why per-paragraph rows instead of one JSON blob (as the editorial table does):
- **Partial coverage** is first-class — the sentence-by-sentence workflow is "translate the paragraph I'm reading now"; untranslated paragraphs simply have no row.
- **Mixed provenance** — the user can translate most of a chapter with DeepSeek and redo two stanzas with Claude; each paragraph keeps its true model tag.
- **Cheap edits** — a manual fix updates one row, not a re-serialized blob.

Paragraph alignment uses the same `text.split(/\n\n+/)` contract the editorial pipeline and `SentenceReader` already share. The chapter's split is stable for frozen books (#2624); the design keys on `paragraph_index` only, exactly like editorial `paragraphs[]`.

## API

All endpoints require auth and operate only on the caller's rows (404 on other users' ids). Provider errors reuse the actionable 502 mapping from #2683.

```
GET    /translation-sessions?book_id
       → the user's sessions for this book: [{id, name, target_language, provider,
         style_prompt, status, chapters_covered, updated_at}]

POST   /translation-sessions            { book_id, name, target_language, provider, style_prompt? }
       → create a session (409 on duplicate name for the book).
PATCH  /translation-sessions/{id}       { name? | style_prompt? | provider? } → rename / retune.
DELETE /translation-sessions/{id}       → delete the session and all its paragraphs.

GET    /translation-sessions/{id}/chapters/{chapter_index}
       → { paragraphs: {index: {text, provider, model, edited_by_user}} } (may be partial)

POST   /translation-sessions/{id}/translate
       { chapter_index, scope: "chapter" | {paragraph_index}, provider?: override }
       → translates the scope with the user's stored key using the session's
         style_prompt (+ optional one-off provider override), upserts paragraph
         rows tagged with the concrete model.
       Chapter scope translates paragraphs concurrently in small batches (the
       claude.translate_text chunking pattern), skipping paragraphs that already
       have an edited_by_user row unless force=true.

PATCH  /translation-sessions/{id}/chapters/{ch}/paragraphs/{index}   { text }
       → manual edit; sets edited_by_user=1 (tag renders as "edited").
DELETE /translation-sessions/{id}/chapters/{ch}/paragraphs/{index}   → remove one paragraph.
```

**Provider call**: a new `services/user_translate.py` with one function per provider, mirroring the BYOK helpers in `services/claude.py` / `services/deepseek.py`:

- System prompt = the existing `SYSTEM_TRANSLATOR` (line-structure preservation rules) **plus the user's `style_prompt`** appended under a `Reader's requirements:` heading.
- Claude: `claude-sonnet-5`, `output_config={"effort": "low"}` (same cost profile as chat — a chapter ≈ 1–3 cents).
- DeepSeek: `deepseek-v4-flash` (a chapter ≈ 0.1–0.3 cents).
- No server-side cross-provider fallback (same rule as chat: never bill a user's key on a model they didn't pick).

## Reader UI

All changes live in the existing translation tab + `SentenceReader` rendering path; the parallel/inline renderer is reused untouched (it consumes `translations: string[]`).

1. **Target language**: the existing select governs the Editorial source. Each user session carries its own language (shown as a chip on the session entry); selecting a session displays that session's language.
2. **Session switcher** below the language select: `Editorial` / the user's named sessions for this book / `+ New session`. Creating a session asks for a name, target language, provider, and optional style prompt. The active session per book persists in settings. A small overflow menu on each session offers Rename / Delete. Switching is instant and non-destructive. 
3. **Style panel** (below the switcher): edits the ACTIVE session's style prompt and default provider (DeepSeek/Claude, gated on stored keys like the chat dropdown), plus a "Translate whole chapter" button with per-paragraph progress and a per-book coverage line (e.g. "chapters 1–4 of 28 covered").
4. **Per-paragraph actions** (visible in "Mine" mode, on hover/tap of a translation block):
   - **Translate / Retranslate** — runs `scope: {paragraph_index}` with the current style + provider; a small provider picker on the button allows a one-off different provider.
   - **Edit** — inline textarea (same pattern as the notes-page question editing), saves via PATCH, tags the paragraph "edited".
   - **Delete** — removes the row; the block falls back to an "untranslated" placeholder with a Translate button.
   - Each block shows its **model tag** (`deepseek-v4-flash` / `claude-sonnet-5` / `edited`) as a muted chip.
5. **Untranslated paragraphs** in "Mine" mode render a subtle placeholder ("not translated yet — Translate") instead of silently showing nothing; a toggle "fill gaps from editorial" is explicitly **out of scope for v1** (mixing sources hides which words came from whom).
6. **Sentence-by-sentence** granularity maps to **paragraph** operations in v1: tapping "translate this" on a selected sentence translates its containing paragraph. True sub-paragraph patching requires sentence-level alignment bookkeeping that the editorial pipeline doesn't have either — deliberately deferred (open question 1).

## Phase 2 — publishing (schema-ready now, shipped later)

Two distinct publishing tracks (owner decision, 2026-08-26):

**Track A — story shares (social, partial).** A reader shares a translated paragraph (or a small consecutive range) from a session as a **story** in their storyline — a social post others can read and discuss. Partial coverage is the point: "look how I rendered this stanza."

```sql
CREATE TABLE translation_stories (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id      INTEGER NOT NULL REFERENCES translation_sessions(id) ON DELETE CASCADE,
    chapter_index   INTEGER NOT NULL,
    paragraph_start INTEGER NOT NULL,
    paragraph_end   INTEGER NOT NULL,                  -- inclusive; == start for one paragraph
    caption         TEXT,                              -- the author's note on the share
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

The story snapshots nothing — it references live session paragraphs (an author improving their rendering improves the story). Comments anchor to the story.

**Track B — complete session publication (reading, selection).** Publishing a session as a readable, selectable translation version in other readers' switchers requires the **whole book translated** — every paragraph of every chapter covered. `status='published'` is only reachable through that completeness check; `published_at` is stamped. Visitors get a coherent full translation or nothing — no half-books in the reader switcher.

- `GET /translation-sessions/published?book_id` → `{author_name, session_name, target_language, model_tags, published_at, id}`; the reader's switcher grows a "Community" group (complete sessions only).
- `GET /stories?book_id` (and later a cross-book feed) → story shares for the social surface.
- **Comments**: `translation_comments (id, story_id NULL, session_id NULL, chapter_index NULL, paragraph_index NULL, user_id, body, created_at)` — anchored to a story (track A) or to a published session's paragraph (track B).
- Moderation: owner/admin can unpublish either kind.
- **Future idea (owner, 2026-08-26): comparison view** — render two or more versions side by side (e.g. Editorial · 诗意版 · a community session) for the same paragraph, to compare renderings. Not scheduled; the per-paragraph storage keeps this cheap — any version's paragraph is addressable by (chapter_index, paragraph_index).
- Phase 2 gets its own implementation issue after this doc merges; nothing in phase 1 blocks on it.

## Costs

Per chapter (~2k words in, similar out): DeepSeek V4-Flash ≈ $0.001–0.003; claude-sonnet-5 (low effort) ≈ $0.01–0.03. A full Faust (28 chapters) ≈ $0.05 / $0.60 respectively. Style-prompt retries are the dominant cost driver; per-paragraph retranslation keeps iteration cheap.

## Testing

- **Backend**: ownership isolation (404 across users), upsert semantics, scope=paragraph vs chapter, edited-paragraph skip on chapter re-runs, provider dispatch with mocked BYOK helpers, style prompt reaches the system prompt, actionable 502s, migration column test.
- **Frontend**: switcher persistence + instant toggle, per-paragraph action flows (translate/edit/delete with mocked API), model-tag rendering, untranslated placeholder, provider gating mirrors chat.
- **E2E**: translate one paragraph → renders in parallel view → switch to editorial → switch back (version intact).

## Rollback

All schema is additive; disabling the feature is removing the UI entry points. No editorial-pipeline behavior changes.

## Open questions

1. ~~Sub-paragraph granularity~~ **Resolved (owner, 2026-08-26)**: paragraph-level operations are the v1 contract — a tapped sentence translates its containing paragraph. True sentence-level patching is deferred until a concrete need appears.
2. ~~Multiple named versions~~ **Resolved (owner, 2026-08-26)**: the unit is a named, book-scoped translation session; users create, name, and switch between as many as they like.
3. ~~Editorial fallback~~ **Resolved (owner, 2026-08-26)**: explicit "not translated" placeholders, no mixing — a session is one coherent version, and rendering another translation into it would blur whose words are whose. (Related future idea recorded below: multi-version comparison view.)
4. ~~Publish scope~~ **Resolved (owner, 2026-08-26)**: two tracks — story shares of a paragraph or range (partial, social, discussable) vs. full-session publication into the reader switcher, which requires the complete book translated.
