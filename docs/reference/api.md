# API overview

High-level map of the FastAPI routers and what each owns. This is a curated reference; if you want to poke at endpoints interactively, run the backend locally and visit `http://localhost:8000/docs` (Swagger UI) or `/redoc`.

A fully auto-extracted API reference is **out of scope for v1** of the docs site — tracked under the Docs site design doc's "Non-goals".

## Routers

| Router | File | Owns |
|---|---|---|
| `admin` | `backend/routers/admin.py` | Admin-only endpoints: user management, book import, translation queue settings, audio cache management. |
| `ai` | `backend/routers/ai.py` | Per-chapter AI translation (`POST /ai/translate/cache`), chapter summaries (`POST /ai/summary`), Q&A insights (`POST /ai/qa`). |
| `annotations` | `backend/routers/annotations.py` | CRUD for user highlights + notes on sentences. Full-text searchable via FTS5. |
| `audio` | `backend/routers/audio.py` | TTS generation + per-chunk audio caching. |
| `auth` | `backend/routers/auth.py` | Google / GitHub / Apple OAuth; admin-approval gate; JWT issuance. |
| `books` | `backend/routers/books.py` | Book metadata + chapter rendering. Respects the EPUB-first chapter source (`services/book_chapters.py`). |
| `decks` | `backend/routers/decks.py` | User-owned study decks (manual + smart modes). See [Vocab tags & decks design](../design/vocab-tags-decks.md). |
| `insights` | `backend/routers/insights.py` | Saved Q&A and per-chapter summary retrieval. |
| `notes` | `backend/routers/notes.py` | Multi-book notes aggregation view. |
| `search` | `backend/routers/search.py` | FTS5 full-text search across annotations, vocabulary, uploaded chapters. |
| `uploads` | `backend/routers/uploads.py` | User EPUB / TXT uploads and the confirm-draft chapter flow. |
| `vocabulary` | `backend/routers/vocabulary.py` | Word saves, lemmatisation, flashcard reviews, tags, Obsidian export. |

## Authentication

All endpoints except `/auth/*` and the health check require a bearer JWT issued by `services/auth.create_jwt`. The JWT is keyed by `user_id` + `email`. FastAPI's `Depends(get_current_user)` resolves the JWT and loads the user row.

Admin-only endpoints additionally gate on `user.role == 'admin'` + `user.approved == 1` via `Depends(_require_admin)`.

## Rate limiting

`services/rate_limiter.py` enforces per-model RPD + RPM against the `rate_limiter_usage` table (keyed by `(provider, model, date)` after migration 010). The translation queue and on-demand translation paths both consult it.

## See also

- Auto-generated **[Scripts reference](scripts.md)** for the `backend/scripts/*.py` CLIs.
- **[Architecture → Stack](../architecture/stack.md)** for a higher-level map of how the pieces fit together.
