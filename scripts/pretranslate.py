#!/usr/bin/env python3
"""
Pre-translate books offline and write results to the translations cache.

Primary:  Helsinki-NLP/MarianMT  (free, CPU-friendly, ~300 MB/language pair)
Fallback: Ollama local LLM       (free, needs GPU for speed, any language)

Install extra dependencies first:
    pip install torch --index-url https://download.pytorch.org/whl/cpu
    pip install -r scripts/requirements-pretranslate.txt

Usage:
    # Translate one book into German (MarianMT default) → write to local DB
    python scripts/pretranslate.py --book-id 1342 --lang de

    # Translate and upload directly to a remote server
    python scripts/pretranslate.py --book-id 11 --lang de \\
        --server-url https://your-app.railway.app --admin-token <JWT>

    # Export translations to JSON for manual upload later
    python scripts/pretranslate.py --book-id 11 --lang de --export alice_de.json

    # Translate all books into French using Ollama
    python scripts/pretranslate.py --all --lang fr --provider ollama --model llama3:8b

    # Preview only — no DB writes
    python scripts/pretranslate.py --book-id 1342 --lang de --dry-run

    # Re-translate even if cache exists
    python scripts/pretranslate.py --book-id 1342 --lang de --force

Recommended book candidates for pre-translation seeding:
    11    Alice's Adventures in Wonderland (12 chapters, ~26 k words) — short demo
    1342  Pride and Prejudice (61 chapters, ~122 k words) — classic English novel
    2600  War and Peace (365 chapters, ~580 k words) — comprehensive but slow
"""

import argparse
import asyncio
import json
import os
import re
import sys
import time

# ── Bootstrap: add backend to sys.path so we can import services ─────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(SCRIPT_DIR, "..", "backend")
sys.path.insert(0, BACKEND_DIR)

# ── Language pairs supported by MarianMT with good quality ───────────────────
# Model name pattern: Helsinki-NLP/opus-mt-{src}-{tgt}
# Priority order: zh > de > fr > it (future) > es (future)
MARIAN_PAIRS: dict[str, str] = {
    "zh": "Helsinki-NLP/opus-mt-en-zh",   # priority 1
    "de": "Helsinki-NLP/opus-mt-en-de",   # priority 2
    "fr": "Helsinki-NLP/opus-mt-en-fr",   # priority 3
    "it": "Helsinki-NLP/opus-mt-en-it",   # priority 4 (optional, future)
    "es": "Helsinki-NLP/opus-mt-en-es",   # priority 5 (optional, future)
    "ru": "Helsinki-NLP/opus-mt-en-ru",
    "nl": "Helsinki-NLP/opus-mt-en-nl",
    "pt": "Helsinki-NLP/opus-mt-en-pt",
    "pl": "Helsinki-NLP/opus-mt-en-pl",
    "ja": "Helsinki-NLP/opus-mt-en-jap",
}

MARIAN_MAX_TOKENS = 480  # Leave headroom below the 512-token limit
SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+(?=[A-ZÀ-ɏ一-鿿])")

# Batch size for server uploads: POST this many chapters at once to avoid
# hitting request-body size limits on PaaS platforms.
UPLOAD_BATCH_SIZE = 20


# ── Text chunking ─────────────────────────────────────────────────────────────

def _split_sentences(text: str) -> list[str]:
    parts = SENTENCE_SPLIT_RE.split(text.strip())
    return [p.strip() for p in parts if p.strip()]


def _chunk_for_marian(tokenizer, text: str) -> list[str]:
    """Split text into chunks that fit within MARIAN_MAX_TOKENS tokens."""
    sentences = _split_sentences(text)
    if not sentences:
        return [text] if text.strip() else []

    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    for sent in sentences:
        sent_len = len(tokenizer.encode(sent))
        if current and current_len + sent_len > MARIAN_MAX_TOKENS:
            chunks.append(" ".join(current))
            current = [sent]
            current_len = sent_len
        else:
            current.append(sent)
            current_len += sent_len

    if current:
        chunks.append(" ".join(current))

    return chunks if chunks else [text]


# ── MarianMT provider ─────────────────────────────────────────────────────────

class MarianTranslator:
    def __init__(self, lang: str):
        model_name = MARIAN_PAIRS.get(lang)
        if not model_name:
            raise ValueError(
                f"MarianMT does not have a quality model for '{lang}'. "
                f"Supported: {', '.join(sorted(MARIAN_PAIRS))}. "
                f"Use --provider ollama for other languages."
            )
        try:
            from transformers import MarianMTModel, MarianTokenizer
        except ImportError:
            _missing_deps("transformers sentencepiece")

        print(f"  Loading MarianMT model: {model_name}")
        self.tokenizer = MarianTokenizer.from_pretrained(model_name)
        self.model = MarianMTModel.from_pretrained(model_name)
        self.model_name = model_name

    def translate_paragraph(self, text: str) -> str:
        if not text.strip():
            return text
        chunks = _chunk_for_marian(self.tokenizer, text)
        translated_chunks: list[str] = []
        for chunk in chunks:
            inputs = self.tokenizer([chunk], return_tensors="pt", padding=True, truncation=True)
            outputs = self.model.generate(**inputs)
            translated = self.tokenizer.decode(outputs[0], skip_special_tokens=True)
            translated_chunks.append(translated)
        return " ".join(translated_chunks)

    def provider_tag(self) -> str:
        return "marian"

    def model_tag(self) -> str:
        return self.model_name


# ── Ollama provider ───────────────────────────────────────────────────────────

class OllamaTranslator:
    def __init__(self, model: str, lang: str, base_url: str = "http://localhost:11434"):
        self.model = model
        self.lang = lang
        self.base_url = base_url.rstrip("/")
        self._check_connection()

    def _check_connection(self) -> None:
        try:
            import requests
            resp = requests.get(f"{self.base_url}/api/tags", timeout=5)
            resp.raise_for_status()
        except Exception as exc:
            raise RuntimeError(
                f"Cannot connect to Ollama at {self.base_url}. "
                f"Start Ollama with: ollama serve\n  Error: {exc}"
            )

    def translate_paragraph(self, text: str) -> str:
        if not text.strip():
            return text
        try:
            import requests
        except ImportError:
            _missing_deps("requests")

        lang_names = {
            "de": "German", "fr": "French", "es": "Spanish", "it": "Italian",
            "ru": "Russian", "nl": "Dutch", "pt": "Portuguese", "pl": "Polish",
            "zh": "Chinese", "ja": "Japanese", "ko": "Korean", "ar": "Arabic",
        }
        target = lang_names.get(self.lang, self.lang)
        prompt = (
            f"Translate the following text to {target}. "
            f"Return ONLY the translated text, no commentary, no explanation.\n\n"
            f"{text}"
        )
        resp = requests.post(
            f"{self.base_url}/api/generate",
            json={"model": self.model, "prompt": prompt, "stream": False},
            timeout=120,
        )
        resp.raise_for_status()
        return resp.json().get("response", "").strip()

    def provider_tag(self) -> str:
        return "ollama"

    def model_tag(self) -> str:
        return self.model


# ── DB helpers ────────────────────────────────────────────────────────────────

async def _get_books(book_ids: list[int] | None) -> list[dict]:
    """Return list of {id, title, text} dicts."""
    import aiosqlite
    from services.db import DB_PATH
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if book_ids:
            placeholders = ",".join("?" * len(book_ids))
            async with db.execute(
                f"SELECT id, title, text FROM books WHERE id IN ({placeholders})",
                book_ids,
            ) as cur:
                return [dict(r) for r in await cur.fetchall()]
        else:
            async with db.execute(
                "SELECT id, title, text FROM books"
            ) as cur:
                return [dict(r) for r in await cur.fetchall()]


async def _is_cached(book_id: int, chapter_index: int, lang: str) -> bool:
    import aiosqlite
    from services.db import DB_PATH
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT 1 FROM translations WHERE book_id=? AND chapter_index=? AND target_language=?",
            (book_id, chapter_index, lang),
        ) as cur:
            return await cur.fetchone() is not None


async def _save(book_id: int, chapter_index: int, lang: str,
                paragraphs: list[str], provider: str, model: str) -> None:
    from services.db import save_translation
    await save_translation(
        book_id, chapter_index, lang, paragraphs,
        provider=provider, model=model,
    )


# ── Server upload ─────────────────────────────────────────────────────────────

def _upload_batch(entries: list[dict], server_url: str, admin_token: str) -> int:
    """POST a batch of translation entries to the server import endpoint.

    Returns the number of entries successfully imported.
    Raises RuntimeError on HTTP failure.
    """
    try:
        import requests as _req
    except ImportError:
        _missing_deps("requests")

    url = server_url.rstrip("/") + "/api/admin/translations/import"
    headers = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
    body = {"entries": entries}

    resp = _req.post(url, json=body, headers=headers, timeout=60)
    if resp.status_code == 404:
        raise RuntimeError(
            f"Server returned 404 for {url}. Check --server-url and ensure the book "
            f"(id={entries[0]['book_id']}) exists on the server."
        )
    if resp.status_code == 401:
        raise RuntimeError("Server returned 401 Unauthorized. Check --admin-token.")
    if not resp.ok:
        raise RuntimeError(f"Server upload failed: {resp.status_code} {resp.text[:200]}")

    return resp.json().get("imported", len(entries))


# ── Chapter extraction ────────────────────────────────────────────────────────

def _get_chapters(book: dict) -> list[dict]:
    """Return [{title, text}, ...] for a book row."""
    text = book.get("text") or ""

    # Uploaded book with confirmed chapters stored as JSON
    if text.startswith("{"):
        try:
            data = json.loads(text)
            if not data.get("draft", True):
                return data.get("chapters", [])
        except json.JSONDecodeError:
            pass

    # Gutenberg book — use splitter
    from services.splitter import build_chapters
    chapters = build_chapters(text)
    return [{"title": ch.title, "text": ch.text} for ch in chapters]


# ── Main translation loop ─────────────────────────────────────────────────────

async def run(args: argparse.Namespace) -> None:
    book_ids = [args.book_id] if args.book_id else None
    books = await _get_books(book_ids)

    if not books:
        print("No books found.")
        return

    server_url: str | None = getattr(args, "server_url", None)
    admin_token: str | None = getattr(args, "admin_token", None)
    export_path: str | None = getattr(args, "export", None)

    # Buffer for --export and batched server uploads
    all_entries: list[dict] = []

    # Translator is loaded lazily on first real translation (skipped for --dry-run)
    translator = None

    def _get_translator():
        nonlocal translator
        if translator is None:
            if args.provider == "marian":
                translator = MarianTranslator(args.lang)
            else:
                translator = OllamaTranslator(args.model, args.lang,
                                              base_url=args.ollama_url)
        return translator

    total_chapters = 0
    translated_count = 0
    skipped_count = 0
    upload_count = 0

    for book in books:
        title = book.get("title") or f"Book #{book['id']}"
        chapters = _get_chapters(book)

        print(f"\nBook {book['id']}: {title} — {len(chapters)} chapter(s)")

        book_entries: list[dict] = []

        for idx, ch in enumerate(chapters):
            already = not args.force and await _is_cached(book["id"], idx, args.lang)
            total_chapters += 1

            if already and not server_url and not export_path:
                skipped_count += 1
                print(f"  [{idx + 1}/{len(chapters)}] {ch['title'][:50]} — already cached, skipping")
                continue

            paragraphs = [p.strip() for p in ch["text"].split("\n\n") if p.strip()]
            if not paragraphs:
                print(f"  [{idx + 1}/{len(chapters)}] {ch['title'][:50]} — empty, skipping")
                skipped_count += 1
                continue

            word_count = len(ch["text"].split())
            print(f"  [{idx + 1}/{len(chapters)}] {ch['title'][:50]} ({word_count} words) ...", end="", flush=True)

            if args.dry_run:
                print(" [dry-run, skipped]")
                skipped_count += 1
                continue

            t = _get_translator()
            t0 = time.time()
            translated: list[str] = []
            for para in paragraphs:
                translated.append(t.translate_paragraph(para))

            elapsed = time.time() - t0

            entry = {
                "book_id": book["id"],
                "chapter_index": idx,
                "target_language": args.lang,
                "paragraphs": translated,
                "provider": t.provider_tag(),
                "model": t.model_tag(),
                "title_translation": None,
            }

            if server_url:
                # Accumulate and upload in batches
                book_entries.append(entry)
                if len(book_entries) >= UPLOAD_BATCH_SIZE:
                    n = _upload_batch(book_entries, server_url, admin_token or "")
                    upload_count += n
                    book_entries = []
                    print(f" uploaded ({elapsed:.1f}s)")
                else:
                    print(f" translated ({elapsed:.1f}s), buffering...")
            elif export_path:
                all_entries.append(entry)
                print(f" done ({elapsed:.1f}s)")
            else:
                await _save(book["id"], idx, args.lang, translated,
                            provider=t.provider_tag(), model=t.model_tag())
                print(f" done ({elapsed:.1f}s)")

            translated_count += 1

        # Flush remaining book entries to server
        if server_url and book_entries:
            n = _upload_batch(book_entries, server_url, admin_token or "")
            upload_count += n
            print(f"  → Uploaded {n} chapter(s) for book {book['id']}")

    # Write export file
    if export_path and all_entries:
        with open(export_path, "w", encoding="utf-8") as f:
            json.dump({"entries": all_entries}, f, ensure_ascii=False, indent=2)
        print(f"\nExported {len(all_entries)} chapter(s) to {export_path}")
        print(f"Upload with:\n  curl -X POST {'{SERVER_URL}'}/api/admin/translations/import \\")
        print(f"    -H 'Authorization: Bearer {'{ADMIN_JWT}'}' \\")
        print(f"    -H 'Content-Type: application/json' \\")
        print(f"    -d @{export_path}")

    summary = f"\nDone. {translated_count} translated"
    if upload_count:
        summary += f", {upload_count} uploaded to server"
    summary += f", {skipped_count} skipped, {total_chapters} total."
    print(summary)


# ── Error helpers ─────────────────────────────────────────────────────────────

def _missing_deps(packages: str) -> None:
    print(
        f"\nMissing dependencies: {packages}\n"
        f"Install with:\n"
        f"  pip install torch --index-url https://download.pytorch.org/whl/cpu\n"
        f"  pip install -r scripts/requirements-pretranslate.txt\n",
        file=sys.stderr,
    )
    sys.exit(1)


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Pre-translate books offline and write results to the cache.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--book-id", type=int, metavar="N", help="Translate a single book by ID")
    group.add_argument("--all", action="store_true", help="Translate all books in the DB")

    parser.add_argument("--lang", required=True, metavar="LANG",
                        help="Target language code (e.g. de, fr, es, zh)")
    parser.add_argument("--provider", choices=["marian", "ollama"], default="marian",
                        help="Translation provider (default: marian)")
    parser.add_argument("--model", default="llama3:8b",
                        help="Ollama model name (default: llama3:8b, ignored for marian)")
    parser.add_argument("--ollama-url", default="http://localhost:11434",
                        help="Ollama base URL (default: http://localhost:11434)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview what would be translated without writing to DB")
    parser.add_argument("--force", action="store_true",
                        help="Re-translate even if a cached translation exists")
    parser.add_argument("--db", metavar="PATH",
                        help="Override DB_PATH (defaults to backend/books.db or DB_PATH env)")

    # Server upload options
    parser.add_argument(
        "--server-url", metavar="URL",
        help=(
            "Upload translations to a remote server instead of local DB. "
            "e.g. https://your-app.railway.app"
        ),
    )
    parser.add_argument(
        "--admin-token", metavar="JWT",
        help="Admin JWT for --server-url authentication (or set ADMIN_TOKEN env var)",
    )
    parser.add_argument(
        "--export", metavar="FILE",
        help=(
            "Export translated chapters as JSON compatible with "
            "POST /api/admin/translations/import for manual upload."
        ),
    )

    args = parser.parse_args()

    if args.db:
        os.environ["DB_PATH"] = args.db

    if args.all:
        args.book_id = None

    # Resolve admin token from env if not passed on CLI
    if args.server_url and not args.admin_token:
        args.admin_token = os.environ.get("ADMIN_TOKEN", "")
        if not args.admin_token:
            print(
                "Error: --server-url requires --admin-token or ADMIN_TOKEN env var.",
                file=sys.stderr,
            )
            sys.exit(1)

    if args.provider == "marian" and args.lang not in MARIAN_PAIRS:
        print(
            f"Warning: no MarianMT model for '{args.lang}'. "
            f"Supported: {', '.join(sorted(MARIAN_PAIRS))}.\n"
            f"Use --provider ollama for other languages.",
            file=sys.stderr,
        )
        sys.exit(1)

    asyncio.run(run(args))


if __name__ == "__main__":
    main()
