# Set up the reading queue

The reading queue pre-translates chapters in the background while you read, so every chapter is already translated by the time you get to it. This tutorial shows you how to start the worker and enqueue a book.

## Prerequisites

- You have admin access (the first user on a fresh database is automatically admin).
- At least one translation provider key is configured — see **[Enable AI translation](ai-translation.md)**.
- A book has been imported from Gutenberg or uploaded as an EPUB.

## 1. Start the translation worker

The queue needs a running background worker before any jobs execute.

1. Go to **Admin → Queue** in the nav.
2. In the **Worker status** panel, click **Start worker**.
3. The status indicator turns green. The worker polls every few seconds for new jobs.

The worker runs in the same process as the backend. If the backend restarts, start the worker again from this panel.

## 2. Enqueue a book

1. Still in **Admin → Queue**, find your book in the **Books** list.
2. Pick a target language from the dropdown next to the book title.
3. Click **Queue**. The book's chapters appear in the **Queue** panel as `pending` jobs.

You can queue multiple books and multiple languages at once. Jobs run one at a time; the queue respects the RPM and RPD limits you set in **Queue settings**.

## 3. Watch the queue run

The **Queue** panel refreshes automatically every 10 seconds. Each row shows:

| Column | Meaning |
|---|---|
| Book | Title and chapter number |
| Language | Target translation language |
| Status | `pending` → `running` → `done` (or `failed`) |
| Duration | How long the translation took |

A `failed` job shows an error message. Common causes: rate-limit exceeded, provider key expired, or the chapter has no translatable text.

## 4. Read a pre-translated chapter

Open the reader for any book with completed queue jobs. In the **Translate** panel (top-right), the translation appears instantly — it's served from cache, not the provider.

If a chapter is still `pending` or `running` when you open it, the reader falls back to on-demand translation. The queue job stays on track and updates the cache for next time.

## Tips

- **Auto-enqueue**: set `SETTING_AUTO_LANGS` in your backend `.env` to a comma-separated list of language codes (e.g. `en,zh`). Every newly imported book is automatically enqueued for those languages.
- **Pause without losing jobs**: click **Pause worker** to freeze the queue mid-run. In-flight jobs finish; new ones don't start. Click **Start** to resume.
- **Bulk enqueue**: use the **Enqueue all** button to queue every chapter of every book for the selected language in one click (admin only).
- **Model chain**: if a chapter fails due to rate limits, add a fallback model in **Queue settings → Model chain**. The worker retries with the next model automatically.

## Troubleshooting

- **Worker won't start** — check the backend logs for errors at startup. A missing `DATA_KEY` env var or a locked SQLite file are the most common causes.
- **Jobs stuck at `pending`** — confirm the worker is running (green status dot). If the backend restarted, start the worker again.
- **Jobs fail with 429** — you've hit your provider's rate limit. Reduce the RPM setting in **Queue settings**, add a model chain, or wait for the daily limit to reset.
- **Translation looks wrong** — delete the cached translation in **Admin → Translations** and requeue. You can also switch the primary model in **Queue settings** before requeuing.
