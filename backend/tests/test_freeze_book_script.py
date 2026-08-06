"""Tests for scripts/freeze_book.py — slice 1 of the fossilized-content
architecture (#2624 / docs/design/local-first-content.md).

Covers: artifact round-trip + sha integrity, paragraph reconstruction for
prose and verse, the mechanical audit gate, legacy translation merge
(both conventions, A wins on conflict), and the one-way-door refusal.
"""

import json

import pytest
from unittest.mock import AsyncMock

import scripts.freeze_book as freeze_module
from scripts.freeze_book import (
    build_translations,
    content_sha256,
    freeze,
    mechanical_audit,
    paragraphs_of,
)
from services.db import save_book
from services.splitter import Chapter

_META = {
    "title": "Faust",
    "authors": ["Goethe"],
    "languages": ["de"],
    "subjects": ["Drama"],
    "download_count": 42,
    "cover": "https://example.com/cover.jpg",
}

_PROSE = "First paragraph of the scene. " * 8
_VERSE = "FAUST.\nHabe nun, ach! Philosophie,\nJuristerei und Medizin"


def _chapters():
    return [
        Chapter(title="Zueignung", text=f"{_PROSE}\n\n{_VERSE}\n\n{_PROSE}"),
        Chapter(title="Nacht", text=f"{_PROSE}\n\n{_PROSE}"),
    ]


@pytest.fixture
def frozen_env(tmp_db, tmp_path, monkeypatch):
    """Seeded book + patched resolver and directories for freeze()."""
    monkeypatch.setattr(freeze_module, "LEGACY_DIR_A", tmp_path / "legacy_a")
    monkeypatch.setattr(freeze_module, "LEGACY_DIR_B", tmp_path / "legacy_b")
    (tmp_path / "legacy_a").mkdir()
    (tmp_path / "legacy_b").mkdir()
    monkeypatch.setattr(
        "services.book_chapters.get_chapters",
        AsyncMock(return_value=_chapters()),
    )
    monkeypatch.setattr(
        "services.book_chapters.get_chapter_source",
        AsyncMock(return_value="epub"),
    )
    return tmp_path


async def test_freeze_round_trip(frozen_env, tmp_path):
    """freeze() writes a schema-1 artifact whose sha verifies on re-read."""
    await save_book(2229, _META, "irrelevant raw text")
    out = await freeze(2229, "alfmunny", books_dir=tmp_path / "books")

    artifact = json.loads(out.read_text())
    assert artifact["schema_version"] == 1
    assert artifact["book_id"] == 2229
    assert artifact["meta"]["title"] == "Faust"
    assert artifact["split"]["audited_by"] == "alfmunny"
    assert artifact["split"]["chapter_source"] == "epub"
    assert [c["title"] for c in artifact["chapters"]] == ["Zueignung", "Nacht"]
    # Integrity: recomputed hash matches the stored one.
    assert content_sha256(artifact["chapters"]) == artifact["split"]["content_sha256"]


async def test_paragraph_reconstruction_preserves_verse(frozen_env, tmp_path):
    """"\\n\\n".join(paragraphs) reproduces the chapter text; internal \\n
    line breaks (speaker cues, verse lines) survive the round trip."""
    await save_book(2229, _META, "irrelevant")
    out = await freeze(2229, "alfmunny", books_dir=tmp_path / "books")

    chapters = json.loads(out.read_text())["chapters"]
    assert "\n\n".join(chapters[0]["paragraphs"]) == _chapters()[0].text
    assert chapters[0]["paragraphs"][1] == _VERSE  # verse block intact


def test_paragraphs_of_drops_blanks():
    assert paragraphs_of("a\n\n\n\nb\n\n  \n\nc") == ["a", "b", "c"]


def test_mechanical_audit_flags_junk():
    """The big_translate README TODO signatures: too few paragraphs, too
    short, shouty TOC/ISBN fragments."""
    findings = mechanical_audit([
        {"index": 0, "title": "TOC", "paragraphs": ["CONTENTS"]},
        {"index": 1, "title": "Fine", "paragraphs": [_PROSE, _PROSE]},
    ])
    assert len(findings) == 1
    assert "chapter 0" in findings[0]


async def test_audit_findings_block_without_force(frozen_env, tmp_path, monkeypatch):
    await save_book(2229, _META, "irrelevant")
    monkeypatch.setattr(
        "services.book_chapters.get_chapters",
        AsyncMock(return_value=[Chapter(title="ISBN", text="ISBN 978-0")]),
    )
    with pytest.raises(SystemExit, match="audit finding"):
        await freeze(2229, "alfmunny", books_dir=tmp_path / "books")
    assert not (tmp_path / "books").exists()  # nothing written

    # --force proceeds (findings still reported, write happens)
    out = await freeze(2229, "alfmunny", force=True, books_dir=tmp_path / "books")
    assert out.exists()


async def test_already_frozen_refused_without_force(frozen_env, tmp_path):
    """One-way door: an existing book_freeze row blocks re-freezing."""
    import aiosqlite
    import services.db as db_module
    await save_book(2229, _META, "irrelevant")
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "INSERT INTO book_freeze (book_id, splitter, chapter_source, "
            "frozen_at, audited_by, content_sha256) "
            "VALUES (2229, 'html_preference', 'epub', '2026-08-01', 'alfmunny', 'x')"
        )
        await db.commit()
    with pytest.raises(SystemExit, match="already frozen"):
        await freeze(2229, "alfmunny", books_dir=tmp_path / "books")


async def test_translation_merge_prefers_convention_a(frozen_env, tmp_path):
    """Convention A (DB export) wins on conflict; B fills gaps; out-of-range
    indices are dropped."""
    (frozen_env / "legacy_b" / "2229_zh.json").write_text(json.dumps([
        {"book_id": 2229, "chapter_index": 0, "target_language": "zh",
         "paragraphs": ["from-B-0"], "provider": "anthropic"},
        {"book_id": 2229, "chapter_index": 1, "target_language": "zh",
         "paragraphs": ["from-B-1"]},
    ]))
    (frozen_env / "legacy_a" / "book_2229_zh.json").write_text(json.dumps({
        "book_id": 2229, "target_language": "zh",
        "entries": [
            {"book_id": 2229, "chapter_index": 0, "target_language": "zh",
             "paragraphs": ["from-A-0"], "provider": "claude-code",
             "model": "claude-opus-4-7", "title_translation": "献辞"},
            {"book_id": 2229, "chapter_index": 99, "target_language": "zh",
             "paragraphs": ["out-of-range"]},
        ],
    }))

    chapters = [
        {"index": 0, "title": "Zueignung", "paragraphs": ["from-A-0"]},
        {"index": 1, "title": "Nacht", "paragraphs": ["from-B-1"]},
    ]
    translations, warnings = build_translations(2229, 2, chapters)

    entries = translations["zh"]["chapters"]
    assert [e["paragraphs"] for e in entries] == [["from-A-0"], ["from-B-1"]]
    assert entries[0]["title_translation"] == "献辞"
    assert translations["zh"]["provider"] == "claude-code"
    assert any("out of range" in w for w in warnings)


async def test_dry_run_writes_nothing(frozen_env, tmp_path):
    await save_book(2229, _META, "irrelevant")
    out = await freeze(2229, "alfmunny", dry_run=True, books_dir=tmp_path / "books")
    assert out is None
    assert not (tmp_path / "books").exists()


def test_audited_by_is_required():
    with pytest.raises(SystemExit):
        freeze_module.main(["--book-id", "2229"])
