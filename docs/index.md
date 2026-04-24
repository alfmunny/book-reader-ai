# Book Reader AI

A Gutenberg reader with AI-powered translation, text-to-speech, vocabulary tracking, and annotations.

## What is it?

Book Reader AI is a self-hosted reading companion designed for **reading classic literature in languages you're learning**. It takes a Project Gutenberg book and gives you:

- **Chapter-by-chapter AI translation** (Gemini / Claude / GPT) with a per-book queue so you control cost.
- **Text-to-speech** for every chapter and every paragraph. Audio is cached per chunk so replays are free.
- **A vocabulary panel** with lemmatisation, Wiktionary definitions, and a custom SRS flashcard system.
- **Annotations** you can highlight, tag, and export to Obsidian.
- **Full-text search** across your annotations, vocabulary, and uploaded chapters (FTS5).

It ships as a FastAPI backend + Next.js frontend + SQLite store. Deploys to Railway + Vercel for production or runs fully offline via Docker Compose.

## Key features

- **Multi-provider translation** — Claude, Gemini, OpenAI. Configurable fallback chain with daily token/request limits.
- **EPUB ingestion** — Gutenberg books are fetched as EPUB for clean paragraph boundaries; plain-text fallback for books without an EPUB edition.
- **User uploads** — drop your own EPUB / TXT and read it with the same pipeline.
- **Reading queue** — background worker pre-translates chapters while you read.
- **Immersive reading mode** — focus mode, typography panel, paragraph-level TTS seek.
- **Per-user data isolation** — annotations, vocabulary, flashcards, and insights are scoped to the reader's account.

See **[Reference → Features](FEATURES.md)** for the full feature catalogue.

## Quick start (local)

```bash
git clone https://github.com/alfmunny/book-reader-ai.git
cd book-reader-ai
docker compose up
# Visit http://localhost:3000, sign in with Google, approve yourself as admin,
# then import a Gutenberg book by ID from the Admin page.
```

See **[Tutorials → Read your first Gutenberg book](tutorials/first-book.md)** for the hand-held version.

## Where to read next

- **New contributor?** Start with [Development → Roles](development/roles.md) and [Path A vs B](development/paths.md).
- **Designing a feature?** Read the latest [design docs](architecture/design-index.md).
- **Troubleshooting a deployed issue?** Check the [reports](reference/reports.md) for recent audits and post-mortems.
- **Just trying to use it?** The [tutorials](tutorials/index.md) are the friendliest door.

---

Source: [github.com/alfmunny/book-reader-ai](https://github.com/alfmunny/book-reader-ai)
