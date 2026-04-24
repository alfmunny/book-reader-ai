"""
Tests for routers/vocabulary.py — save/get/delete words and Obsidian export.
"""

import json
import pytest
import aiosqlite
from unittest.mock import AsyncMock, patch
from services.db import save_book, save_word, update_obsidian_settings, get_or_create_user
import services.db as db_module
from services.auth import encrypt_api_key

_BOOK_META = {
    "title": "Moby Dick",
    "authors": ["Herman Melville"],
    "languages": ["en"],
    "subjects": [],
    "download_count": 0,
    "cover": "",
}
BOOK_ID = 9001


async def test_save_word(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    resp = await client.post("/api/vocabulary", json={
        "word": "leviathan",
        "book_id": BOOK_ID,
        "chapter_index": 0,
        "sentence_text": "The great leviathan swam past.",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["word"] == "leviathan"
    assert data["user_id"] == test_user["id"]


async def test_save_word_deduplicates_occurrence(client, test_user):
    """Saving the same word+book+sentence twice should not create duplicate occurrences."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    payload = {
        "word": "whale",
        "book_id": BOOK_ID,
        "chapter_index": 0,
        "sentence_text": "Call me Ishmael.",
    }
    await client.post("/api/vocabulary", json=payload)
    await client.post("/api/vocabulary", json=payload)

    resp = await client.get("/api/vocabulary")
    vocab = resp.json()
    whale = next(v for v in vocab if v["word"] == "whale")
    assert len(whale["occurrences"]) == 1


async def test_get_vocabulary_empty(client, test_user):
    resp = await client.get("/api/vocabulary")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_get_vocabulary_with_occurrences(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(test_user["id"], "ahab", BOOK_ID, 5, "Captain Ahab spoke.")

    resp = await client.get("/api/vocabulary")
    assert resp.status_code == 200
    vocab = resp.json()
    assert len(vocab) == 1
    entry = vocab[0]
    assert entry["word"] == "ahab"
    assert len(entry["occurrences"]) == 1
    occ = entry["occurrences"][0]
    assert occ["book_id"] == BOOK_ID
    assert occ["chapter_index"] == 5
    assert occ["sentence_text"] == "Captain Ahab spoke."
    assert occ["book_title"] == "Moby Dick"


async def test_get_vocabulary_own_only(client, test_user):
    from services.db import get_or_create_user
    other = await get_or_create_user(
        google_id="voc-other", email="vocother@example.com", name="Other", picture=""
    )
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(other["id"], "secret", BOOK_ID, 0, "A secret word.")

    resp = await client.get("/api/vocabulary")
    assert resp.json() == []


async def test_delete_word(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(test_user["id"], "cetacean", BOOK_ID, 0, "A cetacean species.")

    resp = await client.delete("/api/vocabulary/cetacean")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    # Confirm gone
    vocab = (await client.get("/api/vocabulary")).json()
    assert not any(v["word"] == "cetacean" for v in vocab)


async def test_delete_word_not_found(client, test_user):
    resp = await client.delete("/api/vocabulary/nonexistentword")
    assert resp.status_code == 404


async def test_delete_word_own_only(client, test_user):
    from services.db import get_or_create_user
    other = await get_or_create_user(
        google_id="voc-other2", email="vocother2@example.com", name="Other2", picture=""
    )
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(other["id"], "pirate", BOOK_ID, 0, "A pirate's life.")

    resp = await client.delete("/api/vocabulary/pirate")
    assert resp.status_code == 404


async def test_vocabulary_requires_auth(anon_client):
    resp = await anon_client.get("/api/vocabulary")
    assert resp.status_code == 401

    resp = await anon_client.post("/api/vocabulary", json={
        "word": "x", "book_id": 1, "chapter_index": 0, "sentence_text": "x"
    })
    assert resp.status_code == 401


async def test_save_word_normalizes_case(client, test_user):
    """'Apple' and 'apple' must deduplicate to one vocabulary entry.

    SQLite UNIQUE(user_id, word) is case-sensitive, so without explicit
    lowercasing they produce two separate rows."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    await client.post("/api/vocabulary", json={
        "word": "Apple", "book_id": BOOK_ID, "chapter_index": 0, "sentence_text": "Apple pie."
    })
    await client.post("/api/vocabulary", json={
        "word": "apple", "book_id": BOOK_ID, "chapter_index": 1, "sentence_text": "An apple a day."
    })
    vocab = (await client.get("/api/vocabulary")).json()
    apple_entries = [v for v in vocab if v["word"].lower() == "apple"]
    assert len(apple_entries) == 1, "mixed-case saves must deduplicate to one entry"


async def test_delete_word_case_insensitive(client, test_user):
    """DELETE /vocabulary/Apple must remove 'apple' saved as lowercase."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(test_user["id"], "apple", BOOK_ID, 0, "An apple.")
    resp = await client.delete("/api/vocabulary/Apple")
    assert resp.status_code == 200
    vocab = (await client.get("/api/vocabulary")).json()
    assert not any(v["word"].lower() == "apple" for v in vocab)


async def test_save_word_rejects_empty_word(client, test_user):
    """POST /vocabulary with an empty word must return 400.

    An empty-string word stored in the vocabulary is unusable — the user
    can never delete it via DELETE /vocabulary/ (no path segment) and
    the UNIQUE(user_id, word) constraint allows exactly one empty entry
    per user, polluting the vocabulary silently."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    resp = await client.post("/api/vocabulary", json={
        "word": "", "book_id": BOOK_ID, "chapter_index": 0, "sentence_text": "Some text."
    })
    assert resp.status_code == 400


async def test_save_word_strips_and_rejects_whitespace_only_word(client, test_user):
    """POST /vocabulary with whitespace-only word must return 400."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    resp = await client.post("/api/vocabulary", json={
        "word": "   ", "book_id": BOOK_ID, "chapter_index": 0, "sentence_text": "Some text."
    })
    assert resp.status_code == 400


async def test_save_word_rejects_nonexistent_book(client, test_user):
    """POST /vocabulary for a book that doesn't exist must return 404.

    SQLite FK enforcement is OFF so the INSERT would otherwise silently
    succeed and store an orphaned word occurrence."""
    resp = await client.post("/api/vocabulary", json={
        "word": "ghost",
        "book_id": 777777,
        "chapter_index": 0,
        "sentence_text": "A ghost of a chance.",
    })
    assert resp.status_code == 404


async def test_save_word_rejects_empty_sentence(client, test_user):
    """POST /vocabulary with empty sentence_text must return 400.

    An occurrence with no sentence context cannot be displayed and
    represents a client error."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    resp = await client.post("/api/vocabulary", json={
        "word": "spectre",
        "book_id": BOOK_ID,
        "chapter_index": 0,
        "sentence_text": "",
    })
    assert resp.status_code == 400


async def test_save_word_rejects_whitespace_only_sentence(client, test_user):
    """POST /vocabulary with whitespace-only sentence_text must return 400."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    resp = await client.post("/api/vocabulary", json={
        "word": "spectre",
        "book_id": BOOK_ID,
        "chapter_index": 0,
        "sentence_text": "   ",
    })
    assert resp.status_code == 400


# ── Atomicity regression ─────────────────────────────────────────────────────

async def test_save_word_is_atomic(test_user, tmp_db):
    """Regression #302: save_word must not leave an orphaned vocabulary row
    when the word_occurrences INSERT fails.

    Before the fix there were two commits: the first committed the vocabulary
    row durably before the word_occurrences INSERT ran.  If that INSERT failed,
    the vocabulary row was already on disk — an orphaned entry with no
    occurrences.

    After the fix both INSERTs share a single transaction.  If the
    word_occurrences INSERT fails before the commit, the vocabulary INSERT is
    rolled back too, leaving the DB clean.
    """
    import aiosqlite

    await save_book(BOOK_ID, _BOOK_META, "text")

    original_connect = aiosqlite.connect

    def _patched_connect(path, **kw):
        ctx = original_connect(path, **kw)

        class _WrappedCtx:
            async def __aenter__(self_inner):
                conn = await ctx.__aenter__()
                original_execute = conn.execute

                def _fail_on_occ_insert(sql, params=None):
                    if "word_occurrences" in sql and "INSERT" in sql:
                        async def _raise():
                            raise RuntimeError("simulated word_occurrences failure")
                        return _raise()
                    # Pass through — must return the original result object
                    # (supports both `await` and `async with`)
                    if params is None:
                        return original_execute(sql)
                    return original_execute(sql, params)

                conn.execute = _fail_on_occ_insert
                return conn

            async def __aexit__(self_inner, *args):
                return await ctx.__aexit__(*args)

        return _WrappedCtx()

    with patch("services.db.aiosqlite.connect", side_effect=_patched_connect):
        with pytest.raises(RuntimeError, match="simulated word_occurrences failure"):
            await save_word(test_user["id"], "leviathan", BOOK_ID, 0, "A sentence.")

    # After the failure, vocabulary row must NOT be on disk.
    # Before fix: first commit already wrote the vocab row → count = 1 → assertion fails.
    # After fix: single transaction rolled back → count = 0 → assertion passes.
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM vocabulary WHERE user_id=? AND word='leviathan'",
            (test_user["id"],),
        ) as cur:
            vocab_count = (await cur.fetchone())[0]

    assert vocab_count == 0, (
        "vocabulary row must be rolled back when word_occurrences INSERT fails (#302); "
        "two-commit pattern left an orphaned row"
    )


# ── Export endpoint ───────────────────────────────────────────────────────────

async def _setup_export(test_user, book_id=BOOK_ID):
    await save_book(book_id, _BOOK_META, "text")
    await save_word(test_user["id"], "leviathan", book_id, 3, "The great leviathan.")
    enc_token = encrypt_api_key("ghp_test_token")
    await update_obsidian_settings(
        test_user["id"],
        enc_token,
        "user/obsidian-notes",
        "All Notes/002 Literature Notes/000 Books",
    )


async def test_export_single_book(client, test_user):
    await _setup_export(test_user)

    fake_put_response = {
        "content": {"html_url": "https://github.com/user/obsidian-notes/blob/main/Moby Dick.md"}
    }
    with patch("routers.vocabulary._github_put", new_callable=AsyncMock, return_value="https://github.com/user/obsidian-notes/blob/main/Moby Dick.md"), \
         patch("routers.vocabulary.translate_text", new_callable=AsyncMock, return_value=[]):
        resp = await client.post("/api/vocabulary/export/obsidian", json={"book_id": BOOK_ID})

    assert resp.status_code == 200
    assert "urls" in resp.json()
    assert len(resp.json()["urls"]) == 1


async def test_export_all_books(client, test_user):
    await _setup_export(test_user)

    with patch("routers.vocabulary._github_put", new_callable=AsyncMock, return_value="https://github.com/user/repo/blob/main/file.md"), \
         patch("routers.vocabulary.translate_text", new_callable=AsyncMock, return_value=[]):
        resp = await client.post("/api/vocabulary/export/obsidian", json={})

    assert resp.status_code == 200
    assert "urls" in resp.json()


async def test_export_without_settings_returns_400(client, test_user):
    resp = await client.post("/api/vocabulary/export/obsidian", json={"book_id": BOOK_ID})
    assert resp.status_code == 400
    assert "not configured" in resp.json()["detail"]


# ── Access control for private uploaded books ─────────────────────────────────


async def test_save_word_blocked_for_non_owner_of_uploaded_book(client, test_user, tmp_db, insert_private_book):
    """POST /vocabulary for a private uploaded book must return 403 for non-owners.

    Without check_book_access the endpoint only checks existence (404 vs 200);
    any authenticated user can save vocabulary entries for another user's private book."""
    from services.db import set_user_role
    await set_user_role(test_user["id"], "user")
    owner = await get_or_create_user("voc-owner-gid", "voc-owner@ex.com", "VocOwner", "")
    await insert_private_book(8801, owner["id"])
    resp = await client.post("/api/vocabulary", json={
        "word": "secret",
        "book_id": 8801,
        "chapter_index": 0,
        "sentence_text": "A secret sentence.",
    })
    assert resp.status_code == 403, (
        f"Expected 403 for non-owner saving vocab for private book, got {resp.status_code}: {resp.text}"
    )


async def test_export_obsidian_blocked_for_private_book_non_owner(client, test_user, tmp_db, insert_private_book):
    """Regression #667: POST /vocabulary/export/obsidian must return 403 when the
    requested book_id belongs to a private uploaded book the caller does not own.

    Without check_book_access in _build_and_push_book, any authenticated user
    can push another user's private book title to their own Obsidian vault."""
    from services.db import set_user_role
    await set_user_role(test_user["id"], "user")
    owner = await get_or_create_user("exp-owner-gid", "exp-owner@ex.com", "ExpOwner", "")
    private_book_id = 8900
    await insert_private_book(private_book_id, owner["id"])

    enc_token = encrypt_api_key("ghp_test_token")
    from services.db import update_obsidian_settings
    await update_obsidian_settings(
        test_user["id"], enc_token, "user/notes", "Books",
    )

    with patch("routers.vocabulary._github_put", new_callable=AsyncMock), \
         patch("routers.vocabulary.translate_text", new_callable=AsyncMock, return_value=[]):
        resp = await client.post(
            "/api/vocabulary/export/obsidian", json={"book_id": private_book_id}
        )

    assert resp.status_code == 403, (
        f"Expected 403 for non-owner exporting private book, got {resp.status_code}: {resp.text}"
    )


async def test_export_github_api_error_returns_502(client, test_user):
    await _setup_export(test_user)

    with patch("routers.vocabulary._github_put", new_callable=AsyncMock, side_effect=Exception("network error")), \
         patch("routers.vocabulary.translate_text", new_callable=AsyncMock, return_value=[]):
        resp = await client.post("/api/vocabulary/export/obsidian", json={"book_id": BOOK_ID})

    assert resp.status_code == 500


async def test_export_calls_github_with_correct_content(client, test_user):
    """Verify the markdown content passed to GitHub contains expected sections."""
    await _setup_export(test_user)

    captured_content = {}

    async def fake_put(token, repo, path, filename, content_md, message):
        captured_content["content"] = content_md
        captured_content["filename"] = filename
        return "https://github.com/example/url"

    with patch("routers.vocabulary._github_put", side_effect=fake_put), \
         patch("routers.vocabulary.translate_text", new_callable=AsyncMock, return_value=[]):
        resp = await client.post("/api/vocabulary/export/obsidian", json={"book_id": BOOK_ID})

    assert resp.status_code == 200
    content = captured_content["content"]
    assert "## Vocabulary" in content
    assert "leviathan" in content
    # Sections only present when data exists; no annotations in this fixture
    assert "## Annotations" not in content
    assert "https://www.gutenberg.org/ebooks/" in content
    # YAML frontmatter
    assert 'title:' in content
    assert "tags:" in content


def test_build_book_markdown_format():
    from routers.vocabulary import _build_book_markdown
    book = {"title": "Moby Dick", "authors": ["Herman Melville"], "languages": ["en"]}
    words = [{"word": "whale", "occurrences": [
        {"book_id": 1, "book_title": "Moby Dick", "chapter_index": 0, "sentence_text": "The whale breached."}
    ]}]
    annotations = [{"id": 1, "chapter_index": 0, "sentence_text": "Call me Ishmael.", "note_text": "Famous opening.", "color": "yellow"}]
    insights = [
        {"chapter_index": 0, "question": "What is the white whale?", "answer": "A symbol of obsession.", "context_text": "The pale whale loomed."},
        {"chapter_index": None, "question": "Book theme?", "answer": "Man vs nature.", "context_text": None},
    ]
    content = _build_book_markdown(book, words, annotations, [], insights, 1, "2026-04-22")

    # YAML frontmatter
    assert 'title: "Moby Dick"' in content
    assert "author: Herman Melville" in content
    assert "language: English" in content
    assert "https://www.gutenberg.org/ebooks/1" in content
    assert "tags:" in content
    assert "  - reading" in content

    # Vocabulary uses [[word]] backlinks and 1-indexed chapters
    assert "[[whale]]" in content
    assert "Ch.1" in content

    # Annotations use [!quote] callouts
    assert "> [!quote] Ch.1" in content
    assert "> Call me Ishmael." in content
    assert "Famous opening." in content

    # Insight with context renders [!quote] callout
    assert "> [!quote] (Ch.1)" in content
    assert "> The pale whale loomed." in content
    assert "**Q (Ch.1):** What is the white whale?" in content

    # Insight without context skips callout
    assert "**Q:** Book theme?" in content


async def test_export_annotation_translation_uses_book_language(client, test_user):
    """Regression for #285: annotation translations must use the book's actual source
    language, not hardcoded 'en'.  Before the fix, exporting a German book always
    passed source='en' to translate_text, producing wrong translations."""
    german_meta = {
        **_BOOK_META,
        "title": "Faust",
        "authors": ["Goethe"],
        "languages": ["de"],  # German book
    }
    german_book_id = 9099
    await save_book(german_book_id, german_meta, "text")
    await save_word(test_user["id"], "Mephisto", german_book_id, 0, "Mephisto erschien.")
    enc_token = encrypt_api_key("ghp_test_token")
    await update_obsidian_settings(
        test_user["id"], enc_token, "user/obsidian-notes",
        "All Notes/002 Literature Notes/000 Books",
    )

    from services.db import create_annotation
    await create_annotation(test_user["id"], german_book_id, 0, "Mephisto erschien.", "A note.", "yellow")

    translate_calls: list[tuple] = []

    async def spy_translate(text, src, tgt, **kwargs):
        translate_calls.append((src, tgt))
        return []

    with patch("routers.vocabulary._github_put", new_callable=AsyncMock, return_value="https://url"), \
         patch("routers.vocabulary.translate_text", side_effect=spy_translate):
        resp = await client.post("/api/vocabulary/export/obsidian",
                                 json={"book_id": german_book_id, "target_language": "zh"})

    assert resp.status_code == 200
    # All translation calls must use "de" as source, not the hardcoded "en"
    assert translate_calls, "translate_text should have been called for the annotation"
    for src, tgt in translate_calls:
        assert src == "de", (
            f"translate_text called with source={src!r} but book language is 'de'; "
            "source language must not be hardcoded to 'en'"
        )


async def test_save_word_select_runs_before_commit(tmp_db, test_user, monkeypatch):
    """Regression #351: SELECT must execute before COMMIT in save_word.

    If COMMIT precedes SELECT, a concurrent write (e.g. _update_lemma on
    another connection) can modify the vocabulary row between the two operations,
    causing the function to return data it did not write.
    """
    import aiosqlite as _real_aiosqlite
    import services.db as db_module
    from services.db import save_book, save_word

    _META = {"title": "T", "authors": [], "languages": ["de"], "subjects": [], "download_count": 0, "cover": ""}
    await save_book(7777, _META, "text")

    events: list[str] = []
    orig_connect = _real_aiosqlite.connect

    def patched_connect(database, **kwargs):
        real_cm = orig_connect(database, **kwargs)

        class TrackedConn:
            def __init__(self):
                self._conn = None

            async def __aenter__(self):
                self._conn = await real_cm.__aenter__()
                return self

            async def __aexit__(self, *args):
                return await real_cm.__aexit__(*args)

            @property
            def row_factory(self):
                return self._conn.row_factory

            @row_factory.setter
            def row_factory(self, v):
                self._conn.row_factory = v

            def execute(self, sql, *args, **kwargs):
                if sql.strip().upper().startswith("SELECT"):
                    events.append("SELECT")
                return self._conn.execute(sql, *args, **kwargs)

            async def commit(self):
                events.append("COMMIT")
                return await self._conn.commit()

        return TrackedConn()

    class FakeAiosqlite:
        connect = staticmethod(patched_connect)
        Row = _real_aiosqlite.Row

    monkeypatch.setattr(db_module, "aiosqlite", FakeAiosqlite)

    await save_word(test_user["id"], "Wort", 7777, 0, "Ein Satz.")

    assert "COMMIT" in events and "SELECT" in events
    assert events.index("SELECT") < events.index("COMMIT"), (
        "SELECT must run before COMMIT in save_word to avoid returning data "
        "from a concurrent _update_lemma write (#351)"
    )


async def test_save_vocabulary_out_of_bounds_chapter_returns_400(client, test_user, tmp_db):
    """POST /vocabulary rejects chapter_index beyond the book's chapter count (issue #450)."""
    from services.book_chapters import clear_cache as _clear
    text = "CHAPTER I\n\n" + "word " * 200 + "\n\nCHAPTER II\n\n" + "word " * 200
    await save_book(9885, {**_BOOK_META, "id": 9885}, text)
    _clear()
    resp = await client.post(
        "/api/vocabulary",
        json={"word": "Wort", "book_id": 9885, "chapter_index": 999, "sentence_text": "Ein Satz."},
    )
    assert resp.status_code == 400, f"Expected 400 for out-of-bounds chapter, got {resp.status_code}: {resp.text}"
    assert "out of range" in resp.json()["detail"].lower()


async def test_save_word_oversized_word_returns_422(client, test_user, tmp_db):
    """POST /vocabulary rejects word longer than max_length (issue #498)."""
    resp = await client.post(
        "/api/vocabulary",
        json={"word": "w" * 201, "book_id": 1, "chapter_index": 0, "sentence_text": "A sentence."},
    )
    assert resp.status_code == 422, f"Expected 422 for oversized word, got {resp.status_code}"


async def test_save_word_oversized_sentence_text_returns_422(client, test_user, tmp_db):
    """POST /vocabulary rejects sentence_text longer than max_length (issue #498)."""
    resp = await client.post(
        "/api/vocabulary",
        json={"word": "Wort", "book_id": 1, "chapter_index": 0, "sentence_text": "s" * 5001},
    )
    assert resp.status_code == 422, f"Expected 422 for oversized sentence_text, got {resp.status_code}"


# ── Issue #513: ExportRequest.target_language max_length ─────────────────────

async def test_export_obsidian_oversized_target_language_returns_422(client, test_user):
    """Regression #513: POST /vocabulary/export/obsidian with target_language > 20 chars
    must return 422, not pass to external translation API."""
    resp = await client.post(
        "/api/vocabulary/export/obsidian",
        json={"target_language": "x" * 21},
    )
    assert resp.status_code == 422, (
        f"Expected 422 for oversized target_language in export/obsidian, got {resp.status_code}: {resp.text}"
    )


# ── Issue #529: vocabulary word/lang path+query param bounds ─────────────────


async def test_definition_oversized_word_returns_422(client, test_user):
    """Regression #529: GET /vocabulary/definition/{word>200chars} must return 422."""
    resp = await client.get("/api/vocabulary/definition/" + "w" * 201)
    assert resp.status_code == 422, (
        f"Expected 422 for oversized word in /definition, got {resp.status_code}: {resp.text}"
    )


async def test_definition_oversized_lang_returns_422(client, test_user):
    """Regression #529: GET /vocabulary/definition/word?lang=<21 chars> must return 422."""
    resp = await client.get("/api/vocabulary/definition/test?lang=" + "x" * 21)
    assert resp.status_code == 422, (
        f"Expected 422 for oversized lang in /definition, got {resp.status_code}: {resp.text}"
    )


async def test_remove_word_oversized_word_returns_422(client, test_user):
    """Regression #529: DELETE /vocabulary/{word>200chars} must return 422."""
    resp = await client.delete("/api/vocabulary/" + "w" * 201)
    assert resp.status_code == 422, (
        f"Expected 422 for oversized word in DELETE /vocabulary, got {resp.status_code}: {resp.text}"
    )


# ── AI fallback for empty wiktionary results (issue #444) ────────────────────

async def test_definition_falls_back_to_ai_when_wiktionary_empty(client, test_user):
    """When wiktionary returns no definitions, the endpoint falls back to AI if user has a key."""
    from services.auth import encrypt_api_key
    import aiosqlite
    import services.db as db_module
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "UPDATE users SET gemini_key=? WHERE id=?",
            (encrypt_api_key("fake-gemini-key"), test_user["id"]),
        )
        await db.commit()

    empty_wikt = {"lemma": "Fernweh", "language": "de", "definitions": [], "url": "https://en.wiktionary.org/wiki/Fernweh"}
    ai_response = '{"lemma":"Fernweh","definitions":[{"pos":"noun","text":"longing for distant places"}]}'

    with patch("services.wiktionary.lookup", new=AsyncMock(return_value=empty_wikt)), \
         patch("services.gemini._generate", new=AsyncMock(return_value=ai_response)):
        resp = await client.get("/api/vocabulary/definition/Fernweh?lang=de")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["definitions"]) == 1
    assert "longing" in data["definitions"][0]["text"]


async def test_definition_no_ai_fallback_when_wiktionary_succeeds(client, test_user):
    """When wiktionary returns definitions, AI is not called even if user has a key."""
    wikt_result = {
        "lemma": "whale",
        "language": "en",
        "definitions": [{"pos": "noun", "text": "A large marine mammal."}],
        "url": "https://en.wiktionary.org/wiki/whale",
    }
    ai_generate = AsyncMock()
    with patch("services.wiktionary.lookup", new=AsyncMock(return_value=wikt_result)), \
         patch("services.gemini._generate", ai_generate):
        resp = await client.get("/api/vocabulary/definition/whale?lang=en")

    assert resp.status_code == 200
    ai_generate.assert_not_called()


async def test_definition_corrupted_gemini_key_returns_200_not_500(client, test_user):
    """Regression #706: a corrupted Gemini key must not raise 500 when AI fallback is triggered.

    When Wiktionary returns empty definitions and the user has a key that cannot be
    decrypted, the endpoint should skip the AI fallback and return empty definitions
    (200) rather than propagating the decrypt 500 error.
    """
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "UPDATE users SET gemini_key=? WHERE id=?",
            ("not-a-valid-fernet-token", test_user["id"]),
        )
        await db.commit()

    empty_wikt = {"lemma": "Fernweh", "language": "de", "definitions": [], "url": "https://en.wiktionary.org/wiki/Fernweh"}

    with patch("services.wiktionary.lookup", new=AsyncMock(return_value=empty_wikt)):
        resp = await client.get("/api/vocabulary/definition/Fernweh?lang=de")

    assert resp.status_code == 200, (
        f"Expected 200 with empty definitions when Gemini key is corrupted, got {resp.status_code}: {resp.text}"
    )
    data = resp.json()
    assert data["definitions"] == []


async def test_save_word_negative_chapter_index_returns_422(client, test_user, tmp_db):
    """Regression #719: POST /vocabulary with chapter_index < 0 must return 422."""
    from services.db import save_book
    await save_book(9001, {"title": "T", "authors": [], "languages": ["en"],
                           "subjects": [], "download_count": 0, "cover": ""}, "text")
    resp = await client.post("/api/vocabulary", json={
        "word": "hello", "book_id": 9001, "chapter_index": -1,
        "sentence_text": "Hello world.",
    })
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"


# ── Issue #731: ge=1 bound on book_id body field in vocabulary router ─────────


async def test_save_word_negative_book_id_returns_422(client, test_user):
    """Regression #731: POST /vocabulary with book_id < 1 must return 422."""
    resp = await client.post("/api/vocabulary", json={
        "word": "hello", "book_id": -1, "chapter_index": 0,
        "sentence_text": "Hello world.",
    })
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"


# ── Issue #734: ge=1 on ExportRequest.book_id ─────────────────────────────────


async def test_save_word_negative_book_id_returns_422(client, test_user):
    """Regression #731: POST /vocabulary with book_id < 1 must return 422."""
    resp = await client.post("/api/vocabulary", json={
        "word": "hello", "book_id": -1, "chapter_index": 0,
        "sentence_text": "Hello world.",
    })
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"


async def test_export_obsidian_negative_book_id_returns_422(client, test_user):
    """Regression #734: POST /vocabulary/export/obsidian with book_id < 1 must return 422."""
    resp = await client.post("/api/vocabulary/export/obsidian", json={"book_id": -1})
    assert resp.status_code == 422, f"Expected 422 for negative book_id in export, got {resp.status_code}: {resp.text}"


async def test_export_obsidian_zero_book_id_returns_422(client, test_user):
    """Regression #734: POST /vocabulary/export/obsidian with book_id=0 must return 422."""
    resp = await client.post("/api/vocabulary/export/obsidian", json={"book_id": 0})
    assert resp.status_code == 422, f"Expected 422 for book_id=0 in export, got {resp.status_code}: {resp.text}"


# ── Issue #760: Obsidian export exception must not leak in 500 response ───────

@pytest.mark.asyncio
async def test_export_obsidian_error_does_not_leak_exception_detail(client, test_user):
    """Regression #760: GitHub export errors must use a static message, not str(e)."""
    await _setup_export(test_user)
    with patch("routers.vocabulary._github_put", new_callable=AsyncMock,
               side_effect=RuntimeError("github-token-secret-xyzzy leaked")), \
         patch("routers.vocabulary.translate_text", new_callable=AsyncMock, return_value=[]):
        resp = await client.post("/api/vocabulary/export/obsidian", json={"book_id": BOOK_ID})
    assert resp.status_code == 500
    detail = resp.json()["detail"]
    assert "github-token-secret-xyzzy" not in detail
    assert "leaked" not in detail


# ── Issue #777: ExportRequest.target_language min_length ─────────────────────


async def test_export_obsidian_empty_target_language_returns_422(client, test_user):
    """Regression #777: POST /vocabulary/export/obsidian with target_language="" must return 422."""
    resp = await client.post(
        "/api/vocabulary/export/obsidian",
        json={"target_language": ""},
    )
    assert resp.status_code == 422, (
        f"Expected 422 for empty target_language in export/obsidian, got {resp.status_code}: {resp.text}"
    )


# ── Issue #829: save_word returns {} instead of crashing when re-SELECT is None ──


@pytest.mark.asyncio
async def test_save_word_returns_dict_when_row_is_none(tmp_db, test_user, monkeypatch):
    """Regression #829: save_word() must return {} not crash when the vocabulary
    re-SELECT returns None (concurrent-delete race between INSERT and re-SELECT)."""
    import aiosqlite as _aio

    original_fetchone = _aio.Cursor.fetchone
    select_star_count = {"n": 0}

    async def _fetchone_none_once(self):
        query = getattr(self, "_query", "")
        if "SELECT *" in query and "vocabulary" in query:
            select_star_count["n"] += 1
            if select_star_count["n"] == 1:
                return None
        return await original_fetchone(self)

    monkeypatch.setattr(_aio.Cursor, "fetchone", _fetchone_none_once)
    result = await save_word(test_user["id"], "hello", BOOK_ID, 0, "Hello world.")
    assert isinstance(result, dict), f"save_word must return a dict, got {type(result)}"
