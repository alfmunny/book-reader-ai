# Read your first Gutenberg book

You have a fresh Book Reader AI running locally (Docker Compose, `http://localhost:3000`). This tutorial takes you to a translated chapter of Goethe's *Faust* in about five minutes.

## Prerequisites

- The app running locally.
- A Google account for sign-in.
- A Gemini (or Claude / OpenAI) API key if you want translation. **Skip this if you only want to read in the original** — everything except translation works without any key.

## 1. Sign in and claim admin

1. Open `http://localhost:3000`.
2. Click **Sign in with Google**.
3. The first user on a fresh database is automatically made admin and approved. Subsequent users land in a pending-approval state and need the admin to approve them.

## 2. Import *Faust*

1. Click **Admin** in the nav (visible now that you're admin).
2. Under **Books → Import from Gutenberg**, type **`2229`** (Project Gutenberg's ID for *Faust: Der Tragödie erster Teil*).
3. Click **Import**. The backend fetches the book's metadata + plain text + EPUB in parallel. The import takes a few seconds.

## 3. Start reading

1. Go back to the home page. *Faust* now appears in your library.
2. Click the cover. The reader opens on chapter 1.
3. Use the **←** / **→** keys (or the on-screen chevrons) to move between chapters.

## 4. Translate a chapter

1. In the reader, click the **Translate** button (top-right).
2. Pick your target language (e.g. English). The dropdown shows every language configured in the admin queue settings.
3. The backend sends the chapter to your configured provider (Gemini by default). The translation appears side-by-side with the original within 10–60 seconds depending on chapter length.
4. Translations are cached per `(book, chapter, target_language)` — the second read is instant and free.

If you see an error instead of a translation:

- **"No API key configured"** — see **[Enable AI translation](ai-translation.md)**.
- **"Rate limit exceeded"** — you've hit your provider's per-model quota. Wait a minute or set up a [model fallback chain](ai-translation.md#model-chain).

## What's next

- **Save a word to your vocabulary**: double-click any word while reading. It appears in the vocabulary panel with a Wiktionary definition.
- **Highlight a sentence**: select any text and click **Annotate**. The annotation is searchable.
- **Listen to a chapter**: click the speaker icon. TTS audio caches per chunk, so rewinds are free.

For the full inventory of what the app can do, see the **[Features reference](../FEATURES.md)**.
