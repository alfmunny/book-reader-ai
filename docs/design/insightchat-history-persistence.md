# InsightChat History Persistence

**Status:** Shipped (design PR #1059, 2026-04-24; backend PR #1061, 2026-04-24; frontend PR #1114)
**Author:** Architect
**Date:** 2026-04-24
**Priority:** P2
**Prior work:** #907 (issue)

## Problem

The InsightChat sidebar (AI reading companion) stores its message thread in `localStorage`, keyed by `chat-history:{userId}:{bookId}`. The user's running conversation is lost when they:

- Open the reader in a different browser
- Clear cache / private window
- Switch devices (laptop → phone)

This contradicts the feature's value proposition — "talk to an AI about the book you're reading" implies that context carries across sessions. A user who spent 20 minutes teaching the AI their preferred level of detail, or asking a complex multi-turn question about Chapter 12, loses all of it by rebooting.

## User story

> "I was mid-conversation with the reading companion on my laptop, walked away to make dinner, picked it up on my phone — and the chat was empty. I don't want to rebuild the thread every time."

## Non-goals

- Cross-book context sharing. Each `(user, book)` thread stays isolated.
- Cross-user thread sharing (i.e. each reader has their own chat; no "public chat" feature).
- AI "memory" beyond the thread itself. Persisting the thread is the feature; using those messages as LLM context is already wired and unchanged.
- Migration of existing localStorage threads from other browsers. The feature begins recording fresh on merge; users don't lose anything (a localStorage thread is already per-browser), they simply start accumulating server-side.
- Full-text search over chat history. Out of scope; `/search` (#733) doesn't index chat.

## Relationship to `book_insights`

`book_insights` already exists (migration 015, Feature 6 flow) and stores **saved** Q&A pairs — ones the user explicitly bookmarks. That schema is:

```
book_insights (id, user_id, book_id, chapter_index, question, answer, created_at, context_text)
```

Reusing it for every in-flight message conflates "I happened to ask this" with "I want to keep this". Post-reuse, a user saving 3 of 30 messages can't distinguish them from the 27 transient ones, and the `get_all_insights` view (shown on the Profile page) would balloon with ephemera.

**Decision**: new table `chat_messages` for the running thread. `book_insights` stays the "saved bookmarks" store.

## Schema

New migration (next free number — rebased at implementation time):

```sql
CREATE TABLE chat_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    role       TEXT    NOT NULL CHECK (role IN ('user', 'assistant')),
    content    TEXT    NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chat_messages_user_book
    ON chat_messages (user_id, book_id, created_at);
```

Declared FKs from day one per the #754 policy. `ON DELETE CASCADE` means deleting a user or a book cleanly removes their chat history without a separate shadow-cleanup in `delete_user` / `admin.delete_book`.

Why a separate row per message (not a JSON blob per thread):
- Pagination friendly (`LIMIT/OFFSET` on a sorted column).
- Streaming-append friendly — no read-modify-write race when two tabs send simultaneously.
- Search-friendly if someone adds it later.
- Matches the typical chat-thread storage pattern in the rest of the industry.

## API

New router `backend/routers/chat.py`:

**`GET /api/chat/{book_id}/messages?limit=50&before_id=N`**
Returns messages for the authenticated user + book, newest first. Server-side cap `limit ≤ 200`. `before_id` enables reverse pagination for infinite-scroll; omit for the freshest page.
```json
{"messages": [{"id": 123, "role": "user", "content": "…", "created_at": "…"}], "has_more": true}
```
401 unauthenticated. Anonymous users have no persistent chat history — localStorage fallback stays for them (see "Migration" below).

**`POST /api/chat/{book_id}/messages`**
Appends one message. Body:
```json
{"role": "user", "content": "What happens in chapter 12?"}
```
Returns the inserted row (so the client picks up the `id` and `created_at` without a round-trip re-fetch).

**`DELETE /api/chat/{book_id}/messages`**
Clears the full thread for this `(user, book)`. Used by the "Clear conversation" button already present in the sidebar. No body. Returns `{"deleted": N}`.

### Why POST + GET instead of one combined call

`/api/ai/chat` (the AI endpoint that wraps Gemini) already owns the "ask the model, get a response" operation. Having it also silently write to the DB would mean the frontend couldn't distinguish "I want to retry this question" (don't persist yet) from "commit this exchange" — and it would leak one service into another. Keeping chat-message persistence a separate explicit operation means:
- The frontend controls when to commit (after successful AI response, not before).
- Tests can exercise the DB behaviour without stubbing Gemini.
- A future "retry without saving" or "edit then resend" UX stays cheap.

Flow: user submits → frontend POSTs user message → frontend calls `/api/ai/chat` with full thread context → on success, frontend POSTs assistant reply. Two round-trips but the cost is one INSERT each.

## Frontend changes

`InsightChat.tsx`:
- Replace `localStorage.getItem(HISTORY_KEY(...))` with a `GET /chat/{bookId}/messages` call on mount (only when `userId` is present — anonymous users keep localStorage).
- Replace `localStorage.setItem(HISTORY_KEY(...))` in the `useEffect` with a `POST /chat/{bookId}/messages` on each new message.
- Keep `SAVED_KEY` (user-bookmarked insights) on the existing `book_insights` path — that logic is separate and unchanged.
- Keep the "Clear conversation" button; swap its localStorage wipe for a `DELETE /chat/{bookId}/messages` call.

`frontend/src/lib/api/chat.ts` new wrapper module.

## Migration path for existing localStorage threads

Users who already have a localStorage thread will have it dwarfed by their server-side thread over time. Two options:

**Option A** (ship): keep localStorage as a **read-only fallback** for one week post-merge. On mount, if server returns 0 messages but localStorage has content, show it and silently POST each entry to the server to seed the thread. Best-effort — if the POST fails we log and move on. Remove the fallback code in a follow-up PR after a week.

**Option B** (alternative): no migration. User's localStorage thread stays visible but never syncs; over time it dries up as they switch devices. Simpler but loses one-time user context.

Recommending **Option A**. A user with useful prior conversation deserves a one-time carry-over.

## Anonymous users

Anonymous users can still use InsightChat (reads Gutenberg books without login). Their chat history:
- Stays localStorage-only (no `user_id` to key against server-side).
- Clears on login (we don't fold anon → user since the server-side thread starts from scratch on first login).

## Rate limiting

A user spamming `POST /chat/.../messages` could fill disk. Mitigation:
- Per-user rate limit: max 60 messages/minute/book (enough for typing-speed users, blocks automated floods).
- Per-message size cap: 8 KB. Rejects with 413 otherwise.
- Per-thread soft cap: no enforcement on message count — a heavy user with 10,000 messages is cheap to store. Pagination handles reads.

## Schema / data migration

- New table only; no existing-data impact. Follows CLAUDE.md migration policy.
- No ADD COLUMN NOT NULL.
- Declared FKs with CASCADE so `delete_user` and `admin.delete_book` need no shadow cleanup.

## API changes (surface)

Three new endpoints under `/api/chat/*`. No changes to existing `/api/ai/chat` or `/api/insights`.

## Test plan

**Backend** (`test_router_chat.py`):
- Auth: anonymous GET / POST / DELETE → 401.
- Happy path: POST, GET, confirm ordering, confirm fields round-trip.
- Pagination: seed 250 messages, GET with default limit, confirm 50 returned + `has_more=true`; iterate with `before_id` to drain.
- User isolation: user B can't see user A's messages under the same book.
- Book isolation: user A's messages for book X don't appear when GETting book Y.
- DELETE: clears only the current (user, book) — leaves other books intact.
- FK cascade: delete user → their messages gone. Delete book → all users' messages for that book gone.
- Rate limit: 61st POST in 60s returns 429.
- Size cap: 8.1 KB body returns 413.

**Frontend** (Jest + RTL for InsightChat):
- On mount, fetches messages and renders them.
- On send, POSTs user message, POSTs assistant reply after AI response.
- Clear button calls DELETE.
- Anon user keeps localStorage path (unchanged existing behaviour).
- localStorage fallback migration: seeded localStorage + empty server → messages are POST'd to server.

**E2E** (smoke tag): open reader, send a message, reload the page, confirm the message is still there.

## Open questions

1. **Soft cap on thread length?** None proposed; storage cost is minimal. Revisit if median thread grows beyond 200 messages.
2. **Anonymous → logged-in merge?** Proposal: don't fold. If the user wants their pre-login chat they can stay anonymous. Simpler, no "surprising" merge behaviour.
3. **Attachments (images, chapter excerpts)?** Out of scope; current chat is text-only. If added, `content` stays TEXT and a sibling `chat_attachments` table joins by message id.
4. **Is the `role` CHECK constraint ever extended?** Not in v1. If a "system" or "tool" role is needed later, a migration relaxes the CHECK.

## Rollout

1. **This PR**: design doc only.
2. **Implementation PR 1**: migration + backend router + tests (closes #907).
3. **Implementation PR 2**: frontend wiring + migration fallback + tests.
4. **Follow-up PR** (~1 week after #1 and #2 merge): remove the localStorage read-only fallback code.

Each implementation PR stays under 500 LOC diff.

## References

- Parent issue: #907
- Existing saved-insights storage: `backend/services/db.py:1071-1125` (`save_insight`, `get_insights`, `get_all_insights`)
- Existing frontend localStorage logic: `frontend/src/components/InsightChat.tsx:22, 128, 160, 184`
- FK CASCADE precedent: `docs/design/declared-fks-schema.md` (#754)
- Chat-message schema precedent: none in-repo; the split-message schema mirrors OpenAI / Anthropic chat API conventions.
