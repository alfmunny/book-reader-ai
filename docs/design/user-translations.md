# Per-User Translation Versions

**Status:** Draft
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

```sql
CREATE TABLE user_translations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    book_id         INTEGER NOT NULL REFERENCES books(id)  ON DELETE CASCADE,
    chapter_index   INTEGER NOT NULL,
    target_language TEXT    NOT NULL,
    style_prompt    TEXT,                              -- user's standing instructions
    provider        TEXT    NOT NULL,                  -- default provider for this version
    status          TEXT    NOT NULL DEFAULT 'private',-- 'private' | 'published' (phase 2)
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, book_id, chapter_index, target_language)
);

CREATE TABLE user_translation_paragraphs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    translation_id  INTEGER NOT NULL REFERENCES user_translations(id) ON DELETE CASCADE,
    paragraph_index INTEGER NOT NULL,                  -- aligns with chapter paragraph split
    text            TEXT    NOT NULL,
    provider        TEXT    NOT NULL,                  -- what ACTUALLY produced this paragraph
    model           TEXT    NOT NULL,                  -- e.g. 'deepseek-v4-flash' — the visible tag
    edited_by_user  INTEGER NOT NULL DEFAULT 0,        -- 1 after a manual edit (tag shows "edited")
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(translation_id, paragraph_index)
);
CREATE INDEX ut_paragraphs_by_translation ON user_translation_paragraphs(translation_id, paragraph_index);
```

Why per-paragraph rows instead of one JSON blob (as the editorial table does):
- **Partial coverage** is first-class — the sentence-by-sentence workflow is "translate the paragraph I'm reading now"; untranslated paragraphs simply have no row.
- **Mixed provenance** — the user can translate most of a chapter with DeepSeek and redo two stanzas with Claude; each paragraph keeps its true model tag.
- **Cheap edits** — a manual fix updates one row, not a re-serialized blob.

Paragraph alignment uses the same `text.split(/\n\n+/)` contract the editorial pipeline and `SentenceReader` already share. The chapter's split is stable for frozen books (#2624); the design keys on `paragraph_index` only, exactly like editorial `paragraphs[]`.

## API

All endpoints require auth and operate only on the caller's rows (404 on other users' ids). Provider errors reuse the actionable 502 mapping from #2683.

```
GET    /translations/mine?book_id&chapter_index&lang
       → { version: {...header, paragraph_count}, paragraphs: {index: {text, provider, model, edited_by_user}} }
       404 when the user has no version for this chapter+lang.

POST   /translations/mine/translate
       { book_id, chapter_index, lang,
         scope: "chapter" | {paragraph_index},
         provider: "deepseek" | "claude",
         style_prompt?: string }
       → upserts the version header (updating style_prompt if given), translates the
         requested scope with the user's stored key, upserts paragraph rows tagged
         with the concrete model, returns the GET shape.
       Chapter scope translates paragraphs concurrently in small batches (the
       claude.translate_text chunking pattern), skipping paragraphs that already
       have an edited_by_user row unless force=true.

PATCH  /translations/mine/{id}/paragraphs/{index}   { text }
       → manual edit; sets edited_by_user=1 (tag renders as "edited").

DELETE /translations/mine/{id}/paragraphs/{index}   → remove one paragraph (falls back in UI).
DELETE /translations/mine/{id}                      → remove the whole version.
```

**Provider call**: a new `services/user_translate.py` with one function per provider, mirroring the BYOK helpers in `services/claude.py` / `services/deepseek.py`:

- System prompt = the existing `SYSTEM_TRANSLATOR` (line-structure preservation rules) **plus the user's `style_prompt`** appended under a `Reader's requirements:` heading.
- Claude: `claude-sonnet-5`, `output_config={"effort": "low"}` (same cost profile as chat — a chapter ≈ 1–3 cents).
- DeepSeek: `deepseek-v4-flash` (a chapter ≈ 0.1–0.3 cents).
- No server-side cross-provider fallback (same rule as chat: never bill a user's key on a model they didn't pick).

## Reader UI

All changes live in the existing translation tab + `SentenceReader` rendering path; the parallel/inline renderer is reused untouched (it consumes `translations: string[]`).

1. **Version switcher** at the top of the translation tab: `Editorial` / `Mine` (radio-style, persisted in `AppSettings.translationSource`). The "Mine" entry shows the version's dominant model tag as a chip (`deepseek-v4-flash`), or "start translating" when no version exists. Switching is instant — both sources are independently cached client-side; the user's version is never mutated by switching.
2. **Style panel** (popover next to the switcher): textarea for the style prompt (prefilled from the version / last used), provider select (DeepSeek/Claude, gated on stored keys like the chat dropdown), and a "Translate whole chapter" button with per-paragraph progress.
3. **Per-paragraph actions** (visible in "Mine" mode, on hover/tap of a translation block):
   - **Translate / Retranslate** — runs `scope: {paragraph_index}` with the current style + provider; a small provider picker on the button allows a one-off different provider.
   - **Edit** — inline textarea (same pattern as the notes-page question editing), saves via PATCH, tags the paragraph "edited".
   - **Delete** — removes the row; the block falls back to an "untranslated" placeholder with a Translate button.
   - Each block shows its **model tag** (`deepseek-v4-flash` / `claude-sonnet-5` / `edited`) as a muted chip.
4. **Untranslated paragraphs** in "Mine" mode render a subtle placeholder ("not translated yet — Translate") instead of silently showing nothing; a toggle "fill gaps from editorial" is explicitly **out of scope for v1** (mixing sources hides which words came from whom).
5. **Sentence-by-sentence** granularity maps to **paragraph** operations in v1: tapping "translate this" on a selected sentence translates its containing paragraph. True sub-paragraph patching requires sentence-level alignment bookkeeping that the editorial pipeline doesn't have either — deliberately deferred (open question 1).

## Phase 2 — publishing (schema-ready now, shipped later)

- `status='published'` on the version header; publishing requires every paragraph translated (no gaps) and snapshots `published_at`.
- `GET /translations/published?book_id&chapter_index&lang` → list of `{author_name, model_tags, updated_at, id}`; the reader's switcher grows a "Community" group.
- **Comments**: new `translation_comments (id, translation_id, paragraph_index NULL, user_id, body, created_at)` — a discussion thread per version, optionally anchored per paragraph. Rendered in a side panel on the reading page.
- Moderation: owner/admin can unpublish; publishing is per-chapter (a book-level "publish all" is sugar later).
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

1. **Sub-paragraph granularity** — is paragraph-level ops acceptable for v1 (a tapped sentence translates its paragraph), or is true sentence-level patching required from the start?
2. **Multiple named versions** per (user, chapter, lang) — v1 assumes one; publishing may eventually want "draft vs published" copies. OK to defer?
3. **Editorial fallback in Mine mode** — v1 shows explicit gaps rather than mixing sources. Confirm.
4. **Publish scope** — per-chapter publishing (proposed) vs whole-book only?
