"""Tests for admin endpoints — users, books, audio, translations, stats."""

import json
import pytest
from unittest.mock import patch, AsyncMock
import aiosqlite
import services.db as db_module
import routers.admin as admin_module
from services.db import (
    init_db, get_or_create_user, get_user_by_id, save_book,
    save_translation, set_user_approved, create_annotation, save_insight,
    upsert_reading_progress, save_word, get_vocabulary,
    save_chapter_summary, get_chapter_summary,
    log_reading_event,
)
from services.auth import get_current_user, create_jwt
from main import app
from httpx import AsyncClient, ASGITransport


ADMIN_USER = {
    "google_id": "admin-google-id",
    "email": "admin@example.com",
    "name": "Admin",
    "picture": "",
}

BOOK_META = {
    "id": 100,
    "title": "Test Book",
    "authors": ["Author"],
    "languages": ["de"],
    "subjects": [],
    "download_count": 0,
    "cover": "",
}

BOOK_TEXT = "CHAPTER I\n\nErster Absatz des ersten Kapitels.\n\nZweiter Absatz.\n\nCHAPTER II\n\nErstes Kapitel zwei."


@pytest.fixture
async def admin_db(monkeypatch, tmp_path):
    path = str(tmp_path / "admin-test.db")
    monkeypatch.setattr(db_module, "DB_PATH", path)
    monkeypatch.setattr(admin_module, "DB_PATH", path)

    from unittest.mock import AsyncMock as _AsyncMock
    monkeypatch.setattr("services.db.get_book_epub_bytes", _AsyncMock(return_value=None))
    monkeypatch.setattr("services.book_chapters._background_fetch_epub", _AsyncMock())
    from services.book_chapters import clear_cache as _clear_cache
    _clear_cache()

    await init_db()
    return path


async def _seed_book(book_id: int) -> None:
    """translations.book_id and audio_cache.book_id carry declared FKs to
    books(id) (migration 033, #754 PR 3/4). Tests that INSERT directly into
    either table (or call save_translation with a fabricated id) must ensure
    the parent book row exists. Uses source='upload' so the row doesn't show
    up in list_cached_books and throw off unrelated count assertions."""
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "INSERT OR IGNORE INTO books (id, title, images, source) "
            "VALUES (?, 'T', '[]', 'upload')",
            (book_id,),
        )
        await db.commit()


@pytest.fixture
async def admin_user(admin_db):
    """First user is auto-admin."""
    return await get_or_create_user(**ADMIN_USER)


@pytest.fixture
async def admin_client(admin_user):
    async def _override():
        return await get_user_by_id(admin_user["id"])

    app.dependency_overrides[get_current_user] = _override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


# ── Users ────────────────────────────────────────────────────────────────────

async def test_get_users(admin_client, admin_user):
    res = await admin_client.get("/api/admin/users")
    assert res.status_code == 200
    users = res.json()
    assert len(users) >= 1
    assert any(u["email"] == "admin@example.com" for u in users)


async def test_approve_user(admin_client, admin_db):
    user2 = await get_or_create_user(
        google_id="user2", email="u2@test.com", name="User2", picture=""
    )
    res = await admin_client.put(
        f"/api/admin/users/{user2['id']}/approve",
        json={"approved": True},
    )
    assert res.status_code == 200
    updated = await get_user_by_id(user2["id"])
    assert updated["approved"] == 1


async def test_change_role(admin_client, admin_db):
    user2 = await get_or_create_user(
        google_id="user2", email="u2@test.com", name="User2", picture=""
    )
    await set_user_approved(user2["id"], True)
    res = await admin_client.put(
        f"/api/admin/users/{user2['id']}/role",
        json={"role": "admin"},
    )
    assert res.status_code == 200
    updated = await get_user_by_id(user2["id"])
    assert updated["role"] == "admin"


async def test_approve_nonexistent_user_returns_404(admin_client):
    """Approving a user that doesn't exist must return 404, not 200."""
    res = await admin_client.put("/api/admin/users/99999/approve", json={"approved": True})
    assert res.status_code == 404


async def test_change_role_nonexistent_user_returns_404(admin_client):
    """Changing role for a user that doesn't exist must return 404, not 200."""
    res = await admin_client.put("/api/admin/users/99999/role", json={"role": "admin"})
    assert res.status_code == 404


async def test_remove_nonexistent_user_returns_404(admin_client):
    """Deleting a user that doesn't exist must return 404, not 200."""
    res = await admin_client.delete("/api/admin/users/99999")
    assert res.status_code == 404


async def test_change_role_invalid(admin_client):
    res = await admin_client.put("/api/admin/users/1/role", json={"role": "superuser"})
    assert res.status_code == 400


async def test_change_role_oversized_role_returns_422(admin_client):
    # regression for #538: role field was unbounded
    res = await admin_client.put("/api/admin/users/1/role", json={"role": "x" * 11})
    assert res.status_code == 422


async def test_cannot_demote_self(admin_client, admin_user):
    res = await admin_client.put(
        f"/api/admin/users/{admin_user['id']}/role",
        json={"role": "user"},
    )
    assert res.status_code == 400
    assert "yourself" in res.json()["detail"].lower()


async def test_delete_user(admin_client, admin_db):
    user2 = await get_or_create_user(
        google_id="del-user", email="del@test.com", name="Del", picture=""
    )
    res = await admin_client.delete(f"/api/admin/users/{user2['id']}")
    assert res.status_code == 200
    assert await get_user_by_id(user2["id"]) is None


async def test_cannot_delete_self(admin_client, admin_user):
    res = await admin_client.delete(f"/api/admin/users/{admin_user['id']}")
    assert res.status_code == 400


async def test_delete_user_removes_all_user_data(admin_client, admin_db, admin_user):
    """delete_user must cascade to all user-owned tables — vocabulary,
    word_occurrences, annotations, book_insights, and reading_progress."""
    await save_book(100, BOOK_META, BOOK_TEXT)
    user2 = await get_or_create_user(
        google_id="del-user-cascade", email="cascade@test.com", name="Cascade", picture=""
    )

    with patch("services.db._update_lemma", new_callable=AsyncMock):
        await save_word(user2["id"], "cascadeword", 100, 0, "A cascade sentence.")
    await create_annotation(user2["id"], 100, 0, "Some text.", "", "yellow")
    await save_insight(user2["id"], 100, 0, "Q?", "A.")
    await upsert_reading_progress(user2["id"], 100, 2)

    res = await admin_client.delete(f"/api/admin/users/{user2['id']}")
    assert res.status_code == 200

    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        for table, col in [
            ("vocabulary", "user_id"),
            ("annotations", "user_id"),
            ("book_insights", "user_id"),
            ("user_reading_progress", "user_id"),
        ]:
            async with conn.execute(
                f"SELECT COUNT(*) FROM {table} WHERE {col} = ?", (user2["id"],)
            ) as cur:
                (count,) = await cur.fetchone()
            assert count == 0, f"orphaned rows left in {table} after delete_user"

        async with conn.execute(
            "SELECT COUNT(*) FROM word_occurrences wo "
            "JOIN vocabulary v ON v.id = wo.vocabulary_id "
            "WHERE v.user_id = ?",
            (user2["id"],)
        ) as cur:
            (occ_count,) = await cur.fetchone()
    assert occ_count == 0, "orphaned word_occurrences left after delete_user"


async def test_delete_user_removes_reading_history(admin_client, admin_db, admin_user):
    """Regression for #287: delete_user must also remove reading_history rows.

    PRAGMA foreign_keys is disabled so ON DELETE CASCADE is never enforced;
    delete_user must include an explicit DELETE FROM reading_history.
    """
    await save_book(100, BOOK_META, BOOK_TEXT)
    user2 = await get_or_create_user(
        google_id="del-history-user", email="history@test.com", name="History", picture=""
    )
    await log_reading_event(user2["id"], 100, 0)
    await log_reading_event(user2["id"], 100, 1)

    res = await admin_client.delete(f"/api/admin/users/{user2['id']}")
    assert res.status_code == 200

    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        async with conn.execute(
            "SELECT COUNT(*) FROM reading_history WHERE user_id = ?", (user2["id"],)
        ) as cur:
            (count,) = await cur.fetchone()
    assert count == 0, "orphaned reading_history rows left after delete_user"


async def test_delete_user_removes_book_uploads(admin_client, admin_db, admin_user):
    """Regression #403: delete_user must also remove book_uploads rows.

    PRAGMA foreign_keys is disabled so ON DELETE CASCADE on book_uploads.user_id
    is never enforced; delete_user must include an explicit DELETE FROM book_uploads.
    """
    import json as _json
    user2 = await get_or_create_user(
        google_id="del-uploads-user", email="uploads@test.com", name="Uploads", picture=""
    )
    chapters = _json.dumps({"draft": False, "chapters": [{"title": "Ch1", "text": "text"}]})
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            """INSERT INTO books (id, title, authors, languages, subjects,
               download_count, cover, text, images, source, owner_user_id)
               VALUES (9901, 'Upload', '[]', '[]', '[]', 0, '', ?, '[]', 'upload', ?)""",
            (chapters, user2["id"]),
        )
        await db.execute(
            """INSERT INTO book_uploads (book_id, user_id, filename, file_size, format)
               VALUES (9901, ?, 'test.epub', 1000, 'epub')""",
            (user2["id"],),
        )
        await db.commit()

    res = await admin_client.delete(f"/api/admin/users/{user2['id']}")
    assert res.status_code == 200

    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        async with conn.execute(
            "SELECT COUNT(*) FROM book_uploads WHERE user_id = ?", (user2["id"],)
        ) as cur:
            (count,) = await cur.fetchone()
    assert count == 0, "orphaned book_uploads rows left after delete_user"


async def test_delete_user_prunes_orphaned_vocabulary_from_other_readers(admin_client, admin_db):
    """Regression #438: deleting a book owner must prune vocabulary entries in
    other users that have no remaining word_occurrences after the book is removed.
    """
    import json as _json
    owner = await get_or_create_user(
        google_id="vocab-orphan-owner", email="vocab-owner@test.com", name="Owner", picture=""
    )
    reader = await get_or_create_user(
        google_id="vocab-orphan-reader", email="vocab-reader@test.com", name="Reader", picture=""
    )
    chapters = _json.dumps({"draft": False, "chapters": [{"title": "Ch1", "text": "unique"}]})
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            """INSERT INTO books (id, title, authors, languages, subjects,
               download_count, cover, text, images, source, owner_user_id)
               VALUES (9970, 'OwnedBook', '[]', '[]', '[]', 0, '', ?, '[]', 'upload', ?)""",
            (chapters, owner["id"]),
        )
        await db.execute(
            "INSERT OR IGNORE INTO vocabulary (user_id, word) VALUES (?, ?)",
            (reader["id"], "unique"),
        )
        async with db.execute(
            "SELECT id FROM vocabulary WHERE user_id = ? AND word = ?",
            (reader["id"], "unique"),
        ) as cur:
            (vocab_id,) = await cur.fetchone()
        await db.execute(
            "INSERT OR IGNORE INTO word_occurrences (vocabulary_id, book_id, chapter_index, sentence_text) VALUES (?, ?, ?, ?)",
            (vocab_id, 9970, 0, "unique sentence"),
        )
        await db.commit()

    res = await admin_client.delete(f"/api/admin/users/{owner['id']}")
    assert res.status_code == 200

    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        async with conn.execute(
            "SELECT COUNT(*) FROM vocabulary WHERE id = ?", (vocab_id,)
        ) as cur:
            (count,) = await cur.fetchone()
    assert count == 0, "orphaned vocabulary entry remains after owner deleted"


async def test_delete_user_cleans_flashcard_reviews_for_other_readers(admin_client, admin_db):
    """Regression #695: deleting a book owner must clean up flashcard_reviews for
    other users whose vocabulary entries are pruned when the owned book is removed.

    FK enforcement is OFF, so the cascade on flashcard_reviews(vocabulary_id) never
    fires automatically. delete_user() must explicitly DELETE FROM flashcard_reviews
    between the word_occurrences prune and the vocabulary prune.
    """
    import json as _json
    from services.db import _ensure_flashcard_rows

    owner = await get_or_create_user(
        google_id="fr-owner-695", email="fr-owner@test.com", name="Owner", picture=""
    )
    reader = await get_or_create_user(
        google_id="fr-reader-695", email="fr-reader@test.com", name="Reader", picture=""
    )
    chapters = _json.dumps({"draft": False, "chapters": [{"title": "Ch1", "text": "unique695"}]})
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            """INSERT INTO books (id, title, authors, languages, subjects,
               download_count, cover, text, images, source, owner_user_id)
               VALUES (9971, 'OwnedBook695', '[]', '[]', '[]', 0, '', ?, '[]', 'upload', ?)""",
            (chapters, owner["id"]),
        )
        await db.execute(
            "INSERT OR IGNORE INTO vocabulary (user_id, word) VALUES (?, ?)",
            (reader["id"], "unique695"),
        )
        async with db.execute(
            "SELECT id FROM vocabulary WHERE user_id = ? AND word = ?",
            (reader["id"], "unique695"),
        ) as cur:
            (vocab_id,) = await cur.fetchone()
        await db.execute(
            "INSERT OR IGNORE INTO word_occurrences "
            "(vocabulary_id, book_id, chapter_index, sentence_text) VALUES (?, ?, ?, ?)",
            (vocab_id, 9971, 0, "unique695 sentence"),
        )
        await db.commit()

    await _ensure_flashcard_rows(reader["id"])

    async with aiosqlite.connect(db_module.DB_PATH) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM flashcard_reviews WHERE vocabulary_id = ?", (vocab_id,)
        ) as cur:
            (before,) = await cur.fetchone()
    assert before > 0, "test setup: flashcard_reviews row not created for reader"

    res = await admin_client.delete(f"/api/admin/users/{owner['id']}")
    assert res.status_code == 200

    async with aiosqlite.connect(db_module.DB_PATH) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM flashcard_reviews WHERE vocabulary_id = ?", (vocab_id,)
        ) as cur:
            (after,) = await cur.fetchone()
    assert after == 0, (
        "flashcard_reviews rows must be deleted when delete_user prunes orphaned vocabulary (#695); "
        "orphaned rows inflate flashcard stats for affected readers"
    )


async def test_delete_user_removes_flashcard_reviews(admin_client, admin_db, admin_user):
    """Regression #630: delete_user must delete flashcard_reviews rows.

    FK enforcement is OFF so ON DELETE CASCADE never fires; delete_user must
    include an explicit DELETE FROM flashcard_reviews.
    """
    from services.db import _ensure_flashcard_rows
    await save_book(100, BOOK_META, BOOK_TEXT)
    user2 = await get_or_create_user(
        google_id="flashcard-cascade", email="flashcard@test.com", name="FC", picture=""
    )
    with patch("services.db._update_lemma", new_callable=AsyncMock):
        await save_word(user2["id"], "testword", 100, 0, "A test sentence.")
    # Seed flashcard_reviews row for the vocabulary word
    await _ensure_flashcard_rows(user2["id"])

    # Verify the row exists before deletion
    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        async with conn.execute(
            "SELECT COUNT(*) FROM flashcard_reviews WHERE user_id = ?", (user2["id"],)
        ) as cur:
            (before,) = await cur.fetchone()
    assert before > 0, "test setup: flashcard_reviews row not created"

    res = await admin_client.delete(f"/api/admin/users/{user2['id']}")
    assert res.status_code == 200

    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        async with conn.execute(
            "SELECT COUNT(*) FROM flashcard_reviews WHERE user_id = ?", (user2["id"],)
        ) as cur:
            (after,) = await cur.fetchone()
    assert after == 0, "orphaned flashcard_reviews rows left after delete_user"


# ── Books ────────────────────────────────────────────────────────────────────

async def test_get_books(admin_client, admin_db):
    await save_book(100, BOOK_META, BOOK_TEXT)
    res = await admin_client.get("/api/admin/books")
    assert res.status_code == 200
    books = res.json()
    assert len(books) >= 1
    assert books[0]["text_length"] > 0
    # New: translations field (empty when none cached)
    assert books[0]["translations"] == {}


async def test_get_books_includes_translation_counts(admin_client, admin_db):
    await save_book(100, BOOK_META, BOOK_TEXT)
    await save_translation(100, 0, "en", ["a"])
    await save_translation(100, 1, "en", ["b"])
    await save_translation(100, 0, "zh", ["中"])

    res = await admin_client.get("/api/admin/books")
    assert res.status_code == 200
    books = res.json()
    book = next(b for b in books if b["id"] == 100)
    assert book["translations"] == {"en": 2, "zh": 1}


async def test_delete_book(admin_client, admin_db):
    await save_book(100, BOOK_META, BOOK_TEXT)
    res = await admin_client.delete("/api/admin/books/100")
    assert res.status_code == 200


async def test_delete_book_nonexistent_returns_404(admin_client):
    """DELETE /admin/books/{id} for a non-existent book must return 404, not 200."""
    res = await admin_client.delete("/api/admin/books/99999")
    assert res.status_code == 404


async def test_delete_book_removes_queue_entries(admin_client, admin_db):
    """Regression: delete_book must also delete translation_queue entries.

    If queue entries are left behind with status='skipped' (set by the worker
    when it finds the book missing), a subsequent re-import of the same book_id
    cannot enqueue new translations — INSERT OR IGNORE is blocked by the old
    skipped rows. The re-imported book would never be translated.
    """
    from services.translation_queue import enqueue, queue_status_for_chapter

    await save_book(100, BOOK_META, BOOK_TEXT)
    await enqueue(100, 0, "de")  # Add a pending queue entry

    # Confirm the entry exists before deletion
    status = await queue_status_for_chapter(100, 0, "de")
    assert status["queued"]

    # Delete the book
    res = await admin_client.delete("/api/admin/books/100")
    assert res.status_code == 200

    # Queue entry should be gone — not just skipped, but deleted
    status = await queue_status_for_chapter(100, 0, "de")
    assert not status["queued"]


async def test_delete_book_removes_word_occurrences(admin_client, admin_db):
    await save_book(100, BOOK_META, BOOK_TEXT)
    async with aiosqlite.connect(admin_db) as db:
        await db.execute(
            "INSERT INTO vocabulary (user_id, word) VALUES (1, 'ephemeral')"
        )
        await db.execute(
            "INSERT INTO word_occurrences (vocabulary_id, book_id, chapter_index, sentence_text)"
            " VALUES (1, 100, 0, 'The ephemeral moment.')"
        )
        await db.commit()
    await admin_client.delete("/api/admin/books/100")
    async with aiosqlite.connect(admin_db) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM word_occurrences WHERE book_id = 100"
        ) as cur:
            count = (await cur.fetchone())[0]
    assert count == 0


async def test_delete_book_removes_flashcard_reviews(admin_client, admin_db):
    """Regression #691: admin delete_book must clean up flashcard_reviews before pruning vocabulary.

    SQLite FK enforcement is OFF so ON DELETE CASCADE never fires. Without an
    explicit DELETE, orphaned flashcard_reviews rows inflate flashcard stats for
    users who had saved words from the deleted book."""
    await save_book(100, BOOK_META, BOOK_TEXT)
    async with aiosqlite.connect(admin_db) as db:
        await db.execute("INSERT INTO vocabulary (user_id, word) VALUES (1, 'ephemeral')")
        async with db.execute("SELECT id FROM vocabulary WHERE word='ephemeral'") as cur:
            vocab_id = (await cur.fetchone())[0]
        await db.execute(
            "INSERT INTO word_occurrences (vocabulary_id, book_id, chapter_index, sentence_text)"
            " VALUES (?, 100, 0, 'An ephemeral moment.')",
            (vocab_id,),
        )
        await db.execute(
            "INSERT INTO flashcard_reviews (user_id, vocabulary_id, due_date) VALUES (1, ?, date('now'))",
            (vocab_id,),
        )
        await db.commit()

    res = await admin_client.delete("/api/admin/books/100")
    assert res.status_code == 200

    async with aiosqlite.connect(admin_db) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM flashcard_reviews WHERE vocabulary_id=?", (vocab_id,)
        ) as cur:
            count = (await cur.fetchone())[0]
    assert count == 0, (
        "flashcard_reviews rows must be deleted when admin deletes a book (#691); "
        "orphaned rows inflate flashcard stats for affected users"
    )


async def test_delete_book_removes_annotations(admin_client, admin_db, admin_user):
    await save_book(100, BOOK_META, BOOK_TEXT)
    await create_annotation(admin_user["id"], 100, 0, "A great line.", "The full quote.", "yellow")
    await admin_client.delete("/api/admin/books/100")
    async with aiosqlite.connect(admin_db) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM annotations WHERE book_id = 100"
        ) as cur:
            count = (await cur.fetchone())[0]
    assert count == 0


async def test_delete_book_removes_book_insights(admin_client, admin_db, admin_user):
    await save_book(100, BOOK_META, BOOK_TEXT)
    await save_insight(admin_user["id"], 100, 0, "What is the theme?", "The theme is...", None)
    await admin_client.delete("/api/admin/books/100")
    async with aiosqlite.connect(admin_db) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM book_insights WHERE book_id = 100"
        ) as cur:
            count = (await cur.fetchone())[0]
    assert count == 0


async def test_delete_book_removes_reading_progress(admin_client, admin_db, admin_user):
    await save_book(100, BOOK_META, BOOK_TEXT)
    await upsert_reading_progress(admin_user["id"], 100, 2)
    await admin_client.delete("/api/admin/books/100")
    async with aiosqlite.connect(admin_db) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM user_reading_progress WHERE book_id = 100"
        ) as cur:
            count = (await cur.fetchone())[0]
    assert count == 0


async def test_delete_book_removes_chapter_summaries(admin_client, admin_db):
    """Regression for #282: delete_book must remove cached chapter summaries.

    If summaries are left behind, a re-import of the same book_id would serve
    stale AI-generated summaries for the old chapter structure.
    """
    await save_book(100, BOOK_META, BOOK_TEXT)
    await save_chapter_summary(100, 0, "The hero's journey begins.", model="gemini-flash")
    await save_chapter_summary(100, 1, "Conflict escalates.", model="gemini-flash")

    await admin_client.delete("/api/admin/books/100")

    async with aiosqlite.connect(admin_db) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM chapter_summaries WHERE book_id = 100"
        ) as cur:
            count = (await cur.fetchone())[0]
    assert count == 0, "chapter_summaries must be removed when the book is deleted"


async def test_delete_book_removes_reading_history(admin_client, admin_db, admin_user):
    """Regression for #289: delete_book must remove reading_history rows.

    Orphaned rows would contaminate analytics for a re-imported book with the same ID.
    """
    await save_book(100, BOOK_META, BOOK_TEXT)
    await log_reading_event(admin_user["id"], 100, 0)
    await log_reading_event(admin_user["id"], 100, 1)

    await admin_client.delete("/api/admin/books/100")

    async with aiosqlite.connect(admin_db) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM reading_history WHERE book_id = 100"
        ) as cur:
            count = (await cur.fetchone())[0]
    assert count == 0, "reading_history rows must be removed when the book is deleted"


async def test_delete_book_removes_book_uploads_row(admin_client, admin_db, admin_user):
    """Regression #392: admin delete_book must remove book_uploads rows.

    SQLite FK enforcement is OFF so ON DELETE CASCADE never fires. Without an
    explicit DELETE, the orphaned book_uploads row keeps counting against the
    user's upload quota — preventing them from uploading a replacement book."""
    await save_book(100, BOOK_META, BOOK_TEXT)
    async with aiosqlite.connect(admin_db) as db:
        await db.execute(
            """INSERT INTO book_uploads (book_id, user_id, filename, file_size, format)
               VALUES (100, ?, 'test.txt', 1024, 'txt')""",
            (admin_user["id"],),
        )
        await db.commit()

    async with aiosqlite.connect(admin_db) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM book_uploads WHERE book_id=100"
        ) as cur:
            assert (await cur.fetchone())[0] == 1

    res = await admin_client.delete("/api/admin/books/100")
    assert res.status_code == 200

    async with aiosqlite.connect(admin_db) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM book_uploads WHERE book_id=100"
        ) as cur:
            count = (await cur.fetchone())[0]
    assert count == 0, (
        "book_uploads row must be deleted when admin deletes a book (#392); "
        "orphaned row inflates upload quota and blocks user from re-uploading"
    )


@pytest.mark.asyncio
async def test_delete_book_removes_vocabulary_tags(admin_client, admin_db):
    """Regression #755: delete_book must remove vocabulary_tags for words that only appeared in the deleted book.

    FK ON DELETE CASCADE on vocabulary_tags(vocabulary_id → vocabulary.id) fires when the
    orphaned vocabulary row is deleted. This test confirms the cascade (or explicit prune) fires.
    """
    await save_book(100, BOOK_META, BOOK_TEXT)
    async with aiosqlite.connect(admin_db) as db:
        await db.execute("INSERT INTO vocabulary (user_id, word) VALUES (1, 'ephemeral')")
        async with db.execute("SELECT id FROM vocabulary WHERE word='ephemeral'") as cur:
            vocab_id = (await cur.fetchone())[0]
        await db.execute(
            "INSERT INTO word_occurrences (vocabulary_id, book_id, chapter_index, sentence_text)"
            " VALUES (?, 100, 0, 'An ephemeral moment.')",
            (vocab_id,),
        )
        await db.execute(
            "INSERT INTO vocabulary_tags (user_id, vocabulary_id, tag) VALUES (1, ?, 'german')",
            (vocab_id,),
        )
        await db.commit()

    res = await admin_client.delete("/api/admin/books/100")
    assert res.status_code == 200

    async with aiosqlite.connect(admin_db) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM vocabulary_tags WHERE vocabulary_id=?", (vocab_id,)
        ) as cur:
            count = (await cur.fetchone())[0]
    assert count == 0, (
        "vocabulary_tags rows must be removed when admin deletes a book (#755); "
        "orphaned tags inflate tag lists for the user"
    )


@pytest.mark.asyncio
async def test_delete_book_removes_deck_members(admin_client, admin_db):
    """Regression #755: delete_book must remove deck_members for words that only appeared in the deleted book.

    FK ON DELETE CASCADE on deck_members(vocabulary_id → vocabulary.id) fires when the
    orphaned vocabulary row is deleted. This test confirms the cascade (or explicit prune) fires.
    """
    await save_book(100, BOOK_META, BOOK_TEXT)
    async with aiosqlite.connect(admin_db) as db:
        await db.execute("INSERT INTO vocabulary (user_id, word) VALUES (1, 'ephemeral')")
        async with db.execute("SELECT id FROM vocabulary WHERE word='ephemeral'") as cur:
            vocab_id = (await cur.fetchone())[0]
        await db.execute(
            "INSERT INTO word_occurrences (vocabulary_id, book_id, chapter_index, sentence_text)"
            " VALUES (?, 100, 0, 'An ephemeral moment.')",
            (vocab_id,),
        )
        # Create a deck and add the word to it
        await db.execute("INSERT INTO decks (user_id, name, mode) VALUES (1, 'Test Deck', 'manual')")
        async with db.execute("SELECT id FROM decks WHERE name='Test Deck'") as cur:
            deck_id = (await cur.fetchone())[0]
        await db.execute(
            "INSERT INTO deck_members (deck_id, vocabulary_id) VALUES (?, ?)",
            (deck_id, vocab_id),
        )
        await db.commit()

    res = await admin_client.delete("/api/admin/books/100")
    assert res.status_code == 200

    async with aiosqlite.connect(admin_db) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM deck_members WHERE vocabulary_id=?", (vocab_id,)
        ) as cur:
            count = (await cur.fetchone())[0]
    assert count == 0, (
        "deck_members rows must be removed when admin deletes a book (#755); "
        "orphaned members keep deleted words in flashcard decks"
    )


# ── Translations ─────────────────────────────────────────────────────────────

async def test_get_translations(admin_client, admin_db):
    await _seed_book(100)
    await save_translation(100, 0, "en", ["Hello"])
    res = await admin_client.get("/api/admin/translations")
    assert res.status_code == 200
    assert len(res.json()) >= 1


async def test_delete_book_translations(admin_client, admin_db):
    await _seed_book(100)
    await save_translation(100, 0, "en", ["Hello"])
    res = await admin_client.delete("/api/admin/translations/100")
    assert res.status_code == 200
    assert res.json()["deleted"] >= 1


async def test_delete_specific_translation(admin_client, admin_db):
    await _seed_book(100)
    await save_translation(100, 0, "en", ["Hello"])
    await save_translation(100, 0, "de", ["Hallo"])
    res = await admin_client.delete("/api/admin/translations/100/0/en")
    assert res.status_code == 200
    assert res.json()["deleted"] == 1


async def test_delete_specific_translation_not_found_returns_404(admin_client):
    """DELETE specific translation that doesn't exist must return 404, not 200."""
    res = await admin_client.delete("/api/admin/translations/99999/0/de")
    assert res.status_code == 404


async def test_delete_specific_translation_normalizes_language(admin_client, admin_db):
    """DELETE .../ZH-CN must delete a row stored under 'zh'.

    Without normalization the lookup uses 'ZH-CN' as-is and returns 404
    even though the translation exists."""
    await _seed_book(100)
    await save_translation(100, 0, "zh", ["翻译"])
    res = await admin_client.delete("/api/admin/translations/100/0/ZH-CN")
    assert res.status_code == 200
    assert res.json()["deleted"] == 1


async def test_delete_book_translations_no_translations_returns_404(admin_client):
    """DELETE /admin/translations/{book_id} with no translations must return 404.

    The sibling specific-translation endpoint already checks rowcount; bulk
    delete must be consistent."""
    res = await admin_client.delete("/api/admin/translations/99999")
    assert res.status_code == 404


async def test_delete_language_translations(admin_client, admin_db):
    """DELETE /translations/{book_id}/{lang} deletes only that language (issue #271)."""
    await _seed_book(100)
    await save_translation(100, 0, "zh", ["中文"])
    await save_translation(100, 1, "zh", ["中文2"])
    await save_translation(100, 0, "de", ["Deutsch"])
    res = await admin_client.delete("/api/admin/translations/100/zh")
    assert res.status_code == 200
    assert res.json()["deleted"] == 2
    # German translation must still exist
    remaining = await admin_client.get("/api/admin/translations")
    langs = {t["target_language"] for t in remaining.json() if t["book_id"] == 100}
    assert "zh" not in langs
    assert "de" in langs


async def test_delete_language_translations_not_found(admin_client):
    """DELETE /translations/{book_id}/{lang} with no rows returns 404 (issue #271)."""
    res = await admin_client.delete("/api/admin/translations/99999/zh")
    assert res.status_code == 404


async def test_delete_language_translations_normalizes_language(admin_client, admin_db):
    """DELETE /translations/{book_id}/{lang} normalises e.g. ZH-CN → zh (issue #271)."""
    await _seed_book(100)
    await save_translation(100, 0, "zh", ["中文"])
    res = await admin_client.delete("/api/admin/translations/100/ZH-CN")
    assert res.status_code == 200
    assert res.json()["deleted"] == 1


# ── Delete translation queue cleanup + running guard (regression #335, #338) ──

async def test_delete_specific_translation_clears_queue_row(admin_client, admin_db):
    """Regression #335: DELETE /translations/{id}/{idx}/{lang} must also remove
    non-running queue rows so enqueue() can re-add the chapter later."""
    from services.translation_queue import enqueue
    await save_book(100, BOOK_META, BOOK_TEXT)
    await save_translation(100, 0, "de", ["paragraph"])
    await enqueue(100, 0, "de")  # pending queue row
    async with aiosqlite.connect(admin_db) as db:
        await db.execute(
            "UPDATE translation_queue SET status='failed' WHERE book_id=100 AND chapter_index=0"
        )
        await db.commit()

    res = await admin_client.delete("/api/admin/translations/100/0/de")
    assert res.status_code == 200

    # After deletion, enqueue must succeed (rowcount=1), not no-op
    from services.translation_queue import enqueue as enqueue2
    added = await enqueue2(100, 0, "de")
    assert added == 1, "enqueue must return 1 after orphan queue row is cleaned up"


async def test_delete_specific_translation_rejects_409_when_running(admin_client, admin_db):
    """Regression #338: DELETE /translations/{id}/{idx}/{lang} must return 409
    when a queue worker is actively translating the chapter — the worker would
    re-insert the deleted translation via save_translation INSERT OR REPLACE."""
    from services.translation_queue import enqueue
    await save_book(100, BOOK_META, BOOK_TEXT)
    await save_translation(100, 0, "de", ["paragraph"])
    await enqueue(100, 0, "de")
    async with aiosqlite.connect(admin_db) as db:
        await db.execute(
            "UPDATE translation_queue SET status='running' WHERE book_id=100 AND chapter_index=0 AND target_language='de'"
        )
        await db.commit()

    res = await admin_client.delete("/api/admin/translations/100/0/de")
    assert res.status_code == 409
    from services.db import get_cached_translation
    assert await get_cached_translation(100, 0, "de") == ["paragraph"]


async def test_delete_language_translations_clears_queue_rows(admin_client, admin_db):
    """Regression #335: DELETE /translations/{id}/{lang} must remove non-running
    queue rows for that language so subsequent enqueue calls can proceed."""
    from services.translation_queue import enqueue
    await save_book(100, BOOK_META, BOOK_TEXT)
    await save_translation(100, 0, "zh", ["第一章"])
    await save_translation(100, 1, "zh", ["第二章"])
    await enqueue(100, 0, "zh")
    await enqueue(100, 1, "zh")
    async with aiosqlite.connect(admin_db) as db:
        await db.execute(
            "UPDATE translation_queue SET status='failed' WHERE book_id=100 AND chapter_index=1 AND target_language='zh'"
        )
        await db.commit()

    res = await admin_client.delete("/api/admin/translations/100/zh")
    assert res.status_code == 200

    from services.translation_queue import enqueue as enqueue2
    added_0 = await enqueue2(100, 0, "zh")
    added_1 = await enqueue2(100, 1, "zh")
    assert added_0 == 1, "ch0 must be re-enqueueable after cleanup"
    assert added_1 == 1, "ch1 must be re-enqueueable after cleanup"


async def test_delete_language_translations_rejects_409_when_running(admin_client, admin_db):
    """Regression #338: DELETE /translations/{id}/{lang} must return 409 when
    any queue worker is actively translating a chapter for that language."""
    from services.translation_queue import enqueue
    await save_book(100, BOOK_META, BOOK_TEXT)
    await save_translation(100, 0, "zh", ["章节0"])
    await save_translation(100, 1, "zh", ["章节1"])
    await enqueue(100, 1, "zh")
    async with aiosqlite.connect(admin_db) as db:
        await db.execute(
            "UPDATE translation_queue SET status='running' WHERE book_id=100 AND chapter_index=1 AND target_language='zh'"
        )
        await db.commit()

    res = await admin_client.delete("/api/admin/translations/100/zh")
    assert res.status_code == 409
    detail = res.json()["detail"]
    assert "1" in detail  # blocked chapter index mentioned
    from services.db import get_cached_translation
    assert await get_cached_translation(100, 0, "zh") == ["章节0"]


async def test_delete_book_translations_clears_queue_rows(admin_client, admin_db):
    """Regression #335: DELETE /translations/{id} must remove non-running queue
    rows for all languages so subsequent enqueue calls can proceed."""
    from services.translation_queue import enqueue
    await save_book(100, BOOK_META, BOOK_TEXT)
    await save_translation(100, 0, "de", ["paragraph"])
    await save_translation(100, 0, "zh", ["第一章"])
    await enqueue(100, 0, "de")
    await enqueue(100, 0, "zh")

    res = await admin_client.delete("/api/admin/translations/100")
    assert res.status_code == 200

    from services.translation_queue import enqueue as enqueue2
    added_de = await enqueue2(100, 0, "de")
    added_zh = await enqueue2(100, 0, "zh")
    assert added_de == 1, "de must be re-enqueueable after full book translation delete"
    assert added_zh == 1, "zh must be re-enqueueable after full book translation delete"


async def test_delete_book_translations_rejects_409_when_running(admin_client, admin_db):
    """Regression #338: DELETE /translations/{id} must return 409 when any
    queue worker is actively translating any chapter of the book."""
    from services.translation_queue import enqueue
    await save_book(100, BOOK_META, BOOK_TEXT)
    await save_translation(100, 0, "de", ["paragraph"])
    await enqueue(100, 0, "de")
    async with aiosqlite.connect(admin_db) as db:
        await db.execute(
            "UPDATE translation_queue SET status='running' WHERE book_id=100"
        )
        await db.commit()

    res = await admin_client.delete("/api/admin/translations/100")
    assert res.status_code == 409
    from services.db import get_cached_translation
    assert await get_cached_translation(100, 0, "de") == ["paragraph"]


# ── Audio ────────────────────────────────────────────────────────────────────

async def _insert_audio(db_path: str, book_id: int, chapter_index: int, chunk_index: int = 0):
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "INSERT OR REPLACE INTO audio_cache "
            "(book_id, chapter_index, chunk_index, provider, voice, content_type, audio) "
            "VALUES (?, ?, ?, 'tts', 'en-US', 'audio/mpeg', ?)",
            (book_id, chapter_index, chunk_index, b"audio-data"),
        )
        await db.commit()


async def test_get_audio_empty(admin_client, admin_db):
    res = await admin_client.get("/api/admin/audio")
    assert res.status_code == 200
    assert res.json() == []


async def test_get_audio_returns_cached_entries(admin_client, admin_db):
    """GET /admin/audio must return rows from audio_cache, not a hard-coded empty list (#455)."""
    await _seed_book(10)
    await _seed_book(20)
    await _insert_audio(admin_db, book_id=10, chapter_index=0)
    await _insert_audio(admin_db, book_id=10, chapter_index=1)
    await _insert_audio(admin_db, book_id=20, chapter_index=0)
    res = await admin_client.get("/api/admin/audio")
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 3, f"Expected at least 3 audio rows, got {len(data)}: {data}"


async def test_delete_book_audio(admin_client, admin_db):
    res = await admin_client.delete("/api/admin/audio/999")
    assert res.status_code == 200
    assert res.json()["deleted"] == 0


async def test_delete_book_audio_removes_rows(admin_client, admin_db):
    """DELETE /admin/audio/{book_id} must actually delete rows from audio_cache (#455)."""
    await _seed_book(77)
    await _seed_book(99)
    await _insert_audio(admin_db, book_id=77, chapter_index=0)
    await _insert_audio(admin_db, book_id=77, chapter_index=1)
    await _insert_audio(admin_db, book_id=99, chapter_index=0)

    res = await admin_client.delete("/api/admin/audio/77")
    assert res.status_code == 200
    assert res.json()["deleted"] == 2, f"Expected 2 deleted, got: {res.json()}"

    # Book 99 audio must be unaffected
    async with aiosqlite.connect(admin_db) as db:
        async with db.execute("SELECT COUNT(*) FROM audio_cache WHERE book_id=99") as cur:
            count = (await cur.fetchone())[0]
    assert count == 1, "audio for book 99 was incorrectly deleted"


async def test_delete_chapter_audio_removes_rows(admin_client, admin_db):
    """DELETE /admin/audio/{book_id}/{chapter_index} must delete only that chapter's rows (#455)."""
    await _seed_book(55)
    await _insert_audio(admin_db, book_id=55, chapter_index=0, chunk_index=0)
    await _insert_audio(admin_db, book_id=55, chapter_index=0, chunk_index=1)
    await _insert_audio(admin_db, book_id=55, chapter_index=1, chunk_index=0)

    res = await admin_client.delete("/api/admin/audio/55/0")
    assert res.status_code == 200
    assert res.json()["deleted"] == 2, f"Expected 2 deleted, got: {res.json()}"

    # Chapter 1 must be unaffected
    async with aiosqlite.connect(admin_db) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM audio_cache WHERE book_id=55 AND chapter_index=1"
        ) as cur:
            count = (await cur.fetchone())[0]
    assert count == 1, "audio for chapter 1 was incorrectly deleted"


# ── Stats ────────────────────────────────────────────────────────────────────

async def test_stats(admin_client, admin_db):
    res = await admin_client.get("/api/admin/stats")
    assert res.status_code == 200
    data = res.json()
    assert "users_total" in data
    assert "books_cached" in data
    assert "translations_cached" in data
    assert data["users_total"] >= 1


async def test_stats_includes_audio_fields(admin_client, admin_db):
    """Regression for #269: stats endpoint must return audio_chunks_cached and audio_cache_mb."""
    res = await admin_client.get("/api/admin/stats")
    assert res.status_code == 200
    data = res.json()
    assert "audio_chunks_cached" in data, "audio_chunks_cached missing from /admin/stats"
    assert "audio_cache_mb" in data, "audio_cache_mb missing from /admin/stats"
    assert isinstance(data["audio_chunks_cached"], int)
    assert isinstance(data["audio_cache_mb"], (int, float))


# ── Retranslate ──────────────────────────────────────────────────────────────

async def test_retranslate_creates_new_translation(admin_client, admin_user):
    await save_book(100, BOOK_META, BOOK_TEXT)
    await save_translation(100, 0, "en", ["Old stale translation."])

    with patch(
        "routers.admin.do_translate",
        new_callable=AsyncMock,
        return_value=["Fresh paragraph one.", "Fresh paragraph two."],
    ) as mock_translate:
        res = await admin_client.post("/api/admin/translations/100/0/en/retranslate")

    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["paragraphs_count"] == 2
    mock_translate.assert_awaited_once()


async def test_retranslate_book_not_found(admin_client):
    res = await admin_client.post("/api/admin/translations/999/0/en/retranslate")
    assert res.status_code == 404


async def test_retranslate_chapter_out_of_range(admin_client):
    await save_book(100, BOOK_META, BOOK_TEXT)
    res = await admin_client.post("/api/admin/translations/100/99/en/retranslate")
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_retranslate_returns_502_when_both_gemini_and_google_fail(admin_user, admin_client, admin_db):
    """Regression #1010: single-chapter retranslate must return 502 (not 500) when
    both the Gemini provider and the Google fallback raise."""
    from services.auth import encrypt_api_key
    from services.db import set_user_gemini_key
    await set_user_gemini_key(admin_user["id"], encrypt_api_key("fake-api-key"))
    await save_book(100, BOOK_META, BOOK_TEXT)

    async def _always_fail(text, src, tgt, *, provider="google", gemini_key=None):
        raise RuntimeError("simulated translation failure")

    with patch("routers.admin.do_translate", side_effect=_always_fail):
        res = await admin_client.post(
            "/api/admin/translations/100/0/de/retranslate",
        )

    assert res.status_code == 502, (
        f"Expected 502 when both providers fail, got {res.status_code}: {res.text}"
    )


async def test_retranslate_non_admin_forbidden(admin_db, admin_user):
    user2 = await get_or_create_user(
        google_id="user2", email="user2@example.com", name="User 2", picture=""
    )
    await set_user_approved(user2["id"], True)

    async def _override():
        return await get_user_by_id(user2["id"])

    app.dependency_overrides[get_current_user] = _override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        res = await c.post("/api/admin/translations/100/0/en/retranslate")
    app.dependency_overrides.clear()

    assert res.status_code == 403


# ── Auth / pending user ──────────────────────────────────────────────────────

async def test_unapproved_user_blocked_on_api(admin_db, admin_user):
    user2 = await get_or_create_user(
        google_id="pending-user", email="pending@example.com", name="Pending", picture=""
    )
    token = create_jwt(user2["id"], user2["email"])
    headers = {"Authorization": f"Bearer {token}"}

    app.dependency_overrides.clear()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        res = await c.post("/api/ai/translate", headers=headers,
                           json={"text": "hello", "source_language": "en", "target_language": "de"})
        assert res.status_code == 403

        res = await c.get("/api/user/me", headers=headers)
        assert res.status_code == 200
        assert res.json()["approved"] is False


# ── Seed popular books SSE ──────────────────────────────────────────────────

def _parse_sse(body: str) -> list[dict]:
    import json as _json
    events = []
    for block in body.strip().split("\n\n"):
        event = None
        data = None
        for line in block.splitlines():
            if line.startswith("event:"):
                event = line.removeprefix("event:").strip()
            elif line.startswith("data:"):
                data = _json.loads(line.removeprefix("data:").strip())
        if event and data is not None:
            events.append({"event": event, **data})
    return events


async def test_seed_popular_skips_already_cached(admin_client, admin_db, monkeypatch, tmp_path):
    """A manifest entry whose book is already in the DB is counted as cached,
    not re-downloaded. Verifies the polling-based seed job."""
    import json as _json
    import asyncio
    from services.seed_popular import manager as seed_manager, SeedPopularManager

    # Fresh manager so tests don't share state
    monkeypatch.setattr("services.seed_popular._manager", SeedPopularManager())

    manifest = [{
        "id": 100, "title": "Test Book",
        "authors": ["Author"], "languages": ["en"],
        "download_count": 100, "cover": "",
    }]
    manifest_path = tmp_path / "popular_books.json"
    manifest_path.write_text(_json.dumps(manifest))
    import os as _os
    original_join = _os.path.join
    def _fake_join(*parts):
        joined = original_join(*parts)
        if joined.endswith("popular_books.json"):
            return str(manifest_path)
        return joined
    monkeypatch.setattr(_os.path, "join", _fake_join)

    await save_book(100, manifest[0], "Some text")

    with patch("services.seed_popular.get_book_meta") as m_meta, \
         patch("services.seed_popular.get_book_text") as m_text:
        res = await admin_client.post("/api/admin/books/seed-popular/start")
        assert res.status_code == 200

        # Wait for the background task to complete
        mgr = __import__("services.seed_popular", fromlist=["manager"]).manager()
        while mgr.is_running():
            await asyncio.sleep(0.01)

        status = await admin_client.get("/api/admin/books/seed-popular/status")
        body = status.json()
        assert body["state"]["status"] == "completed"
        assert body["state"]["already_cached"] == 1
        assert body["state"]["total"] == 0
        m_meta.assert_not_called()
        m_text.assert_not_called()


async def test_seed_popular_downloads_missing_books(admin_client, admin_db, monkeypatch, tmp_path):
    """A manifest entry whose book isn't cached triggers download + save."""
    import json as _json
    import asyncio
    from services.seed_popular import SeedPopularManager
    monkeypatch.setattr("services.seed_popular._manager", SeedPopularManager())

    manifest = [{
        "id": 101, "title": "New Book",
        "authors": ["Author"], "languages": ["en"],
        "download_count": 50, "cover": "",
    }]
    manifest_path = tmp_path / "popular_books.json"
    manifest_path.write_text(_json.dumps(manifest))
    import os as _os
    original_join = _os.path.join
    def _fake_join(*parts):
        joined = original_join(*parts)
        if joined.endswith("popular_books.json"):
            return str(manifest_path)
        return joined
    monkeypatch.setattr(_os.path, "join", _fake_join)

    meta_mock = AsyncMock(return_value={**manifest[0], "subjects": []})
    text_mock = AsyncMock(return_value="Book text " * 50)
    with patch("services.seed_popular.get_book_meta", meta_mock), \
         patch("services.seed_popular.get_book_text", text_mock):
        res = await admin_client.post("/api/admin/books/seed-popular/start")
        assert res.status_code == 200

        mgr = __import__("services.seed_popular", fromlist=["manager"]).manager()
        while mgr.is_running():
            await asyncio.sleep(0.01)

        status = await admin_client.get("/api/admin/books/seed-popular/status")
        body = status.json()
        assert body["state"]["status"] == "completed"
        assert body["state"]["downloaded"] == 1
        assert body["state"]["failed"] == 0

    from services.db import get_cached_book
    cached = await get_cached_book(101)
    assert cached is not None
    assert cached["title"] == "New Book"


async def test_seed_popular_refuses_concurrent_start(admin_client, admin_db, monkeypatch, tmp_path):
    """Second start while one is running returns 409."""
    import json as _json
    import asyncio
    from services.seed_popular import SeedPopularManager
    monkeypatch.setattr("services.seed_popular._manager", SeedPopularManager())

    manifest = [{"id": 102, "title": "X", "authors": [], "languages": ["en"],
                 "download_count": 1, "cover": ""}]
    manifest_path = tmp_path / "popular_books.json"
    manifest_path.write_text(_json.dumps(manifest))
    import os as _os
    original_join = _os.path.join
    monkeypatch.setattr(
        _os.path, "join",
        lambda *p: str(manifest_path) if original_join(*p).endswith("popular_books.json") else original_join(*p),
    )

    # Make the job slow by mocking get_book_meta to sleep
    async def slow_meta(book_id):
        await asyncio.sleep(1)
        return {"id": book_id, "title": "X", "authors": [], "languages": ["en"],
                "subjects": [], "download_count": 1, "cover": ""}
    async def fake_text(book_id):
        return "text"

    with patch("services.seed_popular.get_book_meta", slow_meta), \
         patch("services.seed_popular.get_book_text", fake_text):
        res1 = await admin_client.post("/api/admin/books/seed-popular/start")
        assert res1.status_code == 200

        res2 = await admin_client.post("/api/admin/books/seed-popular/start")
        assert res2.status_code == 409

        # Clean up — stop the job
        await admin_client.post("/api/admin/books/seed-popular/stop")


async def test_delete_queue_item_not_found_returns_404(admin_client):
    """DELETE /admin/queue/items/{id} for a non-existent item must return 404."""
    res = await admin_client.delete("/api/admin/queue/items/99999")
    assert res.status_code == 404


async def test_delete_running_queue_item_returns_409(admin_client, admin_db):
    """Regression #296: deleting a running item must be rejected (409), not silently accepted.

    Without this guard the queue row is removed but the worker continues
    writing the translation, so the admin's cancellation intent is silently ignored.
    """
    await _seed_book(999)
    async with aiosqlite.connect(admin_db) as db:
        cursor = await db.execute(
            """INSERT INTO translation_queue
               (book_id, chapter_index, target_language, status, priority)
               VALUES (999, 0, 'de', 'running', 100)""",
        )
        item_id = cursor.lastrowid
        await db.commit()

    res = await admin_client.delete(f"/api/admin/queue/items/{item_id}")
    assert res.status_code == 409, (
        "Deleting a running queue item must return 409 Conflict, not 200"
    )


async def test_retry_queue_item_not_found_returns_404(admin_client):
    """POST /admin/queue/items/{id}/retry for a non-existent item must return 404."""
    res = await admin_client.post("/api/admin/queue/items/99999/retry")
    assert res.status_code == 404


async def test_retry_running_item_returns_409(admin_client, admin_db):
    """Regression #294: retrying a running item must be rejected (409), not silently accepted.

    If the endpoint resets status='pending' while the worker holds the row as
    'running', _mark_done() will DELETE the newly-re-enqueued row when the
    translation finishes — the retry is silently lost.
    """
    await _seed_book(999)
    async with aiosqlite.connect(admin_db) as db:
        cursor = await db.execute(
            """INSERT INTO translation_queue
               (book_id, chapter_index, target_language, status, priority)
               VALUES (999, 0, 'de', 'running', 100)""",
        )
        item_id = cursor.lastrowid
        await db.commit()

    res = await admin_client.post(f"/api/admin/queue/items/{item_id}/retry")
    assert res.status_code == 409, (
        "Retrying a running queue item must return 409 Conflict, not 200"
    )


async def test_enqueue_book_nonexistent_returns_404(admin_client):
    """POST /admin/queue/enqueue-book for a non-existent book must return 404.

    Without this check enqueue_for_book returns 0 (no chapters to enqueue)
    and the endpoint silently returns 200 with enqueued=0."""
    res = await admin_client.post("/api/admin/queue/enqueue-book", json={
        "book_id": 99999,
        "target_languages": ["de"],
    })
    assert res.status_code == 404


async def test_enqueue_draft_book_returns_400(admin_client, admin_db):
    """Regression #486: enqueuing an unconfirmed uploaded book must return 400.

    Before the fix the endpoint returned 200 with enqueued=0, giving
    the admin no indication that the book hadn't been confirmed yet.
    """
    import aiosqlite
    async with aiosqlite.connect(admin_db) as db:
        cur = await db.execute(
            """INSERT INTO books (title, authors, languages, subjects, download_count,
                                  cover, text, images, source, owner_user_id)
               VALUES ('Draft', '[]', '[]', '[]', 0, '', '', '[]', 'upload', 1)"""
        )
        book_id = cur.lastrowid
        await db.execute(
            "INSERT INTO user_book_chapters (book_id, chapter_index, title, text, is_draft) "
            "VALUES (?, 0, 'Ch 1', ?, 1)",
            (book_id, "word " * 300),
        )
        await db.commit()

    res = await admin_client.post("/api/admin/queue/enqueue-book", json={
        "book_id": book_id,
        "target_languages": ["de"],
    })
    assert res.status_code == 400, (
        f"Expected 400 for draft book, got {res.status_code}: {res.text}"
    )
    assert "draft" in res.json()["detail"].lower() or "confirm" in res.json()["detail"].lower()


# ── Retry-failed bulk endpoint ───────────────────────────────────────────────

async def _seed_failed(book_id: int, chapter_index: int, target_language: str):
    """Helper: insert a failed queue row for retry-failed tests.

    translation_queue.book_id carries a declared FK to books(id) (migration
    034, #754 PR 4/4), so seed the parent book first with source='upload'
    (keeps it out of list_cached_books counts)."""
    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        await conn.execute(
            "INSERT OR IGNORE INTO books (id, title, images, source) "
            "VALUES (?, 'T', '[]', 'upload')",
            (book_id,),
        )
        await conn.execute(
            """INSERT INTO translation_queue
                   (book_id, chapter_index, target_language, priority,
                    status, attempts, last_error)
               VALUES (?, ?, ?, ?, 'failed', 3, 'boom')""",
            (book_id, chapter_index, target_language, 100),
        )
        await conn.commit()


async def test_admin_retry_failed_by_book_and_lang(admin_client, admin_db):
    """POST /admin/queue/retry-failed with {book_id, target_language}
    revives only failed rows matching both filters — other failed rows
    stay failed."""
    await _seed_failed(100, 0, "zh")
    await _seed_failed(100, 1, "zh")
    await _seed_failed(100, 0, "fr")   # different language
    await _seed_failed(200, 0, "zh")   # different book

    res = await admin_client.post(
        "/api/admin/queue/retry-failed",
        json={"book_id": 100, "target_language": "zh"},
    )
    assert res.status_code == 200
    assert res.json()["updated"] == 2

    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        async with conn.execute(
            "SELECT book_id, chapter_index, target_language, status, attempts "
            "FROM translation_queue ORDER BY book_id, chapter_index, target_language",
        ) as cursor:
            rows = [dict(r) for r in await cursor.fetchall()]

    by_key = {
        (r["book_id"], r["chapter_index"], r["target_language"]): r for r in rows
    }
    # Matched rows reset.
    assert by_key[(100, 0, "zh")]["status"] == "pending"
    assert by_key[(100, 0, "zh")]["attempts"] == 0
    assert by_key[(100, 1, "zh")]["status"] == "pending"
    # Non-matching stay failed.
    assert by_key[(100, 0, "fr")]["status"] == "failed"
    assert by_key[(200, 0, "zh")]["status"] == "failed"


# The short BOOK_TEXT above collapses to a single chapter under the
# splitter's minimum-length heuristic. Move tests need ≥2 real chapters
# so the "new_chapter_index" range check has room to exercise both
# success and out-of-range paths.
MOVE_BOOK_TEXT = (
    "CHAPTER I\n\n" + ("Paragraph one. " * 40) + "\n\n"
    + ("Paragraph two. " * 40) + "\n\n"
    + "CHAPTER II\n\n" + ("Paragraph three. " * 40) + "\n\n"
    + ("Paragraph four. " * 40) + "\n\n"
    + "CHAPTER III\n\n" + ("Paragraph five. " * 40) + "\n\n"
    + ("Paragraph six. " * 40)
)


async def test_import_translations_inserts_rows(admin_client, admin_db):
    """POST /admin/translations/import writes pre-translated chapters into
    the cache without going through Gemini. Companion to the offline
    translate_book.py script used to seed prod from a dev-side run."""
    await save_book(100, BOOK_META, BOOK_TEXT)
    res = await admin_client.post(
        "/api/admin/translations/import",
        json={
            "entries": [
                {
                    "book_id": 100,
                    "chapter_index": 0,
                    "target_language": "zh",
                    "paragraphs": ["第一段。", "第二段。"],
                    "provider": "gemini",
                    "model": "gemini-2.5-flash",
                },
            ],
        },
    )
    assert res.status_code == 200, res.text
    assert res.json() == {"ok": True, "imported": 1}

    from services.db import get_cached_translation
    cached = await get_cached_translation(100, 0, "zh")
    assert cached == ["第一段。", "第二段。"]


async def test_import_translations_skips_empty_paragraphs(admin_client, admin_db):
    """Empty paragraph arrays are skipped — seeding shouldn't clobber an
    existing translation with an empty placeholder if the export has a
    chapter where translation failed."""
    await save_book(100, BOOK_META, BOOK_TEXT)
    await save_translation(100, 0, "zh", ["existing"])
    res = await admin_client.post(
        "/api/admin/translations/import",
        json={
            "entries": [
                {
                    "book_id": 100,
                    "chapter_index": 0,
                    "target_language": "zh",
                    "paragraphs": [],  # empty — skip
                },
            ],
        },
    )
    assert res.status_code == 200
    assert res.json()["imported"] == 0
    from services.db import get_cached_translation
    assert await get_cached_translation(100, 0, "zh") == ["existing"]


async def test_import_translations_overwrites_existing(admin_client, admin_db):
    """Non-empty imports DO overwrite — the whole point of seeding is
    often to replace bad translations with fresh ones."""
    await save_book(100, BOOK_META, BOOK_TEXT)
    await save_translation(100, 0, "zh", ["old translation"])
    res = await admin_client.post(
        "/api/admin/translations/import",
        json={
            "entries": [
                {
                    "book_id": 100,
                    "chapter_index": 0,
                    "target_language": "zh",
                    "paragraphs": ["new translation"],
                },
            ],
        },
    )
    assert res.status_code == 200
    from services.db import get_cached_translation
    assert await get_cached_translation(100, 0, "zh") == ["new translation"]


async def test_import_translations_requires_admin(admin_db, admin_user):
    user2 = await get_or_create_user(
        google_id="user2", email="u2@test.com", name="U2", picture="",
    )
    await set_user_approved(user2["id"], True)

    async def _override():
        return await get_user_by_id(user2["id"])

    app.dependency_overrides[get_current_user] = _override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        res = await c.post(
            "/api/admin/translations/import",
            json={"entries": []},
        )
    app.dependency_overrides.clear()
    assert res.status_code == 403


async def test_import_translations_rejects_nonexistent_book(admin_client, admin_db):
    """POST /admin/translations/import must return 404 when any entry references a
    non-existent book_id.

    SQLite FK enforcement is OFF, so save_translation would otherwise silently
    create orphaned rows referencing a non-existent book."""
    res = await admin_client.post(
        "/api/admin/translations/import",
        json={
            "entries": [
                {
                    "book_id": 777777,
                    "chapter_index": 0,
                    "target_language": "zh",
                    "paragraphs": ["Translated text."],
                },
            ],
        },
    )
    assert res.status_code == 404


async def test_import_translations_rejects_409_when_chapter_is_running(admin_client, admin_db):
    """Regression #395: POST /admin/translations/import must return 409 when
    any of the imported chapters has a queue worker currently running.

    Without this guard: admin imports a pre-translated chapter → save_translation
    (INSERT OR REPLACE) writes the imported data → worker finishes → worker's
    INSERT OR REPLACE silently overwrites the admin's import.

    Same race as retranslate (#334) and PUT /ai/translate/cache (#341)."""
    from services.translation_queue import enqueue
    from services.db import get_cached_translation
    await save_book(100, BOOK_META, BOOK_TEXT)
    await save_translation(100, 0, "de", ["old translation"])
    await enqueue(100, 0, "de")
    async with aiosqlite.connect(admin_db) as db:
        await db.execute(
            "UPDATE translation_queue SET status='running' "
            "WHERE book_id=100 AND chapter_index=0 AND target_language='de'"
        )
        await db.commit()

    res = await admin_client.post(
        "/api/admin/translations/import",
        json={
            "entries": [{
                "book_id": 100,
                "chapter_index": 0,
                "target_language": "de",
                "paragraphs": ["imported translation"],
            }],
        },
    )
    assert res.status_code == 409, (
        f"Expected 409 when worker is running, got {res.status_code}: {res.text}"
    )

    # The old translation must still be in place (import was rejected)
    assert await get_cached_translation(100, 0, "de") == ["old translation"], (
        "Existing translation must be untouched when 409 guard fires"
    )


async def test_move_translation_shifts_chapter_index(admin_client, admin_db):
    """POST /admin/translations/{id}/{idx}/{lang}/move reassigns an existing
    cached translation to a different chapter_index without retranslating.
    Used to rescue stale translations after a splitter change."""
    await save_book(100, BOOK_META, MOVE_BOOK_TEXT)
    await save_translation(100, 1, "en", ["Old chapter 2 text."])
    res = await admin_client.post(
        "/api/admin/translations/100/1/en/move",
        json={"new_chapter_index": 0},
    )
    assert res.status_code == 200, res.text
    assert res.json() == {"ok": True, "from": 1, "to": 0}

    from services.db import get_cached_translation
    assert await get_cached_translation(100, 0, "en") == ["Old chapter 2 text."]
    assert await get_cached_translation(100, 1, "en") is None


async def test_move_translation_rejects_when_target_occupied(admin_client, admin_db):
    """Target collision returns 409 so the admin can't silently overwrite
    a translation they meant to keep."""
    await save_book(100, BOOK_META, MOVE_BOOK_TEXT)
    await save_translation(100, 0, "en", ["First."])
    await save_translation(100, 1, "en", ["Second."])
    res = await admin_client.post(
        "/api/admin/translations/100/1/en/move",
        json={"new_chapter_index": 0},
    )
    assert res.status_code == 409

    from services.db import get_cached_translation
    assert await get_cached_translation(100, 0, "en") == ["First."]
    assert await get_cached_translation(100, 1, "en") == ["Second."]


async def test_move_translation_rejects_out_of_range(admin_client, admin_db):
    await save_book(100, BOOK_META, MOVE_BOOK_TEXT)
    await save_translation(100, 0, "en", ["First."])
    res = await admin_client.post(
        "/api/admin/translations/100/0/en/move",
        json={"new_chapter_index": 99},
    )
    assert res.status_code == 400


async def test_move_translation_404_when_source_missing(admin_client, admin_db):
    await save_book(100, BOOK_META, MOVE_BOOK_TEXT)
    res = await admin_client.post(
        "/api/admin/translations/100/0/en/move",
        json={"new_chapter_index": 1},
    )
    assert res.status_code == 404


async def test_move_translation_clears_queue_at_destination(admin_client, admin_db):
    """If a queue row exists at the destination (pending/failed/whatever),
    it would later cause the worker to translate over the moved row.
    The move must clean it up."""
    await save_book(100, BOOK_META, MOVE_BOOK_TEXT)
    await save_translation(100, 1, "en", ["From slot 1."])
    await _seed_failed(100, 0, "en")

    res = await admin_client.post(
        "/api/admin/translations/100/1/en/move",
        json={"new_chapter_index": 0},
    )
    assert res.status_code == 200

    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        async with conn.execute(
            "SELECT COUNT(*) FROM translation_queue "
            "WHERE book_id=100 AND chapter_index=0 AND target_language='en'",
        ) as cursor:
            (count,) = await cursor.fetchone()
    assert count == 0


async def test_move_translation_rejects_when_destination_is_running(admin_client, admin_db):
    """Regression #328: move must return 409 if the destination chapter's queue
    row is running — otherwise the worker overwrites the admin-moved translation."""
    await save_book(100, BOOK_META, MOVE_BOOK_TEXT)
    await save_translation(100, 1, "en", ["From slot 1."])
    # Seed a running row at the destination
    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        await conn.execute(
            """INSERT INTO translation_queue
                   (book_id, chapter_index, target_language, priority, status)
               VALUES (100, 0, 'en', 100, 'running')""",
        )
        await conn.commit()

    res = await admin_client.post(
        "/api/admin/translations/100/1/en/move",
        json={"new_chapter_index": 0},
    )
    assert res.status_code == 409
    # Running row must still be in the queue (not deleted)
    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        async with conn.execute(
            "SELECT status FROM translation_queue "
            "WHERE book_id=100 AND chapter_index=0 AND target_language='en'",
        ) as cursor:
            row = await cursor.fetchone()
    assert row is not None
    assert row[0] == "running"


async def test_admin_retry_failed_without_filters_retries_all(admin_client, admin_db):
    await _seed_failed(100, 0, "zh")
    await _seed_failed(200, 0, "fr")

    res = await admin_client.post("/api/admin/queue/retry-failed", json={})
    assert res.status_code == 200
    assert res.json()["updated"] == 2

    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        async with conn.execute(
            "SELECT COUNT(*) FROM translation_queue WHERE status='failed'",
        ) as cursor:
            (count,) = await cursor.fetchone()
    assert count == 0


# ── Language normalization in admin translation endpoints ─────────────────────

async def test_queue_settings_normalizes_auto_translate_languages(admin_client, admin_db):
    """PUT /admin/queue/settings must normalize auto_translate_languages so
    'ZH-CN' is stored and returned as 'zh'. Unnormalized stored values would
    show 'ZH-CN' in the admin UI while the queue uses 'zh', confusing admins."""
    res = await admin_client.put(
        "/api/admin/queue/settings",
        json={"auto_translate_languages": ["ZH-CN", "EN"]},
    )
    assert res.status_code == 200

    get_res = await admin_client.get("/api/admin/queue/settings")
    assert get_res.status_code == 200
    langs = get_res.json()["auto_translate_languages"]
    assert "zh" in langs, f"Expected 'zh' in {langs}, got unnormalized 'ZH-CN'"
    assert "ZH-CN" not in langs
    assert "en" in langs
    assert "EN" not in langs


async def test_retranslate_normalizes_language(admin_client, admin_db):
    """POST /admin/translations/{id}/{idx}/ZH-CN/retranslate must treat
    'ZH-CN' the same as 'zh' so the saved translation is found by readers."""
    await save_book(100, BOOK_META, BOOK_TEXT)
    with patch(
        "routers.admin.do_translate",
        new_callable=AsyncMock,
        return_value=["第一段。"],
    ):
        res = await admin_client.post("/api/admin/translations/100/0/ZH-CN/retranslate")
    assert res.status_code == 200

    from services.db import get_cached_translation
    assert await get_cached_translation(100, 0, "zh") == ["第一段。"]


async def test_retranslate_all_normalizes_language(admin_client, admin_db):
    """POST /admin/translations/{id}/retranslate-all with target_language='ZH-CN'
    must save translations under 'zh', not 'ZH-CN'."""
    await save_book(100, BOOK_META, BOOK_TEXT)
    with patch(
        "routers.admin.do_translate",
        new_callable=AsyncMock,
        return_value=["第一段。"],
    ):
        res = await admin_client.post(
            "/api/admin/translations/100/retranslate-all",
            json={"target_language": "ZH-CN"},
        )
    assert res.status_code == 200

    from services.db import get_cached_translation
    assert await get_cached_translation(100, 0, "zh") == ["第一段。"]


async def test_move_translation_normalizes_language(admin_client, admin_db):
    """POST /admin/translations/{id}/{idx}/ZH-CN/move must find translations
    stored under the normalized key 'zh'."""
    await save_book(100, BOOK_META, MOVE_BOOK_TEXT)
    await save_translation(100, 1, "zh", ["Chapter two in Chinese."])
    res = await admin_client.post(
        "/api/admin/translations/100/1/ZH-CN/move",
        json={"new_chapter_index": 0},
    )
    assert res.status_code == 200

    from services.db import get_cached_translation
    assert await get_cached_translation(100, 0, "zh") == ["Chapter two in Chinese."]
    assert await get_cached_translation(100, 1, "zh") is None


async def test_import_translations_normalizes_language(admin_client, admin_db):
    """POST /admin/translations/import with target_language='ZH-CN' must
    store the row under 'zh' so GET /ai/translate/cache?target_language=zh hits it."""
    await save_book(100, BOOK_META, BOOK_TEXT)
    res = await admin_client.post(
        "/api/admin/translations/import",
        json={
            "entries": [{
                "book_id": 100,
                "chapter_index": 0,
                "target_language": "ZH-CN",
                "paragraphs": ["第一段。"],
            }],
        },
    )
    assert res.status_code == 200

    from services.db import get_cached_translation
    assert await get_cached_translation(100, 0, "zh") == ["第一段。"]
    assert await get_cached_translation(100, 0, "ZH-CN") is None


async def test_queue_delete_book_normalizes_language(admin_client, admin_db):
    """DELETE /admin/queue/book/{id}?target_language=ZH-CN must delete rows
    stored under 'zh'."""
    await _seed_failed(100, 0, "zh")
    res = await admin_client.delete(
        "/api/admin/queue/book/100?target_language=ZH-CN"
    )
    assert res.status_code == 200
    assert res.json()["deleted"] == 1

    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        async with conn.execute(
            "SELECT COUNT(*) FROM translation_queue WHERE book_id=100"
        ) as cursor:
            (count,) = await cursor.fetchone()
    assert count == 0


async def test_queue_retry_failed_normalizes_language(admin_client, admin_db):
    """POST /admin/queue/retry-failed with target_language='ZH-CN' must
    revive rows stored under 'zh'."""
    await _seed_failed(100, 0, "zh")
    res = await admin_client.post(
        "/api/admin/queue/retry-failed",
        json={"target_language": "ZH-CN"},
    )
    assert res.status_code == 200
    assert res.json()["updated"] == 1

    async with aiosqlite.connect(db_module.DB_PATH) as conn:
        async with conn.execute(
            "SELECT status FROM translation_queue WHERE book_id=100 AND target_language='zh'",
        ) as cursor:
            row = await cursor.fetchone()
    assert row is not None and row[0] == "pending"


async def test_delete_book_removes_orphaned_vocabulary(admin_client, admin_db, admin_user):
    """Vocab entries whose only occurrences were in the deleted book must be
    removed; a word shared with another book must survive."""
    await save_book(100, BOOK_META, BOOK_TEXT)
    await save_book(
        200,
        {**BOOK_META, "id": 200, "title": "Second Book"},
        BOOK_TEXT,
    )

    with patch("services.db._update_lemma", new_callable=AsyncMock):
        # "orphan" only appears in book 100
        await save_word(admin_user["id"], "orphan", 100, 0, "An orphan word.")
        # "shared" appears in both books
        await save_word(admin_user["id"], "shared", 100, 0, "A shared word in book 100.")
        await save_word(admin_user["id"], "shared", 200, 0, "A shared word in book 200.")

    vocab_before = await get_vocabulary(admin_user["id"])
    words_before = {v["word"] for v in vocab_before}
    assert "orphan" in words_before
    assert "shared" in words_before

    res = await admin_client.delete("/api/admin/books/100")
    assert res.status_code == 200

    vocab_after = await get_vocabulary(admin_user["id"])
    words_after = {v["word"] for v in vocab_after}

    # Orphaned word (only in deleted book) must be gone
    assert "orphan" not in words_after, "orphaned vocab entry survived delete_book"
    # Shared word (also in book 200) must survive
    assert "shared" in words_after


# ── Retranslate running-row guard ─────────────────────────────────────────────

async def test_retranslate_rejects_409_when_chapter_is_running(admin_client, admin_db):
    """Regression #333: retranslate must reject 409 when a queue worker is
    actively translating the same chapter, to prevent the worker from
    overwriting the admin's fresh result when it finishes."""
    from services.translation_queue import enqueue
    await save_book(100, BOOK_META, BOOK_TEXT)
    await save_translation(100, 0, "de", ["Old translation."])
    await enqueue(100, 0, "de")
    async with aiosqlite.connect(admin_db) as db:
        await db.execute(
            "UPDATE translation_queue SET status='running' WHERE book_id=100 AND chapter_index=0",
        )
        await db.commit()

    with patch("routers.admin.do_translate", new_callable=AsyncMock, return_value=["New."]):
        res = await admin_client.post("/api/admin/translations/100/0/de/retranslate")

    assert res.status_code == 409
    # Existing translation must be untouched
    from services.db import get_cached_translation
    assert await get_cached_translation(100, 0, "de") == ["Old translation."]


async def test_retranslate_all_rejects_409_when_any_chapter_is_running(admin_client, admin_db):
    """Regression #333: retranslate-all must reject 409 before translating
    any chapter if a running queue row exists for one of them."""
    from services.translation_queue import enqueue
    await save_book(100, BOOK_META, BOOK_TEXT)
    await save_translation(100, 0, "de", ["Chapter 0 old."])
    await enqueue(100, 0, "de")
    async with aiosqlite.connect(admin_db) as db:
        await db.execute(
            "UPDATE translation_queue SET status='running' WHERE book_id=100 AND chapter_index=0",
        )
        await db.commit()

    with patch("routers.admin.do_translate", new_callable=AsyncMock, return_value=["New."]):
        res = await admin_client.post(
            "/api/admin/translations/100/retranslate-all",
            json={"target_language": "de"},
        )

    assert res.status_code == 409
    detail = res.json()["detail"]
    assert "0" in detail  # blocked chapter index mentioned
    # Chapter 0 translation must be untouched
    from services.db import get_cached_translation
    assert await get_cached_translation(100, 0, "de") == ["Chapter 0 old."]


# ── SQL-level running-item guards (#367) ─────────────────────────────────────

def _make_bypass_status_check_aiosqlite(real_aiosqlite, item_id):
    """Return a fake aiosqlite module that makes the status SELECT return 'failed'
    for the specific item_id, bypassing the Python 409 guard. All other DB
    operations (including the UPDATE/DELETE) run against the real database.
    This simulates the race where the row becomes 'running' between the
    Python check and the SQL write.
    """
    orig_connect = real_aiosqlite.connect
    _select_done = [False]

    class FakeStatusRow:
        def __getitem__(self, k): return "failed"

    class FakeCursor:
        async def __aenter__(self): return self
        async def __aexit__(self, *a): pass
        async def fetchone(self): return FakeStatusRow()

    class SpyConn:
        def __init__(self, real):
            self._r = real

        @property
        def row_factory(self): return self._r.row_factory

        @row_factory.setter
        def row_factory(self, v): self._r.row_factory = v

        def execute(self, sql, *args, **kwargs):
            s = sql.strip().upper()
            # Intercept only the first "SELECT status" query so the Python 409
            # guard is bypassed, but the actual UPDATE/DELETE still runs.
            if s.startswith("SELECT") and "status" in sql.lower() and not _select_done[0]:
                _select_done[0] = True
                return FakeCursor()
            return self._r.execute(sql, *args, **kwargs)

        async def commit(self): await self._r.commit()

        async def __aenter__(self): return self

        async def __aexit__(self, *a): return await self._r.__aexit__(*a)

    def patched_connect(database, **kw):
        real_cm = orig_connect(database, **kw)

        class WrappedCM:
            async def __aenter__(self_):
                conn = await real_cm.__aenter__()
                return SpyConn(conn)

            async def __aexit__(self_, *a):
                return await real_cm.__aexit__(*a)

        return WrappedCM()

    class FakeAiosqlite:
        connect = staticmethod(patched_connect)
        Row = real_aiosqlite.Row

    return FakeAiosqlite()


async def test_queue_retry_item_sql_guard_prevents_running_reset(admin_client, admin_db, monkeypatch):
    """Regression #367: queue_retry_item UPDATE must use AND status != 'running'.

    Race: between the Python 409 check and the SQL UPDATE, the worker can
    transition a row to 'running'. Without the SQL guard, the UPDATE resets
    it to 'pending'; _mark_done then deletes the re-enqueued row silently.

    This test bypasses the Python check and calls the real UPDATE SQL against
    a running row. With the fix, updated=0. Without the fix, updated=1.
    """
    import aiosqlite as _real_aio
    import routers.admin as admin_mod

    await _seed_book(1)
    async with aiosqlite.connect(admin_db) as db:
        cursor = await db.execute(
            """INSERT INTO translation_queue
               (book_id, chapter_index, target_language, status, priority)
               VALUES (1, 0, 'de', 'running', 100)"""
        )
        item_id = cursor.lastrowid
        await db.commit()

    monkeypatch.setattr(
        admin_mod, "aiosqlite",
        _make_bypass_status_check_aiosqlite(_real_aio, item_id),
    )

    res = await admin_client.post(f"/api/admin/queue/items/{item_id}/retry")
    assert res.status_code == 200
    assert res.json().get("updated") == 0, (
        "SQL guard (AND status != 'running') must prevent resetting a running row to pending (#367)"
    )

    async with aiosqlite.connect(admin_db) as db:
        async with db.execute(
            "SELECT status FROM translation_queue WHERE id=?", (item_id,)
        ) as cur:
            row = await cur.fetchone()
    assert row is not None and row[0] == "running", "Running row must not be reset to pending"


async def test_queue_delete_item_sql_guard_prevents_running_delete(admin_client, admin_db, monkeypatch):
    """Regression #367: queue_delete_item DELETE must use AND status != 'running'.

    Same race as queue_retry_item. Without the SQL guard, the DELETE fires on
    a now-running row, giving false cancellation (worker still saves the result).
    With the fix, deleted=0 and the row remains for the worker to complete.
    """
    import aiosqlite as _real_aio
    import routers.admin as admin_mod

    await _seed_book(1)
    async with aiosqlite.connect(admin_db) as db:
        cursor = await db.execute(
            """INSERT INTO translation_queue
               (book_id, chapter_index, target_language, status, priority)
               VALUES (1, 0, 'de', 'running', 100)"""
        )
        item_id = cursor.lastrowid
        await db.commit()

    monkeypatch.setattr(
        admin_mod, "aiosqlite",
        _make_bypass_status_check_aiosqlite(_real_aio, item_id),
    )

    res = await admin_client.delete(f"/api/admin/queue/items/{item_id}")
    assert res.status_code == 200
    assert res.json().get("deleted") == 0, (
        "SQL guard (AND status != 'running') must prevent deleting a running row (#367)"
    )

    async with aiosqlite.connect(admin_db) as db:
        async with db.execute(
            "SELECT status FROM translation_queue WHERE id=?", (item_id,)
        ) as cur:
            row = await cur.fetchone()
    assert row is not None and row[0] == "running", "Running row must not be deleted"


# ── delete_book running-queue guard (#370) ────────────────────────────────────

_BOOK_META = {"title": "T", "authors": [], "languages": ["en"], "subjects": [], "download_count": 0, "cover": ""}


async def test_delete_book_rejects_when_translation_running(admin_client, admin_db):
    """Regression #370: DELETE /admin/books/{id} must return 409 if a queue row
    is currently running — deleting it would silently discard the in-flight job."""
    await save_book(1, _BOOK_META, "text")

    async with aiosqlite.connect(admin_db) as db:
        await db.execute(
            """INSERT INTO translation_queue
               (book_id, chapter_index, target_language, status, priority)
               VALUES (1, 0, 'de', 'running', 100)"""
        )
        await db.commit()

    res = await admin_client.delete("/api/admin/books/1")
    assert res.status_code == 409, (
        "delete_book must return 409 when a translation job is running (#370)"
    )

    async with aiosqlite.connect(admin_db) as db:
        async with db.execute("SELECT id FROM books WHERE id=1") as cur:
            row = await cur.fetchone()
    assert row is not None, "Book must not be deleted when a queue job is running"


async def test_delete_book_sql_guard_preserves_running_queue_row(admin_client, admin_db):
    """Regression #370: even if the Python 409 check races, SQL guard must
    preserve running translation_queue rows when deleting a book."""
    await save_book(2, _BOOK_META, "text")

    async with aiosqlite.connect(admin_db) as db:
        cursor = await db.execute(
            """INSERT INTO translation_queue
               (book_id, chapter_index, target_language, status, priority)
               VALUES (2, 0, 'fr', 'running', 100)"""
        )
        running_id = cursor.lastrowid
        await db.commit()

    # Simulate race: make the SELECT status check see 'pending' so the Python
    # 409 guard passes, but the actual row in the DB is 'running'
    import aiosqlite as _real_aio
    import routers.admin as admin_mod

    monkeypatch_fake = _make_bypass_status_check_aiosqlite(_real_aio, running_id)

    orig_setattr = None
    import routers.admin as _admin_mod
    old_aio = _admin_mod.aiosqlite
    _admin_mod.aiosqlite = monkeypatch_fake
    try:
        res = await admin_client.delete("/api/admin/books/2")
    finally:
        _admin_mod.aiosqlite = old_aio

    async with aiosqlite.connect(admin_db) as db:
        async with db.execute(
            "SELECT status FROM translation_queue WHERE id=?", (running_id,)
        ) as cur:
            row = await cur.fetchone()
    assert row is not None and row[0] == "running", (
        "SQL guard (AND status != 'running') must preserve running queue row (#370)"
    )


# ── Queue settings input validation ──────────────────────────────────────────


async def test_queue_settings_rejects_zero_rpm(admin_client, admin_db):
    """Regression #460: PUT /admin/queue/settings with rpm=0 must return 422.

    Zero or negative RPM causes division-by-zero in the queue worker's
    rate-limit sleep calculation."""
    res = await admin_client.put(
        "/api/admin/queue/settings",
        json={"rpm": 0},
    )
    assert res.status_code == 422, (
        f"Expected 422 for rpm=0, got {res.status_code}: {res.text}"
    )


async def test_queue_settings_rejects_negative_rpd(admin_client, admin_db):
    """Regression #460: PUT /admin/queue/settings with rpd=-1 must return 422."""
    res = await admin_client.put(
        "/api/admin/queue/settings",
        json={"rpd": -1},
    )
    assert res.status_code == 422, (
        f"Expected 422 for rpd=-1, got {res.status_code}: {res.text}"
    )


async def test_queue_settings_rejects_zero_max_output_tokens(admin_client, admin_db):
    """Regression #460: PUT /admin/queue/settings with max_output_tokens=0 must
    return 422. Zero tokens passed to the AI API causes API errors."""
    res = await admin_client.put(
        "/api/admin/queue/settings",
        json={"max_output_tokens": 0},
    )
    assert res.status_code == 422, (
        f"Expected 422 for max_output_tokens=0, got {res.status_code}: {res.text}"
    )


async def test_queue_settings_accepts_valid_positive_values(admin_client, admin_db):
    """Regression #460: PUT /admin/queue/settings with valid positive values must succeed."""
    res = await admin_client.put(
        "/api/admin/queue/settings",
        json={"rpm": 10, "rpd": 1000, "max_output_tokens": 8192},
    )
    assert res.status_code == 200, (
        f"Expected 200 for valid positive values, got {res.status_code}: {res.text}"
    )


# ── model_chain validation (Issue #474) ──────────────────────────────────────

async def test_queue_settings_rejects_empty_model_chain(admin_client, admin_db):
    """Regression #474: empty model_chain list must return 400 (would leave SETTING_MODEL stale)."""
    res = await admin_client.put(
        "/api/admin/queue/settings",
        json={"model_chain": []},
    )
    assert res.status_code == 400, (
        f"Expected 400 for empty model_chain, got {res.status_code}: {res.text}"
    )


async def test_queue_settings_rejects_model_chain_with_empty_entry(admin_client, admin_db):
    """Regression #474/#776: model_chain with empty-string entry must be rejected.
    Now returns 422 (Pydantic min_length=1 fires before business logic)."""
    res = await admin_client.put(
        "/api/admin/queue/settings",
        json={"model_chain": ["", "gemini-1.5-flash"]},
    )
    assert res.status_code == 422, (
        f"Expected 422 for model_chain with empty entry, got {res.status_code}: {res.text}"
    )


async def test_queue_settings_rejects_auto_translate_languages_with_whitespace_entry(admin_client, admin_db):
    """Regression #474: whitespace-only language codes in auto_translate_languages
    must be stripped, resulting in valid stored codes only."""
    res = await admin_client.put(
        "/api/admin/queue/settings",
        json={"auto_translate_languages": ["  ", "en", " "]},
    )
    # Should succeed but store only ["en"] — whitespace entries are silently filtered
    assert res.status_code == 200, (
        f"Expected 200 (whitespace filtered), got {res.status_code}: {res.text}"
    )
    from services.db import get_setting
    import json as _json
    stored = _json.loads(await get_setting("auto_translate_languages") or "[]")
    assert stored == ["en"], f"Expected only ['en'] after whitespace filtering, got {stored}"


async def test_queue_settings_accepts_valid_model_chain(admin_client, admin_db):
    """Regression #474: a non-empty model_chain with valid entries must be accepted."""
    res = await admin_client.put(
        "/api/admin/queue/settings",
        json={"model_chain": ["gemini-2.0-flash", "gemini-1.5-flash"]},
    )
    assert res.status_code == 200, (
        f"Expected 200 for valid model_chain, got {res.status_code}: {res.text}"
    )


# ── Queue items limit validation (Issue #484) ─────────────────────────────────

@pytest.mark.asyncio
async def test_queue_items_over_limit_returns_422(admin_client, admin_db):
    """Regression #484: GET /admin/queue/items?limit=9999999 must be rejected with 422.

    Without an upper bound, the query runs with LIMIT 9999999 and can exhaust
    server memory when the queue is large.
    """
    res = await admin_client.get("/api/admin/queue/items?limit=9999999")
    assert res.status_code == 422, (
        f"Expected 422 for over-limit value, got {res.status_code}: {res.text}"
    )


@pytest.mark.asyncio
async def test_queue_items_zero_limit_returns_422(admin_client, admin_db):
    """Regression #484: limit=0 must be rejected."""
    res = await admin_client.get("/api/admin/queue/items?limit=0")
    assert res.status_code == 422, (
        f"Expected 422 for zero limit, got {res.status_code}: {res.text}"
    )


@pytest.mark.asyncio
async def test_queue_items_default_limit_accepted(admin_client, admin_db):
    """Default limit (200) must still be accepted."""
    res = await admin_client.get("/api/admin/queue/items")
    assert res.status_code == 200, (
        f"Expected 200 for default limit, got {res.status_code}: {res.text}"
    )


@pytest.mark.asyncio
async def test_queue_items_max_limit_accepted(admin_client, admin_db):
    """Upper boundary (1000) must be accepted."""
    res = await admin_client.get("/api/admin/queue/items?limit=1000")
    assert res.status_code == 200, (
        f"Expected 200 for limit=1000, got {res.status_code}: {res.text}"
    )


# ── Issue #521: Admin request model max_length ────────────────────────────────


@pytest.mark.asyncio
async def test_bulk_retranslate_oversized_target_language_returns_422(admin_client, admin_db):
    """Regression #521: POST /admin/translations/{id}/retranslate-all with target_language > 20 chars
    must return 422, not try to store a huge string in translations table."""
    res = await admin_client.post(
        "/api/admin/translations/9901/retranslate-all",
        json={"target_language": "x" * 21},
    )
    assert res.status_code == 422, (
        f"Expected 422 for oversized target_language in retranslate-all, got {res.status_code}"
    )


@pytest.mark.asyncio
async def test_import_translations_oversized_target_language_returns_422(admin_client, admin_db):
    """Regression #521: POST /admin/translations/import with target_language > 20 chars
    must return 422."""
    res = await admin_client.post(
        "/api/admin/translations/import",
        json={"entries": [{"book_id": 1, "chapter_index": 0,
                           "target_language": "y" * 21, "paragraphs": ["hello"]}]},
    )
    assert res.status_code == 422, (
        f"Expected 422 for oversized target_language in import, got {res.status_code}"
    )


@pytest.mark.asyncio
async def test_import_translations_oversized_provider_returns_422(admin_client, admin_db):
    """Regression #521: provider > 100 chars in import entry must return 422."""
    res = await admin_client.post(
        "/api/admin/translations/import",
        json={"entries": [{"book_id": 1, "chapter_index": 0,
                           "target_language": "de", "paragraphs": ["hello"],
                           "provider": "p" * 101}]},
    )
    assert res.status_code == 422, (
        f"Expected 422 for oversized provider in import, got {res.status_code}"
    )


@pytest.mark.asyncio
async def test_queue_settings_oversized_api_key_returns_422(admin_client, admin_db):
    """Regression #521: PUT /admin/queue/settings with api_key > 500 chars must return 422."""
    res = await admin_client.put(
        "/api/admin/queue/settings",
        json={"api_key": "k" * 501},
    )
    assert res.status_code == 422, (
        f"Expected 422 for oversized api_key in queue settings, got {res.status_code}"
    )


@pytest.mark.asyncio
async def test_queue_settings_oversized_model_returns_422(admin_client, admin_db):
    """Regression #521: PUT /admin/queue/settings with model > 200 chars must return 422."""
    res = await admin_client.put(
        "/api/admin/queue/settings",
        json={"model": "m" * 201},
    )
    assert res.status_code == 422, (
        f"Expected 422 for oversized model in queue settings, got {res.status_code}"
    )


@pytest.mark.asyncio
async def test_queue_settings_empty_model_returns_422(admin_client, admin_db):
    """Regression #1003: PUT /admin/queue/settings with model="" must return 422.

    Without min_length=1 the empty string passes Pydantic validation and is
    written to SETTING_MODEL, causing all subsequent translations to fail with
    an undiagnosable AI-API error using model name ""."""
    res = await admin_client.put(
        "/api/admin/queue/settings",
        json={"model": ""},
    )
    assert res.status_code == 422, (
        f"Expected 422 for empty model in queue settings, got {res.status_code}: {res.text}"
    )


@pytest.mark.asyncio
async def test_enqueue_book_oversized_target_language_returns_422(admin_client, admin_db):
    """Regression #521: POST /admin/queue/enqueue-book with a target_language > 20 chars
    must return 422, not store a huge string in translation_queue."""
    res = await admin_client.post(
        "/api/admin/queue/enqueue-book",
        json={"book_id": 1, "target_languages": ["z" * 21]},
    )
    assert res.status_code == 422, (
        f"Expected 422 for oversized target_language in enqueue-book, got {res.status_code}"
    )


# ── Issue #524: ImportTranslationEntry.paragraphs bounds ─────────────────────


@pytest.mark.asyncio
async def test_import_translations_too_many_paragraphs_returns_422(admin_client, admin_db):
    """Regression #524: POST /admin/translations/import with > 2000 paragraphs
    in an entry must return 422."""
    res = await admin_client.post(
        "/api/admin/translations/import",
        json={"entries": [{"book_id": 1, "chapter_index": 0,
                           "target_language": "en", "paragraphs": ["p"] * 2001}]},
    )
    assert res.status_code == 422, (
        f"Expected 422 for too many paragraphs in import, got {res.status_code}: {res.text}"
    )


@pytest.mark.asyncio
async def test_import_translations_oversized_paragraph_item_returns_422(admin_client, admin_db):
    """Regression #524: POST /admin/translations/import with a paragraph item > 50000 chars
    must return 422."""
    res = await admin_client.post(
        "/api/admin/translations/import",
        json={"entries": [{"book_id": 1, "chapter_index": 0,
                           "target_language": "en", "paragraphs": ["x" * 50001]}]},
    )
    assert res.status_code == 422, (
        f"Expected 422 for oversized paragraph item in import, got {res.status_code}: {res.text}"
    )


@pytest.mark.asyncio
async def test_import_translations_empty_paragraph_item_returns_422(admin_client, admin_db):
    """Regression #906: POST /admin/translations/import with an empty string paragraph item
    must return 422."""
    res = await admin_client.post(
        "/api/admin/translations/import",
        json={"entries": [{"book_id": 1, "chapter_index": 0,
                           "target_language": "en", "paragraphs": [""]}]},
    )
    assert res.status_code == 422, (
        f"Expected 422 for empty paragraph item in import, got {res.status_code}: {res.text}"
    )


# ── Issue #531: QueueSettingsRequest list item bounds ────────────────────────


@pytest.mark.asyncio
async def test_queue_settings_oversized_language_item_returns_422(admin_client, admin_db):
    """Regression #531: auto_translate_languages item > 20 chars must return 422."""
    res = await admin_client.put(
        "/api/admin/queue/settings",
        json={"auto_translate_languages": ["x" * 21]},
    )
    assert res.status_code == 422, (
        f"Expected 422 for oversized language item, got {res.status_code}: {res.text}"
    )


@pytest.mark.asyncio
async def test_queue_settings_oversized_model_chain_item_returns_422(admin_client, admin_db):
    """Regression #531: model_chain item > 200 chars must return 422."""
    res = await admin_client.put(
        "/api/admin/queue/settings",
        json={"model_chain": ["m" * 201]},
    )
    assert res.status_code == 422, (
        f"Expected 422 for oversized model_chain item, got {res.status_code}: {res.text}"
    )


@pytest.mark.asyncio
async def test_queue_settings_too_many_languages_returns_422(admin_client, admin_db):
    """Regression #531: auto_translate_languages list > 50 items must return 422."""
    res = await admin_client.put(
        "/api/admin/queue/settings",
        json={"auto_translate_languages": ["en"] * 51},
    )
    assert res.status_code == 422, (
        f"Expected 422 for too many languages, got {res.status_code}: {res.text}"
    )


# ── Admin uploads panel (issue #432) ─────────────────────────────────────────

async def test_get_uploads_returns_empty_list(admin_client, admin_db):
    """GET /admin/uploads returns [] when no books have been uploaded."""
    res = await admin_client.get("/api/admin/uploads")
    assert res.status_code == 200
    assert res.json() == []


async def test_get_uploads_returns_uploaded_books(admin_client, admin_db, admin_user):
    """GET /admin/uploads returns upload records with book and uploader info."""
    async with aiosqlite.connect(admin_db) as db:
        await db.execute(
            "INSERT INTO books (id, title, source, owner_user_id) VALUES (200, 'Uploaded Novel', 'upload', ?)",
            (admin_user["id"],),
        )
        await db.execute(
            "INSERT INTO book_uploads (book_id, user_id, filename, file_size, format) "
            "VALUES (200, ?, 'novel.epub', 102400, 'epub')",
            (admin_user["id"],),
        )
        await db.commit()

    res = await admin_client.get("/api/admin/uploads")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    row = data[0]
    assert row["book_id"] == 200
    assert row["title"] == "Uploaded Novel"
    assert row["filename"] == "novel.epub"
    assert row["file_size"] == 102400
    assert row["uploader_email"] == admin_user["email"]


async def test_get_uploads_filter_by_user(admin_client, admin_db, admin_user):
    """GET /admin/uploads?user_id=N returns only that user's uploads."""
    async with aiosqlite.connect(admin_db) as db:
        await db.execute(
            "INSERT INTO users (google_id, email, name, picture) VALUES ('other-g', 'other@test.com', 'Other', '')"
        )
        async with db.execute("SELECT id FROM users WHERE google_id='other-g'") as cur:
            other_id = (await cur.fetchone())[0]
        await db.execute(
            "INSERT INTO books (id, title, source, owner_user_id) VALUES (201, 'Admin Book', 'upload', ?)",
            (admin_user["id"],),
        )
        await db.execute(
            "INSERT INTO book_uploads (book_id, user_id, filename, file_size, format) "
            "VALUES (201, ?, 'admin.epub', 1024, 'epub')",
            (admin_user["id"],),
        )
        await db.execute(
            "INSERT INTO books (id, title, source, owner_user_id) VALUES (202, 'Other Book', 'upload', ?)",
            (other_id,),
        )
        await db.execute(
            "INSERT INTO book_uploads (book_id, user_id, filename, file_size, format) "
            "VALUES (202, ?, 'other.epub', 2048, 'epub')",
            (other_id,),
        )
        await db.commit()

    res = await admin_client.get(f"/api/admin/uploads?user_id={admin_user['id']}")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["book_id"] == 201


# ── Oversized query param bounds checks (regression for #530, #538) ──────────

async def test_queue_items_oversized_status_returns_422(admin_client):
    # regression for #530: status query param was unbounded
    res = await admin_client.get(f"/api/admin/queue/items?status={'x' * 21}")
    assert res.status_code == 422


async def test_queue_clear_oversized_status_returns_422(admin_client):
    res = await admin_client.delete(f"/api/admin/queue?status={'x' * 21}")
    assert res.status_code == 422


async def test_queue_delete_book_oversized_target_language_returns_422(admin_client):
    res = await admin_client.delete(f"/api/admin/queue/book/1?target_language={'x' * 21}")
    assert res.status_code == 422


# ── Translation path param bounds checks (regression for #583) ────────────────

async def test_delete_language_translations_oversized_target_language_returns_422(admin_client):
    res = await admin_client.delete(f"/api/admin/translations/1/{'x' * 21}")
    assert res.status_code == 422


async def test_delete_translation_oversized_target_language_returns_422(admin_client):
    res = await admin_client.delete(f"/api/admin/translations/1/0/{'x' * 21}")
    assert res.status_code == 422


async def test_retranslate_oversized_target_language_returns_422(admin_client):
    res = await admin_client.post(f"/api/admin/translations/1/0/{'x' * 21}/retranslate")
    assert res.status_code == 422


async def test_move_translation_oversized_target_language_returns_422(admin_client):
    res = await admin_client.post(
        f"/api/admin/translations/1/0/{'x' * 21}/move",
        json={"new_chapter_index": 1},
    )
    assert res.status_code == 422


# ── Unbounded list params (regression for #626) ───────────────────────────────

async def test_import_translations_oversized_entries_returns_422(admin_client):
    oversized = [
        {"book_id": 1, "chapter_index": i, "target_language": "en", "paragraphs": ["text"]}
        for i in range(5001)
    ]
    res = await admin_client.post("/api/admin/translations/import", json={"entries": oversized})
    assert res.status_code == 422


async def test_enqueue_book_oversized_target_languages_returns_422(admin_client):
    res = await admin_client.post(
        "/api/admin/queue/enqueue-book",
        json={"book_id": 1, "target_languages": ["en"] * 101},
    )
    assert res.status_code == 422


async def test_retranslate_all_empty_chapters_returns_ok(admin_client, admin_db):
    """Regression #715: retranslate-all must not crash with SQL syntax error
    when split_with_html_preference returns 0 chapters.

    Previously the running-jobs SQL query was built as:
      AND chapter_index IN ()
    which is invalid SQLite syntax and caused a 500 OperationalError.
    """
    await save_book(100, BOOK_META, BOOK_TEXT)

    from services.book_chapters import clear_cache
    clear_cache()

    # Mock the splitter to return 0 chapters — the scenario that causes IN ()
    with patch(
        "services.book_chapters.split_with_html_preference",
        new=AsyncMock(return_value=[]),
    ):
        res = await admin_client.post(
            "/api/admin/translations/100/retranslate-all",
            json={"target_language": "zh"},
        )
    assert res.status_code == 200, f"Expected 200 for zero-chapter book, got {res.status_code}: {res.text}"
    body = res.json()
    assert body["ok"] is True
    assert body["chapters"] == 0
    assert body["results"] == []


# ── Issue #723: retranslate endpoints must work for uploaded books ─────────────


async def _insert_uploaded_book(db_path: str, book_id: int, owner_id: int) -> None:
    """Insert a confirmed uploaded book with two chapters into the test DB."""
    import aiosqlite
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            """INSERT INTO books (id, title, authors, languages, subjects, download_count,
                                  cover, text, images, source, owner_user_id)
               VALUES (?, 'Uploaded Novel', '["Author"]', '["en"]', '[]', 0, '', '', '[]', 'upload', ?)""",
            (book_id, owner_id),
        )
        await db.execute(
            """INSERT INTO book_uploads (book_id, user_id, filename, file_size, format)
               VALUES (?, ?, 'novel.txt', 1024, 'txt')""",
            (book_id, owner_id),
        )
        await db.executemany(
            """INSERT INTO user_book_chapters (book_id, chapter_index, title, text, is_draft)
               VALUES (?, ?, ?, ?, 0)""",
            [
                (book_id, 0, "Chapter One", "word " * 300),
                (book_id, 1, "Chapter Two", "word " * 300),
            ],
        )
        await db.commit()


async def test_retranslate_uploaded_book_returns_200(admin_client, admin_db, admin_user):
    """Regression #723: retranslate must not return 404 for uploaded books.

    Uploaded books have text='' in the books table; chapters live in
    user_book_chapters. Previously the endpoint guarded with
    `if not book or not book.get('text')` which always raised 404 for uploads.
    """
    import services.db as db_module
    from services.book_chapters import clear_cache

    await _insert_uploaded_book(db_module.DB_PATH, 7230, admin_user["id"])
    clear_cache()

    with patch(
        "routers.admin.do_translate",
        new_callable=AsyncMock,
        return_value=["Translated paragraph."],
    ):
        res = await admin_client.post(
            "/api/admin/translations/7230/0/zh/retranslate"
        )

    assert res.status_code == 200, (
        f"Expected 200 for uploaded book retranslate, got {res.status_code}: {res.text}"
    )
    assert res.json()["ok"] is True


async def test_retranslate_all_uploaded_book_returns_200(admin_client, admin_db, admin_user):
    """Regression #723: retranslate-all must not return 404 for uploaded books."""
    import services.db as db_module
    from services.book_chapters import clear_cache

    await _insert_uploaded_book(db_module.DB_PATH, 7231, admin_user["id"])
    clear_cache()

    with patch(
        "routers.admin.do_translate",
        new_callable=AsyncMock,
        return_value=["Translated."],
    ):
        res = await admin_client.post(
            "/api/admin/translations/7231/retranslate-all",
            json={"target_language": "zh"},
        )

    assert res.status_code == 200, (
        f"Expected 200 for uploaded book retranslate-all, got {res.status_code}: {res.text}"
    )
    body = res.json()
    assert body["ok"] is True
    assert body["chapters"] == 2


# ── Issue #725: ge bounds on admin path and body params ───────────────────────


async def test_approve_user_negative_id_returns_422(admin_client):
    res = await admin_client.put("/api/admin/users/-1/approve", json={"approved": True})
    assert res.status_code == 422, f"Expected 422, got {res.status_code}"


async def test_change_role_negative_user_id_returns_422(admin_client):
    res = await admin_client.put("/api/admin/users/-1/role", json={"role": "user"})
    assert res.status_code == 422, f"Expected 422, got {res.status_code}"


async def test_remove_user_negative_id_returns_422(admin_client):
    res = await admin_client.delete("/api/admin/users/-1")
    assert res.status_code == 422, f"Expected 422, got {res.status_code}"


async def test_delete_book_negative_id_returns_422(admin_client):
    res = await admin_client.delete("/api/admin/books/-1")
    assert res.status_code == 422, f"Expected 422, got {res.status_code}"


async def test_delete_book_audio_negative_id_returns_422(admin_client):
    res = await admin_client.delete("/api/admin/audio/-1")
    assert res.status_code == 422, f"Expected 422, got {res.status_code}"


async def test_delete_chapter_audio_negative_chapter_returns_422(admin_client):
    res = await admin_client.delete("/api/admin/audio/1/-1")
    assert res.status_code == 422, f"Expected 422, got {res.status_code}"


async def test_delete_book_translations_negative_id_returns_422(admin_client):
    res = await admin_client.delete("/api/admin/translations/-1")
    assert res.status_code == 422, f"Expected 422, got {res.status_code}"


async def test_delete_language_translations_negative_book_id_returns_422(admin_client):
    res = await admin_client.delete("/api/admin/translations/-1/zh")
    assert res.status_code == 422, f"Expected 422, got {res.status_code}"


async def test_delete_translation_negative_chapter_returns_422(admin_client):
    res = await admin_client.delete("/api/admin/translations/1/-1/zh")
    assert res.status_code == 422, f"Expected 422, got {res.status_code}"


async def test_retranslate_negative_chapter_returns_422(admin_client):
    res = await admin_client.post("/api/admin/translations/1/-1/zh/retranslate")
    assert res.status_code == 422, f"Expected 422, got {res.status_code}"


async def test_retranslate_all_negative_book_id_returns_422(admin_client):
    res = await admin_client.post(
        "/api/admin/translations/-1/retranslate-all",
        json={"target_language": "zh"},
    )
    assert res.status_code == 422, f"Expected 422, got {res.status_code}"


async def test_move_translation_negative_chapter_returns_422(admin_client):
    res = await admin_client.post(
        "/api/admin/translations/1/-1/zh/move",
        json={"new_chapter_index": 0},
    )
    assert res.status_code == 422, f"Expected 422, got {res.status_code}"


async def test_move_translation_negative_new_chapter_returns_422(admin_client):
    res = await admin_client.post(
        "/api/admin/translations/1/0/zh/move",
        json={"new_chapter_index": -1},
    )
    assert res.status_code == 422, f"Expected 422, got {res.status_code}"


async def test_import_book_negative_id_returns_422(admin_client):
    res = await admin_client.post("/api/admin/books/import", json={"book_id": -1})
    assert res.status_code == 422, f"Expected 422, got {res.status_code}"


async def test_import_translation_entry_negative_book_id_returns_422(admin_client):
    res = await admin_client.post(
        "/api/admin/translations/import",
        json={"entries": [{"book_id": -1, "chapter_index": 0, "target_language": "zh", "paragraphs": ["p"]}]},
    )
    assert res.status_code == 422, f"Expected 422, got {res.status_code}"


async def test_import_translation_entry_negative_chapter_index_returns_422(admin_client):
    res = await admin_client.post(
        "/api/admin/translations/import",
        json={"entries": [{"book_id": 1, "chapter_index": -1, "target_language": "zh", "paragraphs": ["p"]}]},
    )
    assert res.status_code == 422, f"Expected 422, got {res.status_code}"


async def test_enqueue_book_negative_book_id_returns_422(admin_client):
    res = await admin_client.post(
        "/api/admin/queue/enqueue-book",
        json={"book_id": -1},
    )
    assert res.status_code == 422, f"Expected 422, got {res.status_code}"


async def test_queue_delete_item_negative_id_returns_422(admin_client):
    res = await admin_client.delete("/api/admin/queue/items/-1")
    assert res.status_code == 422, f"Expected 422, got {res.status_code}"


async def test_queue_retry_item_negative_id_returns_422(admin_client):
    res = await admin_client.post("/api/admin/queue/items/-1/retry")
    assert res.status_code == 422, f"Expected 422, got {res.status_code}"


async def test_queue_delete_book_negative_id_returns_422(admin_client):
    res = await admin_client.delete("/api/admin/queue/book/-1")
    assert res.status_code == 422, f"Expected 422, got {res.status_code}"


async def test_retry_failed_negative_book_id_returns_422(admin_client):
    res = await admin_client.post(
        "/api/admin/queue/retry-failed",
        json={"book_id": -1},
    )
    assert res.status_code == 422, f"Expected 422, got {res.status_code}"


# ── Issue #736: ge=1 on admin uploads user_id and QueuePlanRequest.book_ids ──


async def test_get_uploads_negative_user_id_returns_422(admin_client):
    """Regression #736: GET /admin/uploads?user_id=-1 must return 422."""
    res = await admin_client.get("/api/admin/uploads?user_id=-1")
    assert res.status_code == 422, f"Expected 422 for negative user_id, got {res.status_code}: {res.text}"


async def test_get_uploads_zero_user_id_returns_422(admin_client):
    """Regression #736: GET /admin/uploads?user_id=0 must return 422."""
    res = await admin_client.get("/api/admin/uploads?user_id=0")
    assert res.status_code == 422, f"Expected 422 for user_id=0, got {res.status_code}: {res.text}"


async def test_queue_plan_negative_book_id_in_list_returns_422(admin_client):
    """Regression #736: POST /admin/queue/plan with book_ids containing negative must return 422."""
    res = await admin_client.post(
        "/api/admin/queue/plan",
        json={"target_language": "zh", "book_ids": [-1]},
    )
    assert res.status_code == 422, f"Expected 422 for negative book_id in list, got {res.status_code}: {res.text}"


async def test_queue_dry_run_negative_book_id_in_list_returns_422(admin_client):
    """Regression #736: POST /admin/queue/dry-run with book_ids containing negative must return 422."""
    res = await admin_client.post(
        "/api/admin/queue/dry-run",
        json={"target_language": "zh", "book_ids": [-1]},
    )
    assert res.status_code == 422, f"Expected 422 for negative book_id in list, got {res.status_code}: {res.text}"


async def test_queue_plan_oversized_book_ids_list_returns_422(admin_client):
    """Regression #765: POST /admin/queue/plan with book_ids list > 1000 items must return 422."""
    res = await admin_client.post(
        "/api/admin/queue/plan",
        json={"target_language": "zh", "book_ids": list(range(1, 1002))},
    )
    assert res.status_code == 422, f"Expected 422 for oversized book_ids list, got {res.status_code}: {res.text}"


async def test_queue_dry_run_oversized_book_ids_list_returns_422(admin_client):
    """Regression #765: POST /admin/queue/dry-run with book_ids list > 1000 items must return 422."""
    res = await admin_client.post(
        "/api/admin/queue/dry-run",
        json={"target_language": "zh", "book_ids": list(range(1, 1002))},
    )
    assert res.status_code == 422, f"Expected 422 for oversized book_ids list, got {res.status_code}: {res.text}"


async def test_queue_items_negative_book_id_returns_422(admin_client):
    """Regression #736: GET /admin/queue/items?book_id=-1 must return 422."""
    res = await admin_client.get("/api/admin/queue/items?book_id=-1")
    assert res.status_code == 422, f"Expected 422 for negative book_id, got {res.status_code}: {res.text}"


@pytest.mark.asyncio
async def test_import_book_error_does_not_leak_exception_detail(admin_client):
    """Regression #756: import_book must not expose raw exception text in 400 response."""
    with patch("routers.admin.get_book_meta", new_callable=AsyncMock,
               side_effect=RuntimeError("gutenberg-internal-error-xyzzy")):
        res = await admin_client.post("/api/admin/books/import", json={"book_id": 42})
    assert res.status_code == 400
    detail = res.json()["detail"]
    assert "gutenberg-internal-error-xyzzy" not in detail
    assert ":" not in detail or detail.count(":") == 0


@pytest.mark.asyncio
async def test_queue_dry_run_error_does_not_leak_exception_detail(admin_client):
    """Regression #756: queue_dry_run must not expose raw exception text in 500 response."""
    with patch("routers.admin.get_setting", new_callable=AsyncMock, return_value="encrypted-key"), \
         patch("routers.admin.decrypt_api_key", return_value="sk-fake"), \
         patch("routers.admin.plan_work_for_queue", new_callable=AsyncMock,
               return_value=[{"book_id": 1, "book_title": "T", "source_language": "de",
                              "chapters": [type("C", (), {"chapter_index": 0, "chapter_text": "hello world"})()]}]), \
         patch("routers.admin.group_chapters_for_batch",
               return_value=[[type("C", (), {"chapter_index": 0, "chapter_text": "hello world"})()]]), \
         patch("routers.admin.get_model_chain", new_callable=AsyncMock, return_value=["gemini-pro"]), \
         patch("routers.admin.translate_chapters_batch", new_callable=AsyncMock,
               side_effect=RuntimeError("api-key-secret-xyzzy leaked")):
        res = await admin_client.post("/api/admin/queue/dry-run",
                                      json={"target_language": "zh"})
    assert res.status_code == 500
    detail = res.json()["detail"]
    assert "api-key-secret-xyzzy" not in detail
    assert "leaked" not in detail


# ── Issue #772: target_language fields accept empty string ────────────────────


async def test_queue_plan_empty_target_language_returns_422(admin_client):
    """Regression #772: POST /admin/queue/plan with target_language="" must return 422."""
    res = await admin_client.post(
        "/api/admin/queue/plan",
        json={"target_language": ""},
    )
    assert res.status_code == 422, f"Expected 422 for empty target_language, got {res.status_code}: {res.text}"


async def test_queue_dry_run_empty_target_language_returns_422(admin_client):
    """Regression #772: POST /admin/queue/dry-run with target_language="" must return 422."""
    res = await admin_client.post(
        "/api/admin/queue/dry-run",
        json={"target_language": ""},
    )
    assert res.status_code == 422, f"Expected 422 for empty target_language, got {res.status_code}: {res.text}"


async def test_bulk_retranslate_empty_target_language_returns_422(admin_client):
    """Regression #772: POST /admin/translations/{id}/retranslate-all with target_language="" must return 422."""
    res = await admin_client.post(
        "/api/admin/translations/9901/retranslate-all",
        json={"target_language": ""},
    )
    assert res.status_code == 422, f"Expected 422 for empty target_language, got {res.status_code}: {res.text}"


async def test_enqueue_book_empty_target_language_in_list_returns_422(admin_client):
    """Regression #772: POST /admin/queue/enqueue-book with empty string in target_languages must return 422."""
    res = await admin_client.post(
        "/api/admin/queue/enqueue-book",
        json={"book_id": 1, "target_languages": [""]},
    )
    assert res.status_code == 422, f"Expected 422 for empty target_language in list, got {res.status_code}: {res.text}"


# ── Issue #776: QueueSettingsRequest list elements and RetryFailedRequest.target_language ──


@pytest.mark.asyncio
async def test_queue_settings_empty_auto_translate_language_returns_422(admin_client):
    """Regression #776: PUT /admin/queue/settings with empty string in auto_translate_languages must return 422."""
    res = await admin_client.put(
        "/api/admin/queue/settings",
        json={"auto_translate_languages": [""]},
    )
    assert res.status_code == 422, f"Expected 422 for empty lang in auto_translate_languages, got {res.status_code}: {res.text}"


@pytest.mark.asyncio
async def test_queue_settings_empty_model_chain_entry_returns_422(admin_client):
    """Regression #776: PUT /admin/queue/settings with empty string in model_chain must return 422."""
    res = await admin_client.put(
        "/api/admin/queue/settings",
        json={"model_chain": [""]},
    )
    assert res.status_code == 422, f"Expected 422 for empty entry in model_chain, got {res.status_code}: {res.text}"


@pytest.mark.asyncio
async def test_retry_failed_empty_target_language_returns_422(admin_client):
    """Regression #776: POST /admin/queue/retry-failed with target_language="" must return 422."""
    res = await admin_client.post(
        "/api/admin/queue/retry-failed",
        json={"target_language": ""},
    )
    assert res.status_code == 422, f"Expected 422 for empty target_language, got {res.status_code}: {res.text}"


@pytest.mark.asyncio
async def test_queue_items_empty_status_returns_422(admin_client):
    """Regression #807: GET /admin/queue/items?status= must return 422, not silently filter by empty string."""
    res = await admin_client.get("/api/admin/queue/items?status=")
    assert res.status_code == 422, (
        f"Expected 422 for empty status in GET /admin/queue/items, got {res.status_code}: {res.text}"
    )


@pytest.mark.asyncio
async def test_queue_clear_empty_status_returns_422(admin_client):
    """Regression #807: DELETE /admin/queue?status= must return 422, not silently filter by empty string."""
    res = await admin_client.delete("/api/admin/queue?status=")
    assert res.status_code == 422, (
        f"Expected 422 for empty status in DELETE /admin/queue, got {res.status_code}: {res.text}"
    )


# ── Issue #999: assert anti-pattern in SeedPopularManager._run() ──────────────


@pytest.mark.asyncio
async def test_seed_popular_manager_run_raises_runtime_error_without_start():
    """Regression #999: SeedPopularManager._run() must raise RuntimeError (not
    AssertionError) when _stop_event is None.

    AssertionError is silently stripped under Python -O, causing the worker to
    proceed with stop_event=None and crash later with an unrelated AttributeError
    instead of a clear diagnostic message."""
    from services.seed_popular import SeedPopularManager

    mgr = SeedPopularManager()
    assert mgr._stop_event is None

    with pytest.raises(RuntimeError, match="_run\\(\\) called before start\\(\\)"):
        await mgr._run("some_path.json")


# ── Issue #1006: retranslate-all aborts on per-chapter fallback failure ─────────


@pytest.mark.asyncio
async def test_retranslate_all_continues_after_per_chapter_translation_failure(admin_user, admin_client, admin_db):
    """Regression #1006: retranslate-all must record a chapter as 'failed' and
    continue to the next chapter when both Gemini and the Google fallback raise.

    Without the fix, the exception from the Google fallback propagates out of
    the for-loop and aborts the entire operation with a 500, silently skipping
    all subsequent chapters."""
    from services.db import set_user_gemini_key
    from services.auth import encrypt_api_key
    await set_user_gemini_key(admin_user["id"], encrypt_api_key("fake-api-key"))

    await save_book(100, BOOK_META, MOVE_BOOK_TEXT)

    call_count = 0

    async def _do_translate_side_effect(text, src, tgt, *, provider="google", gemini_key=None):
        nonlocal call_count
        call_count += 1
        if call_count <= 2:
            # Calls 1+2: Gemini primary + Google fallback for chapter 0 both fail.
            raise RuntimeError("simulated translation failure")
        # Subsequent calls (chapters 1+ Gemini, etc.) succeed.
        return ["ok"]

    with patch("routers.admin.do_translate", side_effect=_do_translate_side_effect):
        res = await admin_client.post(
            "/api/admin/translations/100/retranslate-all",
            json={"target_language": "zh"},
        )

    assert res.status_code == 200, (
        f"Expected 200 for partial-failure retranslate-all, got {res.status_code}: {res.text}"
    )
    body = res.json()
    assert body["ok"] is True
    results = {r["chapter"]: r["status"] for r in body["results"]}
    assert results.get(0) == "failed", "chapter 0 must be recorded as failed"
    assert results.get(1) == "ok", "chapter 1 must succeed after chapter 0 failed"
