"""Tests for scripts/ingest_book.py — slice 1 of the fossilized-content
architecture (#2624 / docs/design/local-first-content.md).

Covers: happy-path ingest into content tables, sha-mismatch abort with
nothing written, idempotent re-ingest, preservation of DB-only
translation languages, the user-table invariant, and the upload-clobber
guard.
"""

import json

import aiosqlite
import pytest

import services.db as db_module
from scripts.freeze_book import content_sha256
from scripts.ingest_book import ArtifactError, ingest, load_artifact
from services.db import get_or_create_user


def _artifact(book_id: int = 2229, tamper: bool = False) -> dict:
    chapters = [
        {"index": 0, "title": "Zueignung", "paragraphs": ["Ihr naht euch", "wieder"]},
        {"index": 1, "title": "Nacht", "paragraphs": ["FAUST.\nHabe nun, ach!"]},
    ]
    artifact = {
        "schema_version": 1,
        "book_id": book_id,
        "meta": {
            "title": "Faust",
            "authors": ["Goethe"],
            "languages": ["de"],
            "subjects": [],
            "cover": "",
            "download_count": 0,
        },
        "split": {
            "splitter": "html_preference",
            "chapter_source": "epub",
            "frozen_at": "2026-08-06",
            "audited_by": "alfmunny",
            "content_sha256": content_sha256(chapters),
        },
        "chapters": chapters,
        "translations": {
            "zh": {
                "generated_at": None,
                "provider": "claude-code",
                "model": "claude-opus-4-7",
                "chapters": [
                    {"index": 0, "title_translation": "献辞",
                     "paragraphs": ["你们又走近了", "再一次"]},
                ],
            },
        },
    }
    if tamper:
        artifact["chapters"][0]["paragraphs"][0] = "modified after freeze"
    return artifact


async def _count(db_path: str, query: str, *params) -> int:
    async with aiosqlite.connect(db_path) as db:
        async with db.execute(query, params) as cur:
            return (await cur.fetchone())[0]


async def test_ingest_happy_path(tmp_db):
    summary = await ingest(_artifact(), tmp_db)
    assert summary == {
        "book_id": 2229, "title": "Faust", "chapters": 2,
        "translated_chapters": 1, "languages": ["zh"],
    }

    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("SELECT title, text FROM books WHERE id=2229") as cur:
            title, text = await cur.fetchone()
        assert title == "Faust"
        assert text == ""  # frozen books don't serve from books.text
        async with db.execute(
            "SELECT text FROM book_chapters WHERE book_id=2229 AND chapter_index=0"
        ) as cur:
            assert (await cur.fetchone())[0] == "Ihr naht euch\n\nwieder"
        async with db.execute(
            "SELECT audited_by FROM book_freeze WHERE book_id=2229"
        ) as cur:
            assert (await cur.fetchone())[0] == "alfmunny"
        async with db.execute(
            "SELECT paragraphs, provider, title_translation FROM translations "
            "WHERE book_id=2229 AND chapter_index=0 AND target_language='zh'"
        ) as cur:
            paragraphs, provider, title_tr = await cur.fetchone()
        assert json.loads(paragraphs) == ["你们又走近了", "再一次"]
        assert provider == "claude-code"
        assert title_tr == "献辞"


async def test_sha_mismatch_aborts_before_writing(tmp_db, tmp_path):
    """A tampered chapters array must fail validation and write nothing."""
    path = tmp_path / "book_2229.json"
    path.write_text(json.dumps(_artifact(tamper=True)))
    with pytest.raises(ArtifactError, match="content_sha256 mismatch"):
        load_artifact(path)
    assert await _count(tmp_db, "SELECT COUNT(*) FROM books WHERE id=2229") == 0


async def test_reingest_is_idempotent(tmp_db):
    await ingest(_artifact(), tmp_db)
    await ingest(_artifact(), tmp_db)
    assert await _count(
        tmp_db, "SELECT COUNT(*) FROM book_chapters WHERE book_id=2229") == 2
    assert await _count(
        tmp_db, "SELECT COUNT(*) FROM translations WHERE book_id=2229") == 1


async def test_db_only_language_left_alone(tmp_db):
    """A translation language present in the DB but absent from the artifact
    survives ingest (until slice 4 makes ingest the only writer)."""
    await ingest(_artifact(), tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute(
            "INSERT INTO translations (book_id, chapter_index, target_language, paragraphs) "
            "VALUES (2229, 0, 'fr', '[\"bonjour\"]')"
        )
        await db.commit()

    await ingest(_artifact(), tmp_db)
    assert await _count(
        tmp_db,
        "SELECT COUNT(*) FROM translations WHERE book_id=2229 AND target_language='fr'",
    ) == 1


async def test_user_tables_never_touched(tmp_db):
    """Ingest is content-tables-only: an annotation anchored to the book
    survives a re-ingest byte-for-byte."""
    await ingest(_artifact(), tmp_db)
    user = await get_or_create_user(
        google_id="g1", email="a@b.com", name="A", picture="")
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute(
            "INSERT INTO annotations (user_id, book_id, chapter_index, sentence_text) "
            "VALUES (?, 2229, 1, 'Habe nun, ach!')", (user["id"],),
        )
        await db.commit()

    await ingest(_artifact(), tmp_db)
    assert await _count(
        tmp_db, "SELECT COUNT(*) FROM annotations WHERE book_id=2229") == 1


async def test_refuses_to_clobber_uploaded_book(tmp_db):
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute(
            "INSERT INTO books (id, title, authors, languages, subjects, "
            "download_count, cover, text, images, source) "
            "VALUES (2229, 'Private', '[]', '[]', '[]', 0, '', '', '[]', 'upload')"
        )
        await db.commit()
    with pytest.raises(ArtifactError, match="uploaded book"):
        await ingest(_artifact(), tmp_db)
    assert await _count(
        tmp_db, "SELECT COUNT(*) FROM book_freeze WHERE book_id=2229") == 0


def test_load_artifact_rejects_missing_keys(tmp_path):
    path = tmp_path / "book_1.json"
    path.write_text(json.dumps({"schema_version": 1, "book_id": 1}))
    with pytest.raises(ArtifactError, match="missing keys"):
        load_artifact(path)


# ── Shrink guard (#2631) ──────────────────────────────────────────────────────

async def test_ingest_aborts_when_artifact_shrinks_a_language(tmp_db):
    """Regression #2631: DB holds N translations for a language, the artifact
    carries fewer → ingest must abort with the missing indices, writing
    nothing (the DB-only row survives)."""
    await ingest(_artifact(), tmp_db)  # zh: chapter 0 from the artifact
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute(
            "INSERT INTO translations (book_id, chapter_index, target_language, paragraphs) "
            "VALUES (2229, 1, 'zh', '[\"DB-only row\"]')"
        )
        await db.commit()

    with pytest.raises(ArtifactError, match=r"zh.*2 row\(s\).*1.*chapter_index.*1"):
        await ingest(_artifact(), tmp_db)

    assert await _count(
        tmp_db,
        "SELECT COUNT(*) FROM translations WHERE book_id=2229 AND target_language='zh'",
    ) == 2  # both rows intact — nothing was deleted


async def test_ingest_allow_shrink_proceeds(tmp_db):
    """--allow-shrink: the explicit override replaces the language with the
    artifact's (smaller) set."""
    await ingest(_artifact(), tmp_db)
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute(
            "INSERT INTO translations (book_id, chapter_index, target_language, paragraphs) "
            "VALUES (2229, 1, 'zh', '[\"DB-only row\"]')"
        )
        await db.commit()

    await ingest(_artifact(), tmp_db, allow_shrink=True)
    assert await _count(
        tmp_db,
        "SELECT COUNT(*) FROM translations WHERE book_id=2229 AND target_language='zh'",
    ) == 1
