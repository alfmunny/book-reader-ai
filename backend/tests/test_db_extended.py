"""
Extended tests for services/db.py — GitHub/Apple auth, user management,
annotations, vocabulary, obsidian settings, book insights,
get_cached_translation_with_meta.
"""

import pytest
import services.db as db_module
from services.db import (
    init_db,
    _new_user_role_approved,
    get_or_create_user,
    get_or_create_user_github,
    get_or_create_user_apple,
    get_user_by_id,
    list_users,
    set_user_approved,
    set_user_role,
    delete_user,
    set_user_plan,
    save_translation,
    get_cached_translation_with_meta,
    create_annotation,
    get_annotations,
    update_annotation,
    delete_annotation,
    save_word,
    get_vocabulary,
    delete_word,
    update_obsidian_settings,
    get_obsidian_settings,
    save_insight,
    get_insights,
    delete_insight,
)


@pytest.fixture(autouse=True)
async def tmp_db(monkeypatch, tmp_path):
    path = str(tmp_path / "test.db")
    monkeypatch.setattr(db_module, "DB_PATH", path)
    await init_db()
    # annotations + book_insights + chapter_summaries now carry declared FKs
    # on book_id (migrations 031 + 032), book_insights + annotations on
    # user_id, and translations + audio_cache on book_id (migration 033).
    # Pre-seed the book ids referenced across this module's tests.
    # source='upload' keeps the rows out of list_cached_books so unrelated
    # count tests stay stable.
    import aiosqlite
    async with aiosqlite.connect(path) as db:
        await db.executemany(
            "INSERT OR IGNORE INTO books (id, title, images, source) "
            "VALUES (?, 'T', '[]', 'upload')",
            [(i,) for i in (1, 2, 3, 5, 6, 7, 42, 99)],
        )
        await db.commit()


# ── GitHub auth ───────────────────────────────────────────────────────────────

async def test_github_new_user_becomes_admin_when_first():
    user = await get_or_create_user_github("gh1", "alice@example.com", "Alice", "pic")
    assert user["role"] == "admin"
    assert user["approved"] == 1
    assert user["github_id"] == "gh1"


async def test_github_second_user_is_pending():
    await get_or_create_user("google1", "first@example.com", "First", "")
    user = await get_or_create_user_github("gh2", "second@example.com", "Second", "")
    assert user["role"] == "user"
    assert user["approved"] == 0


async def test_github_existing_by_github_id_updates_fields():
    u1 = await get_or_create_user_github("gh3", "old@example.com", "Old", "")
    u2 = await get_or_create_user_github("gh3", "new@example.com", "New", "newpic")
    assert u1["id"] == u2["id"]
    refreshed = await get_user_by_id(u1["id"])
    assert refreshed["email"] == "new@example.com"
    assert refreshed["name"] == "New"


async def test_google_existing_user_returns_updated_profile():
    """Regression: get_or_create_user must return the updated profile, not stale data.

    The function updated the DB but returned the pre-UPDATE row, so the login
    response showed the old name/picture for the entire session.
    """
    await get_or_create_user("gupdate1", "old@example.com", "Old Name", "old.jpg")
    u2 = await get_or_create_user("gupdate1", "new@example.com", "New Name", "new.jpg")
    assert u2["email"] == "new@example.com"
    assert u2["name"] == "New Name"
    assert u2["picture"] == "new.jpg"


async def test_github_existing_by_github_id_returns_updated_profile():
    """Regression: get_or_create_user_github must return the updated profile."""
    await get_or_create_user_github("ghupdate1", "old@g.com", "Old", "old.jpg")
    u2 = await get_or_create_user_github("ghupdate1", "new@g.com", "New", "new.jpg")
    assert u2["email"] == "new@g.com"
    assert u2["name"] == "New"
    assert u2["picture"] == "new.jpg"


async def test_github_links_to_existing_google_user_by_email():
    google_user = await get_or_create_user("g99", "shared@example.com", "Shared", "")
    gh_user = await get_or_create_user_github("gh4", "shared@example.com", "Shared2", "")
    assert gh_user["id"] == google_user["id"]
    refreshed = await get_user_by_id(google_user["id"])
    assert refreshed["github_id"] == "gh4"


async def test_github_no_email_does_not_link():
    await get_or_create_user("g100", "orphan@example.com", "Orphan", "")
    new_user = await get_or_create_user_github("gh5", "", "NoEmail", "")
    assert new_user["email"] == ""


# ── Apple auth ────────────────────────────────────────────────────────────────

async def test_apple_new_user_created():
    user = await get_or_create_user_apple("ap1", "apple@example.com", "Apple User")
    assert user["apple_id"] == "ap1"
    assert user["email"] == "apple@example.com"
    assert user["name"] == "Apple User"


async def test_apple_existing_by_apple_id_is_idempotent():
    u1 = await get_or_create_user_apple("ap2", "a@example.com", "A")
    u2 = await get_or_create_user_apple("ap2", "a@example.com", "A")
    assert u1["id"] == u2["id"]


async def test_apple_subsequent_login_empty_name_preserves_existing():
    await get_or_create_user_apple("ap3", "b@example.com", "Bob")
    # Apple doesn't send name on return logins
    u2 = await get_or_create_user_apple("ap3", "", "")
    assert u2["name"] == "Bob"
    assert u2["email"] == "b@example.com"


async def test_apple_links_to_existing_google_user_by_email():
    google_user = await get_or_create_user("g200", "link@example.com", "Google", "")
    apple_user = await get_or_create_user_apple("ap4", "link@example.com", "")
    assert apple_user["id"] == google_user["id"]


async def test_apple_existing_by_email_returns_updated_profile():
    # Regression: linking Apple ID to an existing account must return the
    # post-UPDATE profile (with apple_id set), not the stale pre-UPDATE row.
    await get_or_create_user("g202", "apple-link@example.com", "Google User", "")
    result = await get_or_create_user_apple("ap4b", "apple-link@example.com", "")
    assert result["apple_id"] == "ap4b"


async def test_apple_no_email_skips_linking():
    await get_or_create_user("g201", "existing@example.com", "Existing", "")
    new_user = await get_or_create_user_apple("ap5", "", "NoEmail")
    # Should create a new user, not link
    existing = await get_or_create_user("g201", "existing@example.com", "Existing", "")
    assert new_user["id"] != existing["id"]


# ── _new_user_role_approved helper ────────────────────────────────────────────

async def test_new_user_role_approved_first_user_gets_admin():
    """Regression #1343: first user ever must get role=admin, approved=1."""
    import aiosqlite
    import services.db as db_module
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        role, approved = await _new_user_role_approved(db)
    assert role == "admin"
    assert approved == 1


async def test_new_user_role_approved_subsequent_user_gets_user():
    """Regression #1343: second+ user must get role=user, approved=0."""
    await get_or_create_user("seed-g1", "seed@example.com", "Seed", "")
    import aiosqlite
    import services.db as db_module
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        role, approved = await _new_user_role_approved(db)
    assert role == "user"
    assert approved == 0


# ── User management ───────────────────────────────────────────────────────────

async def test_list_users_empty():
    assert await list_users() == []


async def test_list_users_returns_all():
    await get_or_create_user("g1", "a@example.com", "A", "")
    await get_or_create_user("g2", "b@example.com", "B", "")
    users = await list_users()
    assert len(users) == 2
    emails = {u["email"] for u in users}
    assert emails == {"a@example.com", "b@example.com"}


async def test_set_user_approved():
    user = await get_or_create_user("g10", "test@example.com", "Test", "")
    await set_user_approved(user["id"], True)
    refreshed = await get_user_by_id(user["id"])
    assert refreshed["approved"] == 1

    await set_user_approved(user["id"], False)
    refreshed = await get_user_by_id(user["id"])
    assert refreshed["approved"] == 0


async def test_set_user_role():
    user = await get_or_create_user("g11", "role@example.com", "Role", "")
    await set_user_role(user["id"], "admin")
    refreshed = await get_user_by_id(user["id"])
    assert refreshed["role"] == "admin"


async def test_delete_user():
    user = await get_or_create_user("g12", "del@example.com", "Del", "")
    await delete_user(user["id"])
    assert await get_user_by_id(user["id"]) is None


async def test_set_user_plan():
    user = await get_or_create_user("g13", "plan@example.com", "Plan", "")
    await set_user_plan(user["id"], "pro")
    refreshed = await get_user_by_id(user["id"])
    assert refreshed["plan"] == "pro"


# ── Translation cache with metadata ──────────────────────────────────────────

async def test_get_cached_translation_with_meta_returns_all_fields():
    await save_translation(1, 0, "en", ["Hello world"], provider="gemini", model="gemini-pro")
    result = await get_cached_translation_with_meta(1, 0, "en")
    assert result is not None
    assert result["paragraphs"] == ["Hello world"]
    assert result["provider"] == "gemini"
    assert result["model"] == "gemini-pro"
    assert result["title_translation"] is None


async def test_get_cached_translation_with_meta_with_title():
    await save_translation(2, 0, "de", ["Hallo Welt"], title_translation="Kapitel Eins")
    result = await get_cached_translation_with_meta(2, 0, "de")
    assert result["title_translation"] == "Kapitel Eins"


async def test_get_cached_translation_with_meta_missing_returns_none():
    assert await get_cached_translation_with_meta(999, 0, "en") is None


async def test_get_cached_translation_with_meta_null_provider():
    await save_translation(3, 0, "fr", ["Bonjour"])
    result = await get_cached_translation_with_meta(3, 0, "fr")
    assert result["provider"] is None
    assert result["model"] is None


# ── Annotations ───────────────────────────────────────────────────────────────

async def test_create_annotation():
    user = await get_or_create_user("g20", "ann@example.com", "Ann", "")
    ann = await create_annotation(user["id"], 1, 0, "Some sentence.", "My note", "yellow")
    assert ann["note_text"] == "My note"
    assert ann["color"] == "yellow"
    assert ann["sentence_text"] == "Some sentence."
    assert ann["user_id"] == user["id"]


async def test_create_annotation_conflict_updates_existing():
    user = await get_or_create_user("g21", "conflict@example.com", "C", "")
    a1 = await create_annotation(user["id"], 1, 0, "Sentence", "First note", "yellow")
    a2 = await create_annotation(user["id"], 1, 0, "Sentence", "Updated note", "green")
    assert a1["id"] == a2["id"]
    assert a2["note_text"] == "Updated note"
    assert a2["color"] == "green"


async def test_get_annotations_returns_user_annotations():
    user = await get_or_create_user("g22", "get@example.com", "G", "")
    await create_annotation(user["id"], 5, 0, "First", "Note1", "yellow")
    await create_annotation(user["id"], 5, 1, "Second", "Note2", "red")
    anns = await get_annotations(user["id"], 5)
    assert len(anns) == 2


async def test_get_annotations_isolated_by_user():
    u1 = await get_or_create_user("g23", "u1@example.com", "U1", "")
    u2 = await get_or_create_user("g24", "u2@example.com", "U2", "")
    await create_annotation(u1["id"], 7, 0, "Sent", "U1 note", "yellow")
    anns_u2 = await get_annotations(u2["id"], 7)
    assert anns_u2 == []


async def test_update_annotation():
    user = await get_or_create_user("g25", "upd@example.com", "Upd", "")
    ann = await create_annotation(user["id"], 1, 0, "Sentence", "Old", "yellow")
    updated = await update_annotation(ann["id"], user["id"], "New", "blue")
    assert updated is not None
    assert updated["note_text"] == "New"
    assert updated["color"] == "blue"


async def test_update_annotation_wrong_user_returns_none():
    u1 = await get_or_create_user("g26", "owner@example.com", "Owner", "")
    u2 = await get_or_create_user("g27", "other@example.com", "Other", "")
    ann = await create_annotation(u1["id"], 1, 0, "Sent", "Note", "yellow")
    result = await update_annotation(ann["id"], u2["id"], "Hack", "red")
    assert result is None


async def test_delete_annotation():
    user = await get_or_create_user("g28", "del2@example.com", "Del2", "")
    ann = await create_annotation(user["id"], 1, 0, "Del sent", "Note", "yellow")
    deleted = await delete_annotation(ann["id"], user["id"])
    assert deleted is True
    assert await get_annotations(user["id"], 1) == []


async def test_delete_annotation_wrong_user_returns_false():
    u1 = await get_or_create_user("g29", "own2@example.com", "Own2", "")
    u2 = await get_or_create_user("g30", "oth2@example.com", "Oth2", "")
    ann = await create_annotation(u1["id"], 1, 0, "Sent", "Note", "yellow")
    result = await delete_annotation(ann["id"], u2["id"])
    assert result is False


# ── Vocabulary ────────────────────────────────────────────────────────────────

async def test_save_word_creates_entry():
    user = await get_or_create_user("g40", "vocab@example.com", "Vocab", "")
    result = await save_word(user["id"], "Schadenfreude", 1, 0, "He felt Schadenfreude.")
    assert result["word"] == "schadenfreude"
    assert result["user_id"] == user["id"]


async def test_save_word_idempotent_vocabulary_entry():
    user = await get_or_create_user("g41", "vocab2@example.com", "Vocab2", "")
    r1 = await save_word(user["id"], "Weltanschauung", 1, 0, "Sentence 1.")
    r2 = await save_word(user["id"], "Weltanschauung", 1, 0, "Sentence 1.")
    assert r1["id"] == r2["id"]


async def test_save_word_multiple_occurrences():
    user = await get_or_create_user("g42", "vocab3@example.com", "V3", "")
    await save_word(user["id"], "Angst", 1, 0, "First sentence.")
    await save_word(user["id"], "Angst", 1, 1, "Second sentence.")
    vocab = await get_vocabulary(user["id"])
    assert len(vocab) == 1
    assert len(vocab[0]["occurrences"]) == 2


async def test_get_vocabulary_includes_occurrences():
    user = await get_or_create_user("g43", "vocab4@example.com", "V4", "")
    await save_word(user["id"], "Zeitgeist", 42, 3, "The Zeitgeist was clear.")
    vocab = await get_vocabulary(user["id"])
    assert vocab[0]["word"] == "zeitgeist"
    occ = vocab[0]["occurrences"][0]
    assert occ["book_id"] == 42
    assert occ["chapter_index"] == 3
    assert occ["sentence_text"] == "The Zeitgeist was clear."


async def test_delete_word():
    user = await get_or_create_user("g44", "vocab5@example.com", "V5", "")
    await save_word(user["id"], "Kindergarten", 1, 0, "In Kindergarten...")
    deleted = await delete_word(user["id"], "Kindergarten")
    assert deleted is True
    assert await get_vocabulary(user["id"]) == []


async def test_delete_word_cascades_to_word_occurrences():
    import aiosqlite
    user = await get_or_create_user("g44b", "vocab5b@example.com", "V5b", "")
    await save_word(user["id"], "Weltanschauung", 99, 0, "A Weltanschauung emerged.")
    vocab = await get_vocabulary(user["id"])
    vocab_id = vocab[0]["id"]
    assert len(vocab[0]["occurrences"]) == 1

    await delete_word(user["id"], "Weltanschauung")

    async with aiosqlite.connect(db_module.DB_PATH) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM word_occurrences WHERE vocabulary_id = ?", (vocab_id,)
        ) as cur:
            count = (await cur.fetchone())[0]
    assert count == 0


async def test_delete_word_nonexistent_returns_false():
    user = await get_or_create_user("g45", "vocab6@example.com", "V6", "")
    result = await delete_word(user["id"], "nonexistent")
    assert result is False


# ── Obsidian settings ─────────────────────────────────────────────────────────

async def test_obsidian_settings_roundtrip():
    user = await get_or_create_user("g50", "obsidian@example.com", "Obs", "")
    await update_obsidian_settings(user["id"], "enc-token", "user/repo", "/vault/notes")
    settings = await get_obsidian_settings(user["id"])
    assert settings["github_token"] == "enc-token"
    assert settings["obsidian_repo"] == "user/repo"
    assert settings["obsidian_path"] == "/vault/notes"


async def test_obsidian_settings_null_values():
    user = await get_or_create_user("g51", "obs2@example.com", "Obs2", "")
    settings = await get_obsidian_settings(user["id"])
    assert settings["github_token"] is None
    assert settings["obsidian_repo"] is None


# ── Book insights ─────────────────────────────────────────────────────────────

async def test_save_insight():
    user = await get_or_create_user("g60", "insight@example.com", "Ins", "")
    result = await save_insight(user["id"], 1, 0, "What is the theme?", "The theme is love.")
    assert result["question"] == "What is the theme?"
    assert result["answer"] == "The theme is love."
    assert result["book_id"] == 1
    assert result["chapter_index"] == 0


async def test_save_insight_null_chapter():
    user = await get_or_create_user("g61", "insight2@example.com", "Ins2", "")
    result = await save_insight(user["id"], 1, None, "Who wrote this?", "The author.")
    assert result["chapter_index"] is None


async def test_get_insights_returns_all_for_book():
    user = await get_or_create_user("g62", "insight3@example.com", "Ins3", "")
    await save_insight(user["id"], 5, 0, "Q1", "A1")
    await save_insight(user["id"], 5, 1, "Q2", "A2")
    await save_insight(user["id"], 6, 0, "Other book Q", "A")
    insights = await get_insights(user["id"], 5)
    assert len(insights) == 2
    questions = {i["question"] for i in insights}
    assert questions == {"Q1", "Q2"}


async def test_delete_insight():
    user = await get_or_create_user("g63", "insight4@example.com", "Ins4", "")
    ins = await save_insight(user["id"], 1, 0, "Q", "A")
    deleted = await delete_insight(ins["id"], user["id"])
    assert deleted is True
    assert await get_insights(user["id"], 1) == []


async def test_delete_insight_wrong_user_returns_false():
    u1 = await get_or_create_user("g64", "ins_own@example.com", "Own", "")
    u2 = await get_or_create_user("g65", "ins_oth@example.com", "Oth", "")
    ins = await save_insight(u1["id"], 1, 0, "Q", "A")
    result = await delete_insight(ins["id"], u2["id"])
    assert result is False


# ── delete_user cascade: uploaded books and all child data ────────────────────

async def test_delete_user_removes_owned_books_and_all_child_data():
    """delete_user() must delete books with owner_user_id=user and all related rows.
    SQLite FK cascade is OFF, so we rely on the explicit DELETE statements.
    """
    import aiosqlite
    owner = await get_or_create_user("g70", "owner416@example.com", "Owner", "")
    other = await get_or_create_user("g71", "other416@example.com", "Other", "")
    book_id = 416001

    # Insert an uploaded book owned by the user
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            """INSERT INTO books (id, title, authors, languages, subjects, download_count,
               cover, text, images, source, owner_user_id)
               VALUES (?, 'Owned', '[]', '["en"]', '[]', 0, '', '{}', '[]', 'upload', ?)""",
            (book_id, owner["id"]),
        )
        # Book-level child data
        await db.execute(
            "INSERT INTO translations (book_id, chapter_index, target_language, paragraphs) VALUES (?, 0, 'en', '[]')",
            (book_id,),
        )
        await db.execute(
            "INSERT INTO chapter_summaries (book_id, chapter_index, content) VALUES (?, 0, 'summary')",
            (book_id,),
        )
        # Cross-user data: another user's annotation and reading progress on the owned book
        await db.execute(
            "INSERT INTO annotations (user_id, book_id, chapter_index, sentence_text, note_text, color) VALUES (?, ?, 0, 'sent', '', 'yellow')",
            (other["id"], book_id),
        )
        await db.execute(
            "INSERT INTO user_reading_progress (user_id, book_id, chapter_index) VALUES (?, ?, 0)",
            (other["id"], book_id),
        )
        await db.execute(
            "INSERT INTO book_uploads (book_id, user_id, filename, file_size, format) VALUES (?, ?, 'f.epub', 100, 'epub')",
            (book_id, owner["id"]),
        )
        await db.commit()

    await delete_user(owner["id"])

    async with aiosqlite.connect(db_module.DB_PATH) as db:
        for table, col in [
            ("books", "id"),
            ("translations", "book_id"),
            ("chapter_summaries", "book_id"),
            ("annotations", "book_id"),
            ("user_reading_progress", "book_id"),
            ("book_uploads", "book_id"),
        ]:
            cur = await db.execute(
                f"SELECT COUNT(*) FROM {table} WHERE {col} = ?", (book_id,)
            )
            count = (await cur.fetchone())[0]
            assert count == 0, f"{table} still has rows for deleted owner's book (#{416})"


# ── save_book upload collision guard ─────────────────────────────────────────


async def test_save_book_does_not_overwrite_uploaded_private_book(tmp_db):
    """Regression #467: save_book with a Gutenberg book_id that matches an
    existing uploaded private book must be a no-op rather than wiping the
    user's private content via INSERT OR REPLACE.

    Scenario: user uploads a book (gets auto-id=X). Admin/user then fetches
    Gutenberg book X. Without the guard the INSERT OR REPLACE deletes the
    uploaded row (losing private content) and re-inserts without source='upload'
    or owner_user_id, making it publicly accessible."""
    import aiosqlite
    import json
    from services.db import save_book

    # Create the owner user first — FK enforcement (issue #748) requires
    # books.owner_user_id to reference a real user.
    from services.db import get_or_create_user
    owner = await get_or_create_user("priv-owner", "priv@ex.com", "Owner", "")

    # Manually insert an uploaded private book at a known ID.
    private_book_id = 9990
    private_text = "SECRET private content"
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            """INSERT INTO books (id, title, authors, languages, subjects,
                                  download_count, cover, text, images, source, owner_user_id)
               VALUES (?, 'Private', '[]', '[]', '[]', 0, '', ?, '[]', 'upload', ?)""",
            (private_book_id, private_text, owner["id"]),
        )
        await db.commit()

    # Now simulate fetching the same ID from Gutenberg.
    await save_book(private_book_id, {
        "title": "Gutenberg Book",
        "authors": ["Public Author"],
        "languages": ["en"],
        "subjects": [],
        "download_count": 100,
        "cover": "",
    }, "PUBLIC Gutenberg text")

    # The uploaded private book must still be intact.
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        async with db.execute(
            "SELECT source, owner_user_id, text FROM books WHERE id=?",
            (private_book_id,),
        ) as cur:
            row = await cur.fetchone()

    assert row is not None, "Book row was deleted — save_book wiped the uploaded book"
    assert row[0] == "upload", (
        f"source changed from 'upload' to '{row[0]}' — private book overwritten by Gutenberg"
    )
    assert row[1] == 1, "owner_user_id was cleared — private book lost its owner"
    assert row[2] == private_text, "Private book text was overwritten with Gutenberg content"


# ── get_vocabulary single-query join (Issue #470) ────────────────────────────

async def test_get_vocabulary_multiple_words_multiple_occurrences(tmp_db):
    """Regression #470: get_vocabulary must return all words with all occurrences intact
    after switching from N+1 queries to a single JOIN query.

    Covers: two words each with two occurrences, ordering by word (alphabetical),
    and words with no occurrences (LEFT JOIN must not drop them).
    """
    user = await get_or_create_user("g_n1a", "n1a@test.com", "N1", "")

    await save_word(user["id"], "Zeitgeist", 1, 0, "First zeitgeist sentence.")
    await save_word(user["id"], "Zeitgeist", 1, 1, "Second zeitgeist sentence.")
    await save_word(user["id"], "Angst", 2, 0, "First angst sentence.")
    await save_word(user["id"], "Angst", 2, 1, "Second angst sentence.")

    vocab = await get_vocabulary(user["id"])

    assert len(vocab) == 2, f"Expected 2 words, got {len(vocab)}"

    # Words must be sorted alphabetically (angst before zeitgeist)
    assert vocab[0]["word"] == "angst", f"Expected 'angst' first, got '{vocab[0]['word']}'"
    assert vocab[1]["word"] == "zeitgeist", f"Expected 'zeitgeist' second, got '{vocab[1]['word']}'"

    assert len(vocab[0]["occurrences"]) == 2, (
        f"'angst' should have 2 occurrences, got {len(vocab[0]['occurrences'])}"
    )
    assert len(vocab[1]["occurrences"]) == 2, (
        f"'zeitgeist' should have 2 occurrences, got {len(vocab[1]['occurrences'])}"
    )

    # Occurrence fields must all be present
    occ = vocab[1]["occurrences"][0]
    assert occ["book_id"] == 1
    assert occ["chapter_index"] == 0
    assert occ["sentence_text"] == "First zeitgeist sentence."
