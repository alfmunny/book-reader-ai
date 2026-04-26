"""FTS5 in-app search router + service tests (issue #592, #648).

Covers:
  - user-scoping on every scope (one user cannot see another user's content)
  - input validation (empty query, max length, invalid scope)
  - snippet highlighting + rank ordering
  - draft chapters excluded from search
  - FTS sync triggers keep the index consistent on insert/update/delete
  - search-query sanitisation (special FTS5 syntax does not crash)
"""
from __future__ import annotations

import aiosqlite
import pytest

import services.db as db_module
from services.db import get_or_create_user
from services.search import search_content, _prepare_fts_query


OTHER_USER = {
    "google_id": "other-google-id",
    "email": "other@example.com",
    "name": "Other",
    "picture": "",
}


async def _seed_annotation(db, user_id: int, book_id: int, chapter_index: int,
                           sentence: str, note: str = ""):
    # Migration 031 added a declared FK annotations.book_id → books(id); make
    # sure the referenced book exists before inserting so tests that use
    # made-up book ids don't fail the constraint.
    await db.execute(
        "INSERT OR IGNORE INTO books (id, title, images) VALUES (?, 'T', '[]')",
        (book_id,),
    )
    cur = await db.execute(
        """INSERT INTO annotations (user_id, book_id, chapter_index, sentence_text, note_text)
           VALUES (?, ?, ?, ?, ?)""",
        (user_id, book_id, chapter_index, sentence, note),
    )
    return cur.lastrowid


async def _seed_vocab_occurrence(db, user_id: int, word: str, book_id: int,
                                 chapter_index: int, sentence: str):
    # Migration 034 added a declared FK word_occurrences.book_id → books(id);
    # seed the parent book first so fabricated ids don't violate it.
    await db.execute(
        "INSERT OR IGNORE INTO books (id, title, images) VALUES (?, 'T', '[]')",
        (book_id,),
    )
    cur = await db.execute(
        "INSERT INTO vocabulary (user_id, word, lemma, language) VALUES (?, ?, ?, 'en')",
        (user_id, word, word),
    )
    vid = cur.lastrowid
    cur2 = await db.execute(
        """INSERT INTO word_occurrences (vocabulary_id, book_id, chapter_index, sentence_text)
           VALUES (?, ?, ?, ?)""",
        (vid, book_id, chapter_index, sentence),
    )
    return vid, cur2.lastrowid


async def _seed_upload(db, owner_user_id: int, book_id: int, chapters: list[tuple[str, str]],
                      is_draft: int = 0):
    """Seed an upload-sourced book with user_book_chapters rows."""
    await db.execute(
        """INSERT OR REPLACE INTO books
           (id, title, authors, languages, subjects, download_count,
            cover, text, images, source, owner_user_id)
           VALUES (?, ?, '[]', '[]', '[]', 0, '', '', '[]', 'upload', ?)""",
        (book_id, f"book-{book_id}", owner_user_id),
    )
    for i, (title, text) in enumerate(chapters):
        await db.execute(
            "INSERT OR REPLACE INTO user_book_chapters "
            "(book_id, chapter_index, title, text, is_draft) VALUES (?, ?, ?, ?, ?)",
            (book_id, i, title, text, is_draft),
        )


# ── Service-level coverage ────────────────────────────────────────────────────

async def test_search_annotation_match(client, test_user):
    """Happy path: a word in the user's annotation is findable."""
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await _seed_annotation(db, test_user["id"], 42, 3,
                               "The foreshadowing is clear in this passage.", "K's first court")
        await db.commit()

    res = await client.get("/api/search?q=foreshadowing")
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["total"] == 1
    hit = data["results"][0]
    assert hit["type"] == "annotation"
    assert "<b>foreshadowing</b>" in hit["snippet"]
    assert hit["note_text"] == "K's first court"


async def test_search_vocabulary_match(client, test_user):
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await _seed_vocab_occurrence(db, test_user["id"], "Weltschmerz", 1234, 2,
                                     "The protagonist is filled with Weltschmerz today.")
        await db.commit()

    res = await client.get("/api/search?q=Weltschmerz")
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["total"] == 1
    hit = data["results"][0]
    assert hit["type"] == "vocabulary"
    assert hit["word"] == "Weltschmerz"


async def test_search_chapter_match_and_skips_drafts(client, test_user):
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        # Confirmed chapter: should be searchable.
        await _seed_upload(db, test_user["id"], 5001,
                           [("Chapter One", "The kestrel flew across the sky.")], is_draft=0)
        # Draft chapter: must NOT appear in search results.
        await _seed_upload(db, test_user["id"], 5002,
                           [("Draft", "The kestrel screamed loudly here.")], is_draft=1)
        await db.commit()

    res = await client.get("/api/search?q=kestrel")
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["total"] == 1
    hit = data["results"][0]
    assert hit["type"] == "chapter"
    assert hit["book_id"] == 5001
    assert hit["chapter_title"] == "Chapter One"


async def test_search_user_scoped_annotations(client, test_user):
    """User A's query must not surface user B's annotations."""
    other = await get_or_create_user(**OTHER_USER)
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await _seed_annotation(db, other["id"], 42, 3, "secret foreshadowing content", "")
        await db.commit()

    res = await client.get("/api/search?q=foreshadowing")
    assert res.status_code == 200
    assert res.json()["total"] == 0


async def test_search_user_scoped_vocabulary(client, test_user):
    other = await get_or_create_user(**OTHER_USER)
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await _seed_vocab_occurrence(db, other["id"], "Schadenfreude", 1234, 2,
                                     "filled with Schadenfreude")
        await db.commit()
    res = await client.get("/api/search?q=Schadenfreude")
    assert res.json()["total"] == 0


async def test_search_user_scoped_chapters(client, test_user):
    other = await get_or_create_user(**OTHER_USER)
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await _seed_upload(db, other["id"], 6001,
                           [("Secret", "a zebra roamed the plains")], is_draft=0)
        await db.commit()
    res = await client.get("/api/search?q=zebra")
    assert res.json()["total"] == 0


async def test_confirm_transition_makes_chapter_searchable(client, test_user):
    """A chapter that starts as draft appears in search only after is_draft=0."""
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await _seed_upload(db, test_user["id"], 7001,
                           [("Hidden", "a unicorn wandered in")], is_draft=1)
        await db.commit()

    # Before confirm: 0 hits.
    res = await client.get("/api/search?q=unicorn")
    assert res.json()["total"] == 0

    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "UPDATE user_book_chapters SET is_draft=0 WHERE book_id=7001"
        )
        await db.commit()

    res = await client.get("/api/search?q=unicorn")
    assert res.json()["total"] == 1


async def test_word_occurrence_update_reindexes(client, test_user):
    """Updating word_occurrence.sentence_text rebuilds the FTS entry (word_occ_au)."""
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        _, occ_id = await _seed_vocab_occurrence(
            db, test_user["id"], "aurora", 1, 0, "The old sentence about clouds."
        )
        await db.commit()

    res = await client.get("/api/search?q=clouds")
    assert res.json()["total"] == 1

    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "UPDATE word_occurrences SET sentence_text = 'A new sentence about meteors.' WHERE id=?",
            (occ_id,),
        )
        await db.commit()

    # Old term gone, new term indexed.
    assert (await client.get("/api/search?q=clouds")).json()["total"] == 0
    assert (await client.get("/api/search?q=meteors")).json()["total"] == 1


async def test_scope_filter_annotations_only(client, test_user):
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await _seed_annotation(db, test_user["id"], 1, 0, "cat hat bat", "")
        await _seed_vocab_occurrence(db, test_user["id"], "bat", 1, 0, "a vampire bat at night")
        await db.commit()

    res = await client.get("/api/search?q=bat&scope=annotations")
    hits = res.json()["results"]
    assert all(h["type"] == "annotation" for h in hits)
    assert len(hits) == 1


async def test_scope_filter_vocabulary_only(client, test_user):
    """Regression #1468: scope=vocabulary must exclude annotation hits."""
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await _seed_annotation(db, test_user["id"], 1, 0, "a phoenix rose from the ashes", "")
        await _seed_vocab_occurrence(db, test_user["id"], "phoenix", 1, 0,
                                     "the phoenix is a mythical bird")
        await db.commit()

    res = await client.get("/api/search?q=phoenix&scope=vocabulary")
    assert res.status_code == 200, res.text
    hits = res.json()["results"]
    assert all(h["type"] == "vocabulary" for h in hits), (
        f"Regression #1468: scope=vocabulary returned non-vocabulary hit: {hits}"
    )
    assert len(hits) == 1


async def test_scope_filter_chapters_only(client, test_user):
    """Regression #1468: scope=chapters must exclude annotation hits."""
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await _seed_annotation(db, test_user["id"], 1, 0, "a basilisk lurked nearby", "")
        await _seed_upload(db, test_user["id"], 8001,
                           [("Ch1", "the basilisk turned to stone")], is_draft=0)
        await db.commit()

    res = await client.get("/api/search?q=basilisk&scope=chapters")
    assert res.status_code == 200, res.text
    hits = res.json()["results"]
    assert all(h["type"] == "chapter" for h in hits), (
        f"Regression #1468: scope=chapters returned non-chapter hit: {hits}"
    )
    assert len(hits) == 1


async def test_scope_filter_vocabulary_and_chapters(client, test_user):
    """Regression #1468: scope=vocabulary&scope=chapters must exclude annotations."""
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await _seed_annotation(db, test_user["id"], 1, 0, "a manticore prowled the desert", "")
        await _seed_vocab_occurrence(db, test_user["id"], "manticore", 1, 0,
                                     "manticore: fearsome creature")
        await _seed_upload(db, test_user["id"], 8002,
                           [("Ch1", "the manticore roared at dawn")], is_draft=0)
        await db.commit()

    res = await client.get("/api/search?q=manticore&scope=vocabulary,chapters")
    assert res.status_code == 200, res.text
    hits = res.json()["results"]
    types = {h["type"] for h in hits}
    assert "annotation" not in types, (
        f"Regression #1468: scope=vocabulary,chapters must not return annotations, got: {hits}"
    )
    assert types <= {"vocabulary", "chapter"}
    assert len(hits) == 2


async def test_invalid_scope_returns_400(client, test_user):
    res = await client.get("/api/search?q=foo&scope=bogus")
    assert res.status_code == 400
    assert "scope" in res.json()["detail"].lower()


async def test_empty_query_returns_422(client, test_user):
    # FastAPI enforces min_length=1 at the query-param layer before our handler.
    res = await client.get("/api/search?q=")
    assert res.status_code == 422


async def test_whitespace_only_query_returns_400(client, test_user):
    res = await client.get("/api/search?q=%20%20")
    assert res.status_code == 400


async def test_query_max_length_rejected(client, test_user):
    res = await client.get(f"/api/search?q={'x' * 201}")
    assert res.status_code == 422


async def test_limit_capped(client, test_user):
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        for i in range(60):
            await _seed_annotation(db, test_user["id"], 1, i, f"needle match {i}", "")
        await db.commit()
    # Limit clamp: request 500 → 422 (Query ge/le enforced).
    res = await client.get("/api/search?q=needle&limit=500")
    assert res.status_code == 422
    # Max valid limit = 50.
    res = await client.get("/api/search?q=needle&limit=50")
    assert res.status_code == 200
    assert len(res.json()["results"]) == 50


async def test_query_with_fts5_special_chars_does_not_crash(client, test_user):
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await _seed_annotation(db, test_user["id"], 1, 0,
                               "AND OR NOT are special FTS5 operators", "")
        await db.commit()
    # Raw 'AND OR' would error without escaping; our phrase-wrap avoids that.
    res = await client.get("/api/search?q=AND+OR")
    assert res.status_code == 200
    # The escaped phrase search should still find the annotation with that literal substring.
    assert res.json()["total"] == 1


async def test_prepare_fts_query_escapes_double_quotes():
    assert _prepare_fts_query('he said "hello"') == '"he said ""hello"""'


# ── Delete-cascade of FTS entries ────────────────────────────────────────────

async def test_annotation_delete_removes_fts_entry(client, test_user):
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        aid = await _seed_annotation(db, test_user["id"], 1, 0, "kraken rising", "")
        await db.commit()
    assert (await client.get("/api/search?q=kraken")).json()["total"] == 1
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute("DELETE FROM annotations WHERE id=?", (aid,))
        await db.commit()
    assert (await client.get("/api/search?q=kraken")).json()["total"] == 0


async def test_confirmed_chapter_delete_removes_fts_entry(client, test_user):
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await _seed_upload(db, test_user["id"], 7500,
                           [("C", "narwhals are magnificent")], is_draft=0)
        await db.commit()
    assert (await client.get("/api/search?q=narwhals")).json()["total"] == 1
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute("DELETE FROM user_book_chapters WHERE book_id=7500")
        await db.commit()
    assert (await client.get("/api/search?q=narwhals")).json()["total"] == 0
