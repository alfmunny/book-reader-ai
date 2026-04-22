#!/usr/bin/env python3
"""
Pre-translate books offline and write results to the translations cache.

Primary:  Helsinki-NLP/MarianMT  (free, CPU-friendly, ~300 MB/language pair)
Fallback: Ollama local LLM       (free, needs GPU for speed, any language)

Install extra dependencies first:
    pip install torch --index-url https://download.pytorch.org/whl/cpu
    pip install -r scripts/requirements-pretranslate.txt

Usage:
    # Translate one book into German (MarianMT default)
    python scripts/pretranslate.py --book-id 1342 --lang de

    # Translate all books into French using Ollama
    python scripts/pretranslate.py --all --lang fr --provider ollama --model llama3:8b

    # Preview only — no DB writes
    python scripts/pretranslate.py --book-id 1342 --lang de --dry-run

    # Re-translate even if cache exists
    python scripts/pretranslate.py --book-id 1342 --lang de --force
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

    for book in books:
        title = book.get("title") or f"Book #{book['id']}"
        chapters = _get_chapters(book)

        print(f"\nBook {book['id']}: {title} — {len(chapters)} chapter(s)")

        for idx, ch in enumerate(chapters):
            already = not args.force and await _is_cached(book["id"], idx, args.lang)
            total_chapters += 1

            if already:
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
            await _save(
                book["id"], idx, args.lang, translated,
                provider=t.provider_tag(),
                model=t.model_tag(),
            )
            translated_count += 1
            print(f" done ({elapsed:.1f}s)")

    print(f"\nDone. {translated_count} translated, {skipped_count} skipped, {total_chapters} total.")


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

    args = parser.parse_args()

    if args.db:
        os.environ["DB_PATH"] = args.db

    if args.all:
        args.book_id = None

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
