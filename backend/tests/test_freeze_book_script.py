"""Tests for scripts/freeze_book.py — slice 1 of the fossilized-content
architecture (#2624 / docs/design/local-first-content.md).

Covers: artifact round-trip + sha integrity, paragraph reconstruction for
prose and verse, the mechanical audit gate, legacy translation merge
(both conventions, A wins on conflict), and the one-way-door refusal.
"""

import json
import re

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
    # freeze() splits at build time, so the *splitter* is what gets patched —
    # not get_chapters(), which is the runtime resolver.
    monkeypatch.setattr(
        "services.book_chapters.split_with_html_preference",
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
        "services.book_chapters.split_with_html_preference",
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
    """Convention A (DB export) wins on conflict; B fills gaps."""
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
        ],
    }))

    chapters = [
        {"index": 0, "title": "Zueignung", "paragraphs": ["from-A-0"]},
        {"index": 1, "title": "Nacht", "paragraphs": ["from-B-1"]},
    ]
    translations, warnings, errors = build_translations(2229, 2, chapters)

    entries = translations["zh"]["chapters"]
    assert [e["paragraphs"] for e in entries] == [["from-A-0"], ["from-B-1"]]
    assert entries[0]["title_translation"] == "献辞"
    assert translations["zh"]["provider"] == "claude-code"
    assert errors == []


# ── Misaligned entries are fatal, never dropped, never mis-anchored (#2634) ───

async def test_out_of_range_entry_is_an_error_not_a_drop(frozen_env):
    """Regression #2634: an entry past the end of the split must become an
    error (freeze aborts), not a silent drop."""
    (frozen_env / "legacy_a" / "book_2229_zh.json").write_text(json.dumps({
        "book_id": 2229, "target_language": "zh",
        "entries": [
            {"book_id": 2229, "chapter_index": 99, "target_language": "zh",
             "paragraphs": ["paid work"]},
        ],
    }))
    chapters = [{"index": 0, "title": "Zueignung", "paragraphs": ["a"]}]
    translations, _warnings, errors = build_translations(2229, 1, chapters)
    assert translations == {}
    assert len(errors) == 1 and "out of range" in errors[0]


async def test_paragraph_mismatch_is_an_error_not_fossilized(frozen_env):
    """Regression #2634: a paragraph-count mismatch must become an error,
    not be written at its stale index."""
    (frozen_env / "legacy_a" / "book_2229_zh.json").write_text(json.dumps({
        "book_id": 2229, "target_language": "zh",
        "entries": [
            {"book_id": 2229, "chapter_index": 0, "target_language": "zh",
             "paragraphs": ["one", "two", "three"]},
        ],
    }))
    chapters = [{"index": 0, "title": "Zueignung", "paragraphs": ["a", "b"]}]
    translations, _warnings, errors = build_translations(2229, 1, chapters)
    assert translations == {}
    assert len(errors) == 1 and "paragraph count 3 != source 2" in errors[0]


async def test_no_code_path_deletes_an_entry(frozen_env):
    """#2634 acceptance: every input entry is either placed in the result or
    named in an error — none vanish."""
    (frozen_env / "legacy_a" / "book_2229_zh.json").write_text(json.dumps({
        "book_id": 2229, "target_language": "zh",
        "entries": [
            {"book_id": 2229, "chapter_index": 0, "target_language": "zh",
             "paragraphs": ["ok"]},                       # aligned
            {"book_id": 2229, "chapter_index": 1, "target_language": "zh",
             "paragraphs": ["x", "y", "z"]},              # mismatched
            {"book_id": 2229, "chapter_index": 42, "target_language": "zh",
             "paragraphs": ["stray"]},                    # out of range
        ],
    }))
    chapters = [
        {"index": 0, "title": "A", "paragraphs": ["a"]},
        {"index": 1, "title": "B", "paragraphs": ["b", "c"]},
    ]
    translations, _warnings, errors = build_translations(2229, 2, chapters)
    placed = {e["index"] for e in translations.get("zh", {}).get("chapters", [])}
    assert placed == {0}
    assert any("ch1" in e for e in errors) and any("ch42" in e for e in errors)
    assert len(placed) + len(errors) == 3  # all accounted for


async def test_misaligned_translation_aborts_freeze_even_with_force(frozen_env, tmp_path):
    """#2634: --force must NOT bypass the alignment abort — both dropping and
    mis-anchoring are permanent data loss."""
    await save_book(2229, _META, "irrelevant")
    (frozen_env / "legacy_a" / "book_2229_zh.json").write_text(json.dumps({
        "book_id": 2229, "target_language": "zh",
        "entries": [
            {"book_id": 2229, "chapter_index": 99, "target_language": "zh",
             "paragraphs": ["paid work"]},
        ],
    }))
    with pytest.raises(SystemExit, match="realign_translations"):
        await freeze(2229, "alfmunny", force=True, books_dir=tmp_path / "books")
    assert not (tmp_path / "books").exists()


async def test_dry_run_writes_nothing(frozen_env, tmp_path):
    await save_book(2229, _META, "irrelevant")
    out = await freeze(2229, "alfmunny", dry_run=True, books_dir=tmp_path / "books")
    assert out is None
    assert not (tmp_path / "books").exists()


def test_audited_by_is_required():
    with pytest.raises(SystemExit):
        freeze_module.main(["--book-id", "2229"])


# ── Re-freeze repairs a bad split (#2624 split-override registry) ─────────────

async def test_refreeze_resplits_instead_of_reading_the_frozen_chapters(
    frozen_env, tmp_path
):
    """Regression: freeze() must derive the split at build time. Reading it
    back through get_chapters() would make --force re-freeze the very split it
    was invoked to repair, so a mis-cut boundary could never be corrected."""
    import aiosqlite
    import services.db as db_module
    await save_book(2229, _META, "irrelevant")
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        # A freeze row with no book_chapters rows behind it: get_chapters()
        # would return nothing here, the splitter returns two chapters.
        await db.execute(
            "INSERT INTO book_freeze (book_id, splitter, chapter_source, "
            "frozen_at, audited_by, content_sha256) "
            "VALUES (2229, 'html_preference', 'epub', '2026-08-01', 'alfmunny', 'x')"
        )
        await db.commit()

    out = await freeze(2229, "alfmunny", force=True, books_dir=tmp_path / "books")

    chapters = json.loads(out.read_text())["chapters"]
    assert [c["title"] for c in chapters] == ["Zueignung", "Nacht"]


async def test_freeze_applies_registered_split_overrides(
    frozen_env, tmp_path, monkeypatch
):
    """A registered correction reshapes the artifact the freeze writes."""
    import scripts.chapter_split_overrides as overrides_module
    monkeypatch.setattr(overrides_module, "OVERRIDES", {
        2229: {"merge_into_previous": [
            {"index": 1, "expect_title": "Nacht", "restore_title_as": "speaker_cue"},
        ]},
    })
    await save_book(2229, _META, "irrelevant")

    out = await freeze(2229, "alfmunny", books_dir=tmp_path / "books")

    artifact = json.loads(out.read_text())
    assert [c["title"] for c in artifact["chapters"]] == ["Zueignung"]
    assert content_sha256(artifact["chapters"]) == artifact["split"]["content_sha256"]


async def test_freeze_does_not_trigger_the_translation_deleting_epub_fetch(
    tmp_db, tmp_path, monkeypatch
):
    """#1556: the background EPUB fetch deletes every translation for a book.
    Freezing one must never set that off."""
    import services.book_chapters as bc
    monkeypatch.setattr(freeze_module, "LEGACY_DIR_A", tmp_path / "a")
    monkeypatch.setattr(freeze_module, "LEGACY_DIR_B", tmp_path / "b")
    monkeypatch.setattr(
        "services.book_chapters.get_chapter_source", AsyncMock(return_value="text")
    )
    monkeypatch.setattr(bc, "_epub_fetch_attempted", set())
    fetch = AsyncMock()
    monkeypatch.setattr(bc, "_background_fetch_epub", fetch)
    bc.clear_cache(2229)
    await save_book(2229, _META, "CHAPTER I\n\n" + _PROSE + "\n\nCHAPTER II\n\n" + _PROSE)

    await freeze(2229, "alfmunny", force=True, books_dir=tmp_path / "books")

    fetch.assert_not_called()


async def test_refreeze_carries_forward_translations_only_the_artifact_has(
    frozen_env, tmp_path
):
    """#2634 in the repair path: a re-freeze must not drop translations that
    exist nowhere else. Hamlet #1524 has no legacy export file — its single
    translated chapter lives only in the artifact."""
    await save_book(2229, _META, "irrelevant")
    books_dir = tmp_path / "books"
    books_dir.mkdir()
    (books_dir / "book_2229.json").write_text(json.dumps({
        "schema_version": 1, "book_id": 2229, "meta": {}, "split": {},
        "chapters": [],
        "translations": {"zh": {
            "generated_at": None, "provider": "claude-code", "model": "opus",
            "chapters": [{"index": 0, "title_translation": "献辞",
                          "paragraphs": ["译一", "译二", "译三"]}],
        }},
    }))

    out = await freeze(2229, "alfmunny", force=True, books_dir=books_dir)

    block = json.loads(out.read_text())["translations"]["zh"]
    assert [c["index"] for c in block["chapters"]] == [0]
    assert block["chapters"][0]["title_translation"] == "献辞"
    assert block["provider"] == "claude-code"


async def test_legacy_export_still_overrides_the_artifact_copy(frozen_env, tmp_path):
    """The artifact is the lowest-priority source: a fresh DB export must win,
    or a re-freeze would resurrect a stale translation."""
    await save_book(2229, _META, "irrelevant")
    books_dir = tmp_path / "books"
    books_dir.mkdir()
    (books_dir / "book_2229.json").write_text(json.dumps({
        "schema_version": 1, "book_id": 2229, "meta": {}, "split": {},
        "chapters": [],
        "translations": {"zh": {"generated_at": None, "provider": "stale",
                                "model": "stale", "chapters": [
            {"index": 0, "title_translation": "旧", "paragraphs": ["旧一", "旧二", "旧三"]}
        ]}},
    }))
    (frozen_env / "legacy_a" / "book_2229_zh.json").write_text(json.dumps({
        "book_id": 2229, "target_language": "zh",
        "entries": [{"book_id": 2229, "chapter_index": 0, "target_language": "zh",
                     "paragraphs": ["新一", "新二", "新三"], "provider": "claude-code",
                     "title_translation": "新"}],
    }))

    out = await freeze(2229, "alfmunny", force=True, books_dir=books_dir)

    entry = json.loads(out.read_text())["translations"]["zh"]["chapters"][0]
    assert entry["paragraphs"] == ["新一", "新二", "新三"]
    assert entry["title_translation"] == "新"


# ── Fabricated-title detector (audit gate) ───────────────────────────────────

def test_audit_flags_a_title_lifted_from_its_own_first_paragraph():
    """City of God #45304: the splitter found no headings and built 126 of 133
    titles out of each chapter's opening sentence. Every chapter looked healthy
    to the length/uppercase filters, so the batch froze it."""
    opening = (
        "But it is the occasion of this great Apology which invests it at "
        "once with gravity and interest, and the whole is worth reading."
    )
    findings = mechanical_audit([
        {"index": 0, "title": opening[:60], "paragraphs": [opening, _PROSE]},
    ])

    assert len(findings) == 1
    assert "title is the opening of its own text" in findings[0]


def test_audit_flags_a_boundary_invented_inside_prose():
    """A Room with a View #2641, before #2716: 'Chapter two' matched inside
    narrative prose. The section prefix must not hide it."""
    opening = "Chapter two was found, and she glanced at its opening sentences."
    findings = mechanical_audit([
        {"index": 15, "title": f"PART TWO — {opening}",
         "paragraphs": [opening, _PROSE]},
    ])

    assert len(findings) == 1
    assert "title is the opening of its own text" in findings[0]


def test_audit_ignores_a_real_heading_repeated_in_the_body():
    """Most books restate the chapter heading as the body's first line. Across
    the frozen corpus those run to 13 characters; fabricated prose titles start
    at 49 — the threshold sits in that gap."""
    findings = mechanical_audit([
        {"index": 14, "title": "PART TWO — Chapter XV",
         "paragraphs": ["Chapter XV\nThe Disaster Within", _PROSE]},
        {"index": 0, "title": "CHAPTER I. Down the Rabbit-Hole",
         "paragraphs": ["CHAPTER I. Down the Rabbit-Hole", _PROSE]},
    ])

    assert findings == []


def test_audit_ignores_a_long_title_that_does_not_open_its_text():
    """Dracula's chapter 24 title is 65 characters and entirely legitimate —
    length alone must not trip the detector."""
    findings = mechanical_audit([
        {"index": 25,
         "title": "CHAPTER XXIV DR. SEWARD’S PHONOGRAPH DIARY, SPOKEN BY VAN HELSING",
         "paragraphs": ["This to Jonathan Harker.", _PROSE]},
    ])

    assert findings == []


def test_audit_tolerates_whitespace_differences_between_title_and_body():
    opening = (
        "The propriety of publishing a translation of so choice a specimen "
        "of ancient learning needs no defence."
    )
    findings = mechanical_audit([
        {"index": 2, "title": re.sub(r"\s+", "  ", opening[:58]),
         "paragraphs": [opening.replace(" ", "\n", 3), _PROSE]},
    ])

    assert len(findings) == 1


# ── The artifact's own entries are already corrected (#2745) ─────────────────

async def test_artifact_entries_are_not_remapped_a_second_time(frozen_env):
    """Regression: re-freezing a book with a merge walked its translations
    backwards, once per re-freeze.

    `index_map` moves entries from the *raw* split onto the corrected one, which
    is what legacy exports need — they were made before the merge existed. The
    book's own artifact is different: the previous freeze already applied the
    overrides, so its indices are corrected already. Mapping them again shifts
    them by the merge a second time.

    A Room with a View #2641 is the live case. Its merge maps raw 19 → 18, so
    its zh entry for Chapter XX (57 paragraphs) was tested against Chapter XIX
    (177) and the freeze aborted. Hamlet #1524 has a merge too and was masked
    only because its single entry sits at index 0, where the map is identity.
    """
    (frozen_env / "book_2229.json").write_text(json.dumps({
        "schema_version": 1, "book_id": 2229, "meta": {}, "chapters": [],
        "split": {},
        "translations": {"zh": {
            "provider": "claude-code", "model": "claude-opus-4-7",
            "chapters": [
                # Corrected index 2 — where the previous freeze placed it.
                {"index": 2, "title_translation": "第三章", "paragraphs": ["c-2"]},
            ],
        }},
    }))
    chapters = [
        {"index": 0, "title": "A", "paragraphs": ["a"]},
        {"index": 1, "title": "B", "paragraphs": ["b"]},
        {"index": 2, "title": "C", "paragraphs": ["c-2"]},
    ]
    # A merge at raw 2: raw 2 folds into 1, so raw 3 → 2. Applying this to an
    # already-corrected 2 would walk it to 1, whose paragraphs differ.
    index_map = {0: 0, 1: 1, 2: 1, 3: 2}

    translations, _warnings, errors = build_translations(
        2229, 3, chapters, books_dir=frozen_env, index_map=index_map
    )

    assert errors == [], errors
    assert [e["index"] for e in translations["zh"]["chapters"]] == [2]
    assert translations["zh"]["chapters"][0]["paragraphs"] == ["c-2"]


async def test_legacy_exports_are_still_remapped(frozen_env):
    """The exemption is for the artifact only. A legacy export predates the
    merge, so it still has to be moved onto the corrected split — dropping that
    would orphan every translation after a repaired boundary."""
    (frozen_env / "legacy_a" / "book_2229_zh.json").write_text(json.dumps({
        "book_id": 2229, "target_language": "zh",
        "entries": [
            {"book_id": 2229, "chapter_index": 3, "target_language": "zh",
             "paragraphs": ["c-2"]},
        ],
    }))
    chapters = [
        {"index": 0, "title": "A", "paragraphs": ["a"]},
        {"index": 1, "title": "B", "paragraphs": ["b"]},
        {"index": 2, "title": "C", "paragraphs": ["c-2"]},
    ]
    index_map = {0: 0, 1: 1, 2: 1, 3: 2}

    translations, _warnings, errors = build_translations(
        2229, 3, chapters, books_dir=frozen_env, index_map=index_map
    )

    assert errors == [], errors
    assert [e["index"] for e in translations["zh"]["chapters"]] == [2]


async def test_a_legacy_export_still_overrides_the_artifact_after_remapping(frozen_env):
    """Priority is unchanged: Convention A wins. The comparison now happens in
    corrected space for both, which is the only space where index 2 from the
    artifact and index 3 from a legacy export mean the same chapter."""
    (frozen_env / "book_2229.json").write_text(json.dumps({
        "schema_version": 1, "book_id": 2229, "meta": {}, "chapters": [],
        "split": {},
        "translations": {"zh": {"provider": "old", "model": "old", "chapters": [
            {"index": 2, "title_translation": "stale", "paragraphs": ["from-artifact"]},
        ]}},
    }))
    (frozen_env / "legacy_a" / "book_2229_zh.json").write_text(json.dumps({
        "book_id": 2229, "target_language": "zh",
        "entries": [
            {"book_id": 2229, "chapter_index": 3, "target_language": "zh",
             "paragraphs": ["from-export"]},
        ],
    }))
    chapters = [
        {"index": 0, "title": "A", "paragraphs": ["a"]},
        {"index": 1, "title": "B", "paragraphs": ["b"]},
        {"index": 2, "title": "C", "paragraphs": ["from-export"]},
    ]
    index_map = {0: 0, 1: 1, 2: 1, 3: 2}

    translations, _warnings, errors = build_translations(
        2229, 3, chapters, books_dir=frozen_env, index_map=index_map
    )

    assert errors == [], errors
    assert translations["zh"]["chapters"][0]["paragraphs"] == ["from-export"]
