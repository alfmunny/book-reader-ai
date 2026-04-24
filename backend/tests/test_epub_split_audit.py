"""Tests for scripts/epub_split_audit.py (issue #769).

The audit logic itself must be regression-protected — if the ratio
computation or the suspicious-flag threshold drift, we lose the signal that
motivated the script in the first place.
"""

from __future__ import annotations

import os
import sys
from unittest.mock import patch

import pytest

_SCRIPTS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"
)
sys.path.insert(0, _SCRIPTS_DIR)

import epub_split_audit as audit  # noqa: E402
from services.splitter import Chapter  # noqa: E402


# ── compute_audit_row (pure) ─────────────────────────────────────────────────


def _stub_splitters(text_chapters, epub_chapters):
    """Patch both splitter entry points so compute_audit_row is deterministic."""
    return patch.multiple(
        audit,
        build_chapters=lambda text: text_chapters,
        build_chapters_from_epub=lambda eb: epub_chapters,
    )


def test_compute_audit_row_flags_epub_shortfall_below_threshold():
    with _stub_splitters(
        text_chapters=[Chapter(title="Ch1", text="x" * 10_000)],
        epub_chapters=[Chapter(title="Ch1", text="x" * 2_000)],
    ):
        row = audit.compute_audit_row(
            book_id=42, title="Faust", text="ignored", epub_bytes=b"ignored",
            threshold=0.5,
        )
    assert row.book_id == 42
    assert row.title == "Faust"
    assert row.epub_chars == 2_000
    assert row.text_chars == 10_000
    assert row.ratio == pytest.approx(0.2)
    assert row.suspicious is True


def test_compute_audit_row_is_not_suspicious_when_epub_matches_text():
    with _stub_splitters(
        text_chapters=[Chapter(title="Ch1", text="x" * 9_800)],
        epub_chapters=[Chapter(title="Ch1", text="x" * 9_850)],
    ):
        row = audit.compute_audit_row(
            book_id=1, title="Moby Dick", text="t", epub_bytes=b"e",
        )
    assert row.suspicious is False
    assert row.ratio > 0.99


def test_compute_audit_row_skips_gracefully_when_text_is_empty():
    # Book with a stored EPUB but no cached plain text — can't compare.
    # Script must not crash and must not flag it.
    with _stub_splitters(
        text_chapters=[],
        epub_chapters=[Chapter(title="Ch1", text="x" * 5000)],
    ):
        row = audit.compute_audit_row(
            book_id=7, title="X", text="", epub_bytes=b"epubbytes",
        )
    assert row.text_chars == 0
    assert row.suspicious is False


def test_compute_audit_row_honours_custom_threshold():
    with _stub_splitters(
        text_chapters=[Chapter(title="Ch1", text="x" * 1000)],
        epub_chapters=[Chapter(title="Ch1", text="x" * 700)],
    ):
        lenient = audit.compute_audit_row(
            book_id=1, title="X", text="t", epub_bytes=b"e", threshold=0.5,
        )
        strict = audit.compute_audit_row(
            book_id=1, title="X", text="t", epub_bytes=b"e", threshold=0.9,
        )
    assert lenient.suspicious is False  # 0.7 > 0.5
    assert strict.suspicious is True  # 0.7 < 0.9


# ── run_audit (integration with the DB fixture) ──────────────────────────────


@pytest.fixture
async def tmp_db(monkeypatch, tmp_path):
    import services.db as db_module
    from services.db import init_db

    path = str(tmp_path / "audit.db")
    monkeypatch.setattr(db_module, "DB_PATH", path)
    await init_db()
    yield path


@pytest.mark.asyncio
async def test_run_audit_iterates_books_with_stored_epubs(tmp_db, monkeypatch):
    from services.db import save_book, save_book_epub

    await save_book(101, {"title": "Has EPUB", "authors": [], "languages": [], "subjects": []}, text="x" * 10_000)
    await save_book_epub(101, b"epubA", "http://example/a")

    await save_book(102, {"title": "No EPUB", "authors": [], "languages": [], "subjects": []}, text="x" * 10_000)
    # no save_book_epub for 102 — must be skipped

    call_count = {"n": 0}

    def fake_build_text(text):
        return [Chapter(title="Ch", text=text[: 8_000])]

    def fake_build_epub(epub_bytes):
        call_count["n"] += 1
        # Simulate the regression: EPUB splitter drops 90% of content.
        return [Chapter(title="Ch", text="x" * 500)]

    monkeypatch.setattr(audit, "build_chapters", fake_build_text)
    monkeypatch.setattr(audit, "build_chapters_from_epub", fake_build_epub)

    rows = await audit.run_audit()

    assert call_count["n"] == 1  # only the book with an EPUB was audited
    assert len(rows) == 1
    row = rows[0]
    assert row.book_id == 101
    assert row.title == "Has EPUB"
    assert row.suspicious is True


# ── main() CLI gate behavior ─────────────────────────────────────────────────


def test_main_returns_nonzero_when_suspicious_rows_exist(monkeypatch):
    sample = [
        audit.AuditRow(
            book_id=1, title="t", epub_chars=100, text_chars=1000,
            ratio=0.1, suspicious=True,
        ),
    ]

    async def fake_run_audit(threshold, book_id=None):
        return sample

    monkeypatch.setattr(audit, "run_audit", fake_run_audit)

    rc = audit.main([])
    assert rc == 1


def test_main_returns_zero_when_all_rows_pass(monkeypatch):
    sample = [
        audit.AuditRow(
            book_id=1, title="t", epub_chars=900, text_chars=1000,
            ratio=0.9, suspicious=False,
        ),
    ]

    async def fake_run_audit(threshold, book_id=None):
        return sample

    monkeypatch.setattr(audit, "run_audit", fake_run_audit)

    rc = audit.main([])
    assert rc == 0


def test_main_writes_csv_when_flag_given(monkeypatch, tmp_path):
    sample = [
        audit.AuditRow(
            book_id=7, title="Moby Dick", epub_chars=500,
            text_chars=10_000, ratio=0.05, suspicious=True,
        ),
    ]

    async def fake_run_audit(threshold, book_id=None):
        return sample

    monkeypatch.setattr(audit, "run_audit", fake_run_audit)

    out = tmp_path / "report.csv"
    audit.main(["--csv", str(out)])
    content = out.read_text()
    assert "book_id" in content  # header
    assert "Moby Dick" in content
    assert "0.050" in content
    assert "yes" in content
