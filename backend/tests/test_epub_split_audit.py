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

    async def fake_run_audit(**kwargs):
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

    async def fake_run_audit(**kwargs):
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

    async def fake_run_audit(**kwargs):
        return sample

    monkeypatch.setattr(audit, "run_audit", fake_run_audit)

    out = tmp_path / "report.csv"
    audit.main(["--csv", str(out)])
    content = out.read_text()
    assert "book_id" in content  # header
    assert "Moby Dick" in content
    assert "0.050" in content
    assert "yes" in content


# ── paragraph-count signal (#834) ────────────────────────────────────────────


def test_paragraph_suspicious_when_epub_paras_below_threshold():
    # 1 EPUB paragraph vs 5 text paragraphs = 0.2 ratio → flagged at default 0.8.
    text_chapters = [Chapter(title="Ch", text="p1\n\np2\n\np3\n\np4\n\np5")]
    epub_chapters = [Chapter(title="Ch", text="one huge paragraph")]
    with _stub_splitters(text_chapters=text_chapters, epub_chapters=epub_chapters):
        row = audit.compute_audit_row(
            book_id=1, title="Faust", text="ignored", epub_bytes=b"ignored",
        )
    assert row.epub_paragraphs == 1
    assert row.text_paragraphs == 5
    assert row.para_ratio == pytest.approx(0.2)
    assert row.paragraph_suspicious is True
    assert row.is_flagged is True


def test_paragraph_signal_does_not_fire_when_ratios_align():
    text_chapters = [Chapter(title="Ch", text="p1\n\np2\n\np3\n\np4")]
    epub_chapters = [Chapter(title="Ch", text="p1\n\np2\n\np3\n\np4")]
    with _stub_splitters(text_chapters=text_chapters, epub_chapters=epub_chapters):
        row = audit.compute_audit_row(
            book_id=1, title="Aligned", text="t", epub_bytes=b"e",
        )
    assert row.epub_paragraphs == 4
    assert row.text_paragraphs == 4
    assert row.para_ratio == pytest.approx(1.0)
    assert row.paragraph_suspicious is False


def test_paragraph_threshold_is_configurable():
    # Ratio = 0.75 — flagged at default 0.8, safe at 0.7.
    text_chapters = [Chapter(title="Ch", text="p1\n\np2\n\np3\n\np4")]
    epub_chapters = [Chapter(title="Ch", text="p1\n\np2\n\np3")]
    with _stub_splitters(text_chapters=text_chapters, epub_chapters=epub_chapters):
        lenient = audit.compute_audit_row(
            book_id=1, title="X", text="t", epub_bytes=b"e",
            paragraph_threshold=0.7,
        )
        strict = audit.compute_audit_row(
            book_id=1, title="X", text="t", epub_bytes=b"e",
            paragraph_threshold=0.8,
        )
    assert lenient.paragraph_suspicious is False
    assert strict.paragraph_suspicious is True


# ── structural speaker-cue signal (#834 / #820) ──────────────────────────────


def _faust_like_collapsed_paragraph() -> str:
    """A single long paragraph with an embedded-newline speaker cue — the
    pattern seen in Faust (#820) after the EPUB splitter collapses verse."""
    return (
        "Und weißt du was? ich glaub', er liebt dich eben.\n"
        "Ja, freilich! wir verstehn uns nicht auf gleichen Ton.\n"
        "Und leg' den Schmuck nur wieder weg, mein Sohn.\n"
        "  HELENA.\n"
        "Das Dunkel hebt sich auf, mein Blick gewinnt;\n"
        "Ich seh' die Berge frei, die Fluten blau.\n"
        "Mich stützte eine Hand, die mich erfand\n"
        "Und wieder schuf aus Liebe, Leid und Zeit.\n"
        "Wie weit das reicht, wie tief, wie hoch hinan —\n"
        "wir müssen uns noch weiter trauen; komm!\n"
    )


def test_structural_flag_catches_embedded_speaker_cue_in_long_paragraph():
    long_para = _faust_like_collapsed_paragraph()
    assert len(long_para) >= 400  # sanity: meets default structural-min threshold
    epub_chapters = [Chapter(title="Ch1", text=long_para)]
    # Plain-text baseline is fine — char/para ratios should NOT fire; only
    # the structural signal should.
    text_chapters = [Chapter(title="Ch1", text=long_para)]
    with _stub_splitters(text_chapters=text_chapters, epub_chapters=epub_chapters):
        row = audit.compute_audit_row(
            book_id=999, title="Faust", text="t", epub_bytes=b"e",
        )
    assert row.suspicious is False
    assert row.paragraph_suspicious is False
    assert len(row.structural_flags) == 1
    idx, excerpt = row.structural_flags[0]
    assert idx == 0
    assert excerpt  # non-empty excerpt
    assert row.is_flagged is True  # structural alone flips the overall flag


def test_structural_flag_does_not_fire_on_short_paragraphs():
    epub_chapters = [
        Chapter(title="Ch1", text="Short.\n  HELENA.\nStill short."),
    ]
    text_chapters = [Chapter(title="Ch1", text="baseline")]
    with _stub_splitters(text_chapters=text_chapters, epub_chapters=epub_chapters):
        row = audit.compute_audit_row(
            book_id=1, title="X", text="t", epub_bytes=b"e",
        )
    assert row.structural_flags == []


def test_structural_flag_does_not_fire_without_embedded_speaker_cue():
    # Long paragraph (>400 chars) with no speaker cue — pure prose.
    body = " ".join(["wanderer"] * 80) + "\n" + " ".join(["foo"] * 40)
    assert len(body) >= 400
    epub_chapters = [Chapter(title="Ch1", text=body)]
    text_chapters = [Chapter(title="Ch1", text=body)]
    with _stub_splitters(text_chapters=text_chapters, epub_chapters=epub_chapters):
        row = audit.compute_audit_row(
            book_id=1, title="X", text="t", epub_bytes=b"e",
        )
    assert row.structural_flags == []


def test_structural_min_len_is_configurable():
    # A short paragraph with a speaker cue should flag when the min_len is
    # dropped low enough to include it.
    p = "Line1.\n  HELENA.\nLine3."
    epub_chapters = [Chapter(title="Ch1", text=p)]
    text_chapters = [Chapter(title="Ch1", text=p)]
    with _stub_splitters(text_chapters=text_chapters, epub_chapters=epub_chapters):
        row = audit.compute_audit_row(
            book_id=1, title="X", text="t", epub_bytes=b"e",
            structural_min_len=5,
        )
    assert len(row.structural_flags) == 1


# ── is_flagged property and main() exit-code broadening ──────────────────────


def test_is_flagged_ors_all_three_signals():
    base = dict(
        book_id=1, title="x", epub_chars=0, text_chars=0, ratio=1.0,
    )
    assert audit.AuditRow(**base, suspicious=True).is_flagged is True
    assert (
        audit.AuditRow(**base, suspicious=False, paragraph_suspicious=True).is_flagged
        is True
    )
    assert (
        audit.AuditRow(
            **base,
            suspicious=False,
            paragraph_suspicious=False,
            structural_flags=[(0, "...HELENA...")],
        ).is_flagged
        is True
    )
    assert audit.AuditRow(**base, suspicious=False).is_flagged is False


def test_main_exits_nonzero_on_structural_only_flag(monkeypatch):
    # A row with no char/para flag but a structural flag must still trigger
    # the CI gate — this is exactly the #820 class.
    sample = [
        audit.AuditRow(
            book_id=1, title="Faust", epub_chars=100_000,
            text_chars=100_000, ratio=1.0, suspicious=False,
            epub_paragraphs=50, text_paragraphs=50, para_ratio=1.0,
            paragraph_suspicious=False,
            structural_flags=[(3, "...HELENA...")],
        ),
    ]

    async def fake_run_audit(**kwargs):
        return sample

    monkeypatch.setattr(audit, "run_audit", fake_run_audit)

    assert audit.main([]) == 1


def test_csv_includes_paragraph_and_structural_columns(monkeypatch, tmp_path):
    sample = [
        audit.AuditRow(
            book_id=7, title="Faust", epub_chars=100_000,
            text_chars=100_000, ratio=1.0, suspicious=False,
            epub_paragraphs=20, text_paragraphs=50, para_ratio=0.4,
            paragraph_suspicious=True,
            structural_flags=[(1, "HELENA / paragraph excerpt")],
        ),
    ]

    async def fake_run_audit(**kwargs):
        return sample

    monkeypatch.setattr(audit, "run_audit", fake_run_audit)
    out = tmp_path / "report.csv"
    audit.main(["--csv", str(out)])

    content = out.read_text()
    # New header columns present
    for col in (
        "epub_paragraphs",
        "text_paragraphs",
        "para_ratio",
        "paragraph_suspicious",
        "structural_flag_count",
        "structural_flag_sample",
    ):
        assert col in content
    # Data row carries the paragraph ratio and the structural excerpt
    assert "0.400" in content
    assert "HELENA" in content
