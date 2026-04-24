"""
Tests for scripts/preseed_translations.py

The real translation backend is never invoked — we pass a stub translator
into `run_jobs`, and `plan_jobs` reads from a temporary SQLite database
seeded by the test.
"""

import asyncio
import os
import sys

import pytest

# Make the scripts directory importable
_SCRIPTS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"
)
sys.path.insert(0, _SCRIPTS_DIR)

import preseed_translations as pre  # noqa: E402

import services.db as db_module  # noqa: E402
from services.db import (  # noqa: E402
    init_db,
    save_book,
    save_translation,
    get_cached_translation,
    list_cached_books,
)


# ── Shared fixtures ──────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
async def tmp_db(monkeypatch, tmp_path):
    path = str(tmp_path / "preseed.db")
    monkeypatch.setattr(db_module, "DB_PATH", path)
    await init_db()
    yield


async def _seed_book(book_id: int) -> None:
    """translations.book_id carries a declared FK to books(id) (migration 033,
    #754 PR 3/4). run_jobs tests that drive save_translation directly (without
    going through save_book) must ensure the parent book row exists."""
    import aiosqlite
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "INSERT OR IGNORE INTO books (id, title, images, source) "
            "VALUES (?, 'T', '[]', 'upload')",
            (book_id,),
        )
        await db.commit()


# A minimal book body the splitter will accept. Two CHAPTER headings
# keep the "keyword" strategy happy, and each body is long enough that
# _validate() does not reject the split (MIN_AVG_WORDS = 150).
_LONG_PARA = (" ".join(["word"] * 200)).strip()

SAMPLE_EN_TEXT = (
    "CHAPTER I\n\n" + _LONG_PARA + "\n\n"
    "CHAPTER II\n\n" + _LONG_PARA + "\n"
)


def _meta(title: str, lang: str) -> dict:
    return {
        "title": title,
        "authors": ["Someone"],
        "languages": [lang],
        "subjects": [],
        "download_count": 0,
        "cover": "",
    }


# ── _resolve_source_language ─────────────────────────────────────────────────

def test_resolve_source_language_returns_first_language():
    assert pre._resolve_source_language({"languages": ["en", "de"]}) == "en"


def test_resolve_source_language_returns_none_for_empty():
    assert pre._resolve_source_language({"languages": []}) is None


def test_resolve_source_language_returns_none_when_missing():
    assert pre._resolve_source_language({}) is None


# ── plan_jobs ────────────────────────────────────────────────────────────────

async def test_plan_jobs_emits_job_per_chapter():
    await save_book(1, _meta("Sample", "en"), SAMPLE_EN_TEXT)
    books = await list_cached_books()

    jobs = await pre.plan_jobs(books, "zh")

    # The sample text splits into 2 chapters, both need translation.
    assert len(jobs) == 2
    assert {j.chapter_index for j in jobs} == {0, 1}
    assert all(j.book_id == 1 for j in jobs)
    assert all(j.source_language == "en" for j in jobs)


async def test_plan_jobs_skips_books_already_in_target_language():
    await save_book(1, _meta("Chinese Book", "zh"), SAMPLE_EN_TEXT)
    books = await list_cached_books()

    jobs = await pre.plan_jobs(books, "zh")

    assert jobs == []


async def test_plan_jobs_skips_books_without_language():
    await save_book(1, _meta("No lang", ""), SAMPLE_EN_TEXT)
    # Empty-string language — simulate missing metadata
    books = await list_cached_books()
    books[0]["languages"] = []  # force the None path

    jobs = await pre.plan_jobs(books, "zh")

    assert jobs == []


async def test_plan_jobs_skips_already_cached_chapters():
    await save_book(1, _meta("Sample", "en"), SAMPLE_EN_TEXT)
    # Pretend chapter 0 was already translated — only chapter 1 should remain.
    await save_translation(1, 0, "zh", ["已翻译"])
    books = await list_cached_books()

    jobs = await pre.plan_jobs(books, "zh")

    assert len(jobs) == 1
    assert jobs[0].chapter_index == 1


async def test_plan_jobs_filters_by_book_id():
    await save_book(1, _meta("Book A", "en"), SAMPLE_EN_TEXT)
    await save_book(2, _meta("Book B", "en"), SAMPLE_EN_TEXT)
    books = await list_cached_books()

    jobs = await pre.plan_jobs(books, "zh", book_id_filter=2)

    assert jobs
    assert {j.book_id for j in jobs} == {2}


async def test_plan_jobs_uses_target_language_when_deciding_cached():
    """A German translation cached for chapter 0 must not mask a missing
    Chinese translation — cache lookup is keyed by target language."""
    await save_book(1, _meta("Sample", "en"), SAMPLE_EN_TEXT)
    await save_translation(1, 0, "de", ["Schon übersetzt"])
    books = await list_cached_books()

    jobs = await pre.plan_jobs(books, "zh")

    # The German cache hit must not prevent the Chinese job from being emitted.
    assert any(j.chapter_index == 0 for j in jobs)


# ── run_jobs ─────────────────────────────────────────────────────────────────

def _job(book_id: int, chapter_index: int, text: str = "hello") -> pre.ChapterJob:
    return pre.ChapterJob(
        book_id=book_id,
        book_title="T",
        chapter_index=chapter_index,
        source_language="en",
        text=text,
    )


async def test_run_jobs_saves_translations_for_every_job():
    await _seed_book(1)

    async def translator(text, src, tgt):
        return [f"[{tgt}] {text}"]

    jobs = [_job(1, 0, "a"), _job(1, 1, "b")]
    ok, failed = await pre.run_jobs(jobs, "zh", translator)

    assert (ok, failed) == (2, 0)
    assert await get_cached_translation(1, 0, "zh") == ["[zh] a"]
    assert await get_cached_translation(1, 1, "zh") == ["[zh] b"]


async def test_run_jobs_counts_failures_and_keeps_going():
    await _seed_book(1)

    async def translator(text, src, tgt):
        if text == "break":
            raise RuntimeError("kaboom")
        return ["ok"]

    jobs = [_job(1, 0, "a"), _job(1, 1, "break"), _job(1, 2, "c")]
    ok, failed = await pre.run_jobs(jobs, "zh", translator)

    assert ok == 2
    assert failed == 1
    # The successful jobs are persisted, the failing one is not.
    assert await get_cached_translation(1, 0, "zh") == ["ok"]
    assert await get_cached_translation(1, 1, "zh") is None
    assert await get_cached_translation(1, 2, "zh") == ["ok"]


async def test_run_jobs_invokes_on_result_for_success_and_failure():
    await _seed_book(1)
    events: list[tuple[int, bool]] = []

    async def translator(text, src, tgt):
        if text == "fail":
            raise ValueError("no")
        return ["ok"]

    def cb(job, success, err):
        events.append((job.chapter_index, success))

    jobs = [_job(1, 0, "ok"), _job(1, 1, "fail")]
    await pre.run_jobs(jobs, "zh", translator, on_result=cb)

    assert (0, True) in events
    assert (1, False) in events


async def test_run_jobs_respects_concurrency_limit():
    """With concurrency=2, never more than 2 translations should be in flight."""
    in_flight = 0
    peak = 0
    lock = asyncio.Lock()

    async def translator(text, src, tgt):
        nonlocal in_flight, peak
        async with lock:
            in_flight += 1
            peak = max(peak, in_flight)
        await asyncio.sleep(0.01)
        async with lock:
            in_flight -= 1
        return ["ok"]

    jobs = [_job(1, i) for i in range(6)]
    await pre.run_jobs(jobs, "zh", translator, concurrency=2)

    assert peak <= 2


async def test_run_jobs_rejects_zero_concurrency():
    async def translator(text, src, tgt):
        return []

    with pytest.raises(ValueError):
        await pre.run_jobs([], "zh", translator, concurrency=0)


# ── CLI arg parsing ──────────────────────────────────────────────────────────

def test_parse_args_defaults():
    args = pre._parse_args([])
    assert args.target == "zh"
    assert args.provider == "google"
    assert args.concurrency == 3
    assert args.dry_run is False
    assert args.book_id is None


def test_parse_args_overrides():
    args = pre._parse_args([
        "--target", "de",
        "--provider", "gemini",
        "--gemini-key", "AIza...",
        "--book-id", "42",
        "--concurrency", "5",
        "--dry-run",
    ])
    assert args.target == "de"
    assert args.provider == "gemini"
    assert args.gemini_key == "AIza..."
    assert args.book_id == 42
    assert args.concurrency == 5
    assert args.dry_run is True


def test_parse_args_reads_gemini_key_from_env(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "from-env")
    args = pre._parse_args([])
    assert args.gemini_key == "from-env"


# ── main_async integration ───────────────────────────────────────────────────

async def test_main_async_dry_run_writes_nothing(monkeypatch, capsys):
    await save_book(1, _meta("Sample", "en"), SAMPLE_EN_TEXT)

    args = pre._parse_args(["--dry-run"])
    rc = await pre.main_async(args)

    assert rc == 0
    captured = capsys.readouterr().out
    assert "dry-run" in captured.lower()
    # Nothing persisted — chapter 0 still uncached.
    assert await get_cached_translation(1, 0, "zh") is None


async def test_main_async_errors_when_gemini_provider_missing_key(monkeypatch, capsys):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    args = pre._parse_args(["--provider", "gemini"])
    rc = await pre.main_async(args)
    assert rc == 2
    err = capsys.readouterr().err
    assert "gemini" in err.lower()


async def test_main_async_no_books_exits_cleanly():
    args = pre._parse_args([])
    rc = await pre.main_async(args)
    assert rc == 0


async def test_main_async_translates_via_injected_translator(monkeypatch):
    """End-to-end: seeded book → real plan_jobs + run_jobs → rows in DB."""
    await save_book(1, _meta("Sample", "en"), SAMPLE_EN_TEXT)

    async def fake_translate(text, src, tgt, *, provider, gemini_key):
        return [f"[{tgt}] chapter"]

    monkeypatch.setattr(pre, "translate_text", fake_translate)

    args = pre._parse_args([])
    rc = await pre.main_async(args)

    assert rc == 0
    assert await get_cached_translation(1, 0, "zh") == ["[zh] chapter"]
    assert await get_cached_translation(1, 1, "zh") == ["[zh] chapter"]
