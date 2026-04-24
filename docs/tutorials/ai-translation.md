# Enable AI translation

Book Reader AI supports three translation providers: **Gemini**, **Claude**, and **OpenAI**. You enable them by setting API keys and optionally a fallback chain.

## 1. Add your API key

Per-user keys live in your profile page:

1. Sign in.
2. Click your avatar → **Profile**.
3. Paste your Gemini / Claude / OpenAI API key in the corresponding field.
4. Keys are stored encrypted with `DATA_KEY` (set in the backend env; see `backend/.env.example`).

The backend uses your personal key for your own reads. The **admin queue** (pre-translations, background work) uses the key configured in **Admin → Queue settings**.

## 2. Pick a model

In **Admin → Queue settings** (admin only) you choose:

- **Primary model** — e.g. `gemini-2.5-pro`, `claude-sonnet-4-6`, `gpt-5o`.
- **Max output tokens** — per-chapter cap.
- **Daily limits** — requests-per-day and requests-per-minute.

## 3. Set up a model chain { #model-chain }

A **model chain** is a comma-separated list of models that the backend tries in order when the primary model is rate-limited or returns an error. Example:

```
gemini-2.5-pro,gemini-2.0-flash,claude-sonnet-4-6
```

When Gemini 2.5 Pro hits its daily limit, the backend falls through to 2.0 Flash. When both Gemini models are out, it falls to Claude.

Each model in the chain has its own per-model RPD counter (migration `010_rate_limiter_per_model.sql`), so the fallback is granular.

## 4. Cost controls

- **Per-model daily budget** — set RPD (requests-per-day) per model in Admin → Queue settings.
- **Per-user rate limit** — the backend tracks each user's daily usage separately so one user can't exhaust the shared key.
- **Chapter caching** — every translation is cached per `(book, chapter, language)`. You only pay once per chapter.
- **Queue pause** — admin can pause the queue anytime from the queue settings panel; in-flight jobs finish, new ones don't start.

## 5. Pre-translation queue

Instead of translating on-demand, let the background worker pre-translate while you read:

1. Import a book.
2. Go to **Admin → Queue**. The book is automatically enqueued for every language configured in `SETTING_AUTO_LANGS`.
3. The worker picks up jobs one at a time, respecting RPM/RPD limits.
4. You read the chapter as usual; it's already translated when you get there.

See **`backend/services/translation_queue.py`** for the worker logic, or **[backend scripts reference](../reference/scripts.md)** for the one-off pre-translation CLI.

## Troubleshooting

- **"401 / invalid API key"** — double-check the key in your profile. Gemini keys start with `AIza...`, Claude with `sk-ant-...`, OpenAI with `sk-...`.
- **"429 / rate limited" with no chain** — set up a [model chain](#model-chain).
- **Translation looks wrong** — the provider/model is stored per-translation in the `translations` table. Delete the cached translation (Admin → Translations → delete row) and try again with a different model.
