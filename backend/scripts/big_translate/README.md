# Multi-book translation loop

Translate a list of public-domain books (Gutenberg Top-100 by default)
in-session via Claude Code, commit the results to the repo, and seed
them into the production DB. Resumable across sessions: state lives
in `state.json` in this directory, so closing and re-opening the
session picks up where it left off.

## Files

| File | Role |
|---|---|
| `state.json` | Per-book status: `pending` / `in_progress` / `done`, source + target language. Committed to the repo so the state survives across sessions. |
| `fetch_popular.py` | Scrapes <https://www.gutenberg.org/browse/scores/top#books-last30> for the top-N IDs. One-off bootstrap. |
| `init_state.py` | Creates / refreshes `state.json` from the current top-100, preserving any in-progress / done rows. |
| `driver.py` | Invoked once per `/loop` tick. Emits one JSON object telling the loop what to do: `translate`, `finalize`, `import_book`, or `all_done`. |
| `import_book.py` | Fetches a Gutenberg book's metadata + text and saves it to the local DB. |
| `save_batch.py` | Writes translated chapter rows to the local DB, verifying paragraph-count alignment against the source splitter. |
| `finalize.py` | Called when all chapters of one book are translated: exports to `data/translations/book_<id>_<lang>.json`, `git commit && git push`, and optionally POSTs to `/admin/translations/import` on prod. |

## Targets

- Default target language: Chinese (`zh`).
- Chinese source books (language starts with `zh`) translate to English (`en`).
- This rule is in `driver.py::pick_target_lang` — edit that if you want different defaults (e.g. `fr` or `de`).

## Starting from scratch (new session)

```bash
cd /Users/alfmunny/Projects/AI/book-reader-ai/backend

# 1. Bootstrap state.json from the current Gutenberg top-100.
#    If state.json already exists, already-started books keep their status.
PYTHONPATH=. ./venv/bin/python scripts/big_translate/init_state.py --limit 100

# 2. Prod seeding is optional. Set these env vars if you want finalize.py
#    to push translations to the deployed backend as soon as each book is
#    done. Skip if you only care about local translation.
export BACKEND_URL=https://book-reader-ai.up.railway.app/api
export ADMIN_JWT=eyJ...  # copy from a Network request to any /admin/* endpoint in your browser
```

Then inside Claude Code, type this slash command exactly (verbatim) —
it runs the driver once and then schedules itself for the next tick
until every book in `state.json` is `done`:

```
/loop Multi-book translator — each tick:

1. From /Users/alfmunny/Projects/AI/book-reader-ai/backend run:
     PYTHONPATH=. ./venv/bin/python scripts/big_translate/driver.py --count 2
   That prints ONE JSON object (`{"action": ...}`). Act on it:

   - action="translate": for each chapter in the `chapters` array,
     translate the paragraphs into `target_lang`, preserving the paragraph
     count EXACTLY. Write the array to /tmp/bt_batch.json as
     `[{"book_id","chapter_index","target_language","paragraphs"}, ...]`.
     Then run:
       PYTHONPATH=. ./venv/bin/python scripts/big_translate/save_batch.py /tmp/bt_batch.json
     Schedule next tick in 90s.

   - action="finalize": run
       PYTHONPATH=. ./venv/bin/python scripts/big_translate/finalize.py \
           --book-id <id> --lang <target_lang>
     (commits + pushes + seeds prod if BACKEND_URL/ADMIN_JWT are set).
     Schedule next tick in 90s.

   - action="import_book": run
       PYTHONPATH=. ./venv/bin/python scripts/big_translate/import_book.py \
           --book-id <id>
     Schedule next tick in 60s.

   - action="all_done": stop the loop (no ScheduleWakeup call) and tell
     the user we're finished.

2. On rate limits or context errors, schedule next tick with 1200s delay
   instead of the usual 90–120s so limits refresh.

3. Never do any other work in these ticks. No unrelated commits, no PR
   reviews — only translate + save + finalize as directed by driver.py.
```

Resume after a closed session / crash: exactly the same `/loop` command.
`driver.py` reads `state.json` from the repo, so whichever books were
`done` or `in_progress` last time continue from their last chapter.

## Re-targeting to French / German / etc.

Edit `driver.py::pick_target_lang` (or add a `--target-lang` CLI flag
if you want it dynamic). Then blow away the `target_lang` field in
`state.json` — `driver.py` will re-infer on the next tick.

A cleaner path for a completely different target pool:

```bash
# Fresh state for, say, German translations of the next top-100:
rm backend/scripts/big_translate/state.json
# Edit pick_target_lang to return "de"
./venv/bin/python scripts/big_translate/init_state.py --limit 100
# Restart the /loop.
```

## Rate-limit behaviour

Each `/loop` tick is one Claude API call on the Max plan. The loop skill
carries its own fallback heartbeat (`ScheduleWakeup`). If a tick hits a
hard rate limit or a context cap, the tick's prompt tells the loop to
pick a longer delay (≥ 1200 s) before waking, which gives the limit
time to refresh. No manual intervention needed — it will resume.

## What lives where after a book finishes

- `data/translations/book_<id>_<lang>.json` — the exported translations,
  committed to the repo on whichever branch the loop is running on
  (usually `feat/multi-book-translator`).
- `backend/scripts/big_translate/state.json` — updated to mark the book
  `done`.
- Production DB (if `BACKEND_URL`/`ADMIN_JWT` set) — cache populated via
  `/admin/translations/import`.
