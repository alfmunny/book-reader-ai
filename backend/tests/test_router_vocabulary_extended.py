"""
Extended tests for routers/vocabulary.py covering uncovered lines:
- _github_put (lines 70-94): new file, update existing file (sha), GitHub errors
- _build_book_markdown helpers: annotation translations, insights, connected books
- _build_word_markdown
- _find_connected_books
- export_obsidian: word notes export, HTTPException re-raise, generic exception handling
- save word duplicate in same chapter (slightly different sentence)
"""

import base64
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from fastapi import HTTPException

from services.auth import encrypt_api_key
from services.db import save_book, save_word, update_obsidian_settings, create_annotation

from routers.vocabulary import (
    _build_book_markdown,
    _build_word_markdown,
    _find_connected_books,
    _github_put,
)


_BOOK_META = {
    "title": "Moby Dick",
    "authors": ["Herman Melville"],
    "languages": ["en"],
    "subjects": [],
    "download_count": 0,
    "cover": "",
}
BOOK_ID = 9100
BOOK_ID_2 = 9101


# ── _github_put direct tests ──────────────────────────────────────────────────

async def test_github_put_creates_new_file():
    """When GET returns 404, PUT with no sha creates a new file."""
    get_resp = MagicMock()
    get_resp.status_code = 404
    get_resp.json.return_value = {}

    put_resp = MagicMock()
    put_resp.status_code = 201
    put_resp.json.return_value = {"content": {"html_url": "https://github.com/file.md"}}

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=get_resp)
    mock_client.put = AsyncMock(return_value=put_resp)

    async def fake_aenter(self):
        return mock_client

    async def fake_aexit(self, *args):
        pass

    with patch("routers.vocabulary.httpx.AsyncClient") as mock_cls:
        mock_cls.return_value.__aenter__ = fake_aenter
        mock_cls.return_value.__aexit__ = fake_aexit

        result = await _github_put(
            token="ghp_test",
            repo="user/repo",
            path="Notes/Books",
            filename="Moby Dick.md",
            content_md="# Moby Dick\n",
            message="Update Moby Dick.md",
        )

    assert result == "https://github.com/file.md"

    # Verify PUT body has no sha key when file doesn't exist
    put_call_kwargs = mock_client.put.call_args.kwargs
    put_body = put_call_kwargs["json"]
    assert "sha" not in put_body
    # Content is base64-encoded
    decoded = base64.b64decode(put_body["content"]).decode()
    assert decoded == "# Moby Dick\n"


async def test_github_put_updates_existing_file_with_sha():
    """When GET returns 200 with sha, PUT includes sha for update."""
    get_resp = MagicMock()
    get_resp.status_code = 200
    get_resp.json.return_value = {"sha": "abc123def"}

    put_resp = MagicMock()
    put_resp.status_code = 200
    put_resp.json.return_value = {"content": {"html_url": "https://github.com/updated.md"}}

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=get_resp)
    mock_client.put = AsyncMock(return_value=put_resp)

    with patch("routers.vocabulary.httpx.AsyncClient") as mock_cls:
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await _github_put(
            token="ghp_test",
            repo="user/repo",
            path="Notes",
            filename="test.md",
            content_md="content",
            message="msg",
        )

    assert result == "https://github.com/updated.md"
    put_body = mock_client.put.call_args.kwargs["json"]
    assert put_body["sha"] == "abc123def"


async def test_github_put_raises_502_on_github_error():
    """When PUT returns a non-200/201 status, _github_put raises HTTP 502."""
    get_resp = MagicMock()
    get_resp.status_code = 404
    get_resp.json.return_value = {}

    put_resp = MagicMock()
    put_resp.status_code = 403
    put_resp.text = "Forbidden"
    put_resp.json.return_value = {}

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=get_resp)
    mock_client.put = AsyncMock(return_value=put_resp)

    with patch("routers.vocabulary.httpx.AsyncClient") as mock_cls:
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        with pytest.raises(HTTPException) as exc_info:
            await _github_put(
                token="ghp_bad",
                repo="user/repo",
                path="Notes",
                filename="file.md",
                content_md="content",
                message="msg",
            )

    assert exc_info.value.status_code == 502
    assert "403" in exc_info.value.detail


# ── _build_book_markdown ─────────────────────────────────────────────────────

def test_build_book_markdown_with_annotations_and_translations():
    """Annotation translations appear as italicized text below the quote."""
    book = {"title": "Test Book", "authors": ["Author"]}
    annotations = [
        {"id": 1, "chapter_index": 0, "sentence_text": "The whale was huge.", "note_text": None},
    ]
    ann_translations = {1: "Der Wal war riesig."}
    result = _build_book_markdown(
        book=book,
        words_for_book=[],
        annotations=annotations,
        connected=[],
        insights=[],
        book_id=100,
        export_date="2024-01-01",
        ann_translations=ann_translations,
    )
    assert "Der Wal war riesig." in result
    assert "> *Der Wal war riesig.*" in result


def test_build_book_markdown_with_note_text():
    """Annotations with note_text include the note after the quote."""
    book = {"title": "Test Book", "authors": ["Author"]}
    annotations = [
        {
            "id": 1,
            "chapter_index": 0,
            "sentence_text": "Important sentence.",
            "note_text": "My personal note here.",
        }
    ]
    result = _build_book_markdown(
        book=book,
        words_for_book=[],
        annotations=annotations,
        connected=[],
        insights=[],
        book_id=100,
        export_date="2024-01-01",
        ann_translations=None,
    )
    assert "My personal note here." in result


def test_build_book_markdown_with_insights():
    """Insights section is included when insights are non-empty."""
    book = {"title": "Test Book", "authors": ["Author"]}
    insights = [
        {
            "chapter_index": 2,
            "question": "What is the theme?",
            "answer": "The theme is redemption.",
        }
    ]
    result = _build_book_markdown(
        book=book,
        words_for_book=[],
        annotations=[],
        connected=[],
        insights=insights,
        book_id=100,
        export_date="2024-01-01",
    )
    assert "## Reading Insights" in result
    assert "What is the theme?" in result
    assert "The theme is redemption." in result
    assert "Ch.3" in result  # chapter_index 2 → "Ch.3"


def test_build_book_markdown_insight_without_chapter_index():
    """Insights without chapter_index don't show chapter label."""
    book = {"title": "Test Book", "authors": ["Author"]}
    insights = [
        {
            "chapter_index": None,
            "question": "General question?",
            "answer": "General answer.",
        }
    ]
    result = _build_book_markdown(
        book=book,
        words_for_book=[],
        annotations=[],
        connected=[],
        insights=insights,
        book_id=100,
        export_date="2024-01-01",
    )
    assert "**Q:**" in result
    # No "Ch." label when chapter_index is None
    assert "Ch." not in result.split("## Reading Insights")[1]


def test_build_book_markdown_with_connected_books():
    """Connected books with shared vocabulary are listed."""
    book = {"title": "Test Book", "authors": ["Author"]}
    connected = [
        {"title": "Other Book", "shared_words": ["whale", "sea"]},
    ]
    result = _build_book_markdown(
        book=book,
        words_for_book=[],
        annotations=[],
        connected=connected,
        insights=[],
        book_id=100,
        export_date="2024-01-01",
    )
    assert "## Connected Books" in result
    assert "Other Book" in result
    assert "[[whale]]" in result
    assert "[[sea]]" in result


def test_build_book_markdown_null_book():
    """If book is None, author falls back to 'Unknown' and source uses book_id."""
    result = _build_book_markdown(
        book=None,
        words_for_book=[],
        annotations=[],
        connected=[],
        insights=[],
        book_id=999,
        export_date="2024-01-01",
    )
    assert "Unknown" in result
    # Source line always uses book_id
    assert "gutenberg.org/ebooks/999" in result


# ── _build_word_markdown ─────────────────────────────────────────────────────

def test_build_word_markdown_basic():
    occurrences = [
        {"book_id": 100, "book_title": "Moby Dick", "chapter_index": 3, "sentence_text": "The leviathan."},
    ]
    result = _build_word_markdown("leviathan", occurrences)
    assert "# leviathan" in result
    assert "Moby Dick" in result
    assert "Ch.3" in result
    assert "The leviathan." in result
    assert "## Books" in result


def test_build_word_markdown_multiple_books():
    occurrences = [
        {"book_id": 100, "book_title": "Moby Dick", "chapter_index": 0, "sentence_text": "Sentence 1."},
        {"book_id": 101, "book_title": "White Fang", "chapter_index": 1, "sentence_text": "Sentence 2."},
    ]
    result = _build_word_markdown("whale", occurrences)
    assert "[[Moby Dick]]" in result
    assert "[[White Fang]]" in result


def test_build_word_markdown_no_book_title_uses_book_id():
    occurrences = [
        {"book_id": 555, "book_title": None, "chapter_index": 0, "sentence_text": "Some sentence."},
    ]
    result = _build_word_markdown("ocean", occurrences)
    assert "Book 555" in result


# ── _find_connected_books ────────────────────────────────────────────────────

def test_find_connected_books_returns_books_with_min_shared():
    all_vocab = [
        {
            "word": "whale",
            "occurrences": [
                {"book_id": 100, "book_title": "Moby Dick"},
                {"book_id": 200, "book_title": "Sea Story"},
            ],
        },
        {
            "word": "ocean",
            "occurrences": [
                {"book_id": 100, "book_title": "Moby Dick"},
                {"book_id": 200, "book_title": "Sea Story"},
            ],
        },
    ]
    result = _find_connected_books(100, all_vocab, min_shared=2)
    assert len(result) == 1
    assert result[0]["title"] == "Sea Story"
    assert "whale" in result[0]["shared_words"]
    assert "ocean" in result[0]["shared_words"]


def test_find_connected_books_excludes_below_min_shared():
    all_vocab = [
        {
            "word": "whale",
            "occurrences": [
                {"book_id": 100, "book_title": "Moby Dick"},
                {"book_id": 200, "book_title": "Sea Story"},
            ],
        },
    ]
    result = _find_connected_books(100, all_vocab, min_shared=2)
    # Only 1 shared word, min_shared=2 → no connected books
    assert result == []


def test_find_connected_books_no_other_books():
    all_vocab = [
        {
            "word": "whale",
            "occurrences": [{"book_id": 100, "book_title": "Moby Dick"}],
        },
    ]
    result = _find_connected_books(100, all_vocab)
    assert result == []


def test_find_connected_books_no_book_title_uses_fallback():
    """Book occurrences without book_title use 'Book {id}' as title."""
    all_vocab = [
        {
            "word": "whale",
            "occurrences": [
                {"book_id": 100},
                {"book_id": 200},
            ],
        },
        {
            "word": "sea",
            "occurrences": [
                {"book_id": 100},
                {"book_id": 200},
            ],
        },
    ]
    result = _find_connected_books(100, all_vocab, min_shared=2)
    assert any("Book 200" in r["title"] for r in result)


# ── Export endpoint (router integration) ─────────────────────────────────────

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


async def test_export_includes_word_notes_when_no_book_id(client, test_user):
    """Export without book_id exports all books AND individual word notes."""
    await _setup_export(test_user)

    captured_calls = []

    async def fake_put(token, repo, path, filename, content_md, message):
        captured_calls.append({"path": path, "filename": filename, "content": content_md})
        return f"https://github.com/url/{filename}"

    with patch("routers.vocabulary._github_put", side_effect=fake_put), \
         patch("routers.vocabulary.translate_text", new_callable=AsyncMock, return_value=[]):
        resp = await client.post("/api/vocabulary/export/obsidian", json={})

    assert resp.status_code == 200
    data = resp.json()
    assert "urls" in data
    # Should have at least one book export + one word export
    assert len(data["urls"]) >= 2

    # Find the word note export (contains "vocabulary" in path)
    word_exports = [c for c in captured_calls if "vocabulary" in c["path"]]
    assert len(word_exports) >= 1
    # The word note filename should be the word name
    assert any("leviathan.md" == c["filename"] for c in word_exports)


async def test_export_word_note_contains_correct_content(client, test_user):
    """Word note markdown includes ## In your books and ## Books sections."""
    await _setup_export(test_user)

    captured_word_notes = {}

    async def fake_put(token, repo, path, filename, content_md, message):
        if "vocabulary" in path:
            captured_word_notes[filename] = content_md
        return "https://github.com/url"

    with patch("routers.vocabulary._github_put", side_effect=fake_put), \
         patch("routers.vocabulary.translate_text", new_callable=AsyncMock, return_value=[]):
        resp = await client.post("/api/vocabulary/export/obsidian", json={})

    assert resp.status_code == 200
    assert "leviathan.md" in captured_word_notes
    word_note = captured_word_notes["leviathan.md"]
    assert "# leviathan" in word_note
    assert "## In your books" in word_note
    assert "## Books" in word_note


async def test_export_with_annotations_includes_translations(client, test_user):
    """When annotations exist, translation is called and result appears in export."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(test_user["id"], "whale", BOOK_ID, 0, "The whale rose.")
    await create_annotation(
        test_user["id"],
        BOOK_ID,
        chapter_index=0,
        sentence_text="The whale rose.",
        note_text="",
        color="yellow",
    )
    enc_token = encrypt_api_key("ghp_test_token")
    await update_obsidian_settings(
        test_user["id"], enc_token,
        "user/obsidian-notes",
        "Notes/Books",
    )

    captured_content = {}

    async def fake_put(token, repo, path, filename, content_md, message):
        captured_content["content"] = content_md
        return "https://github.com/url"

    with patch("routers.vocabulary._github_put", side_effect=fake_put), \
         patch("routers.vocabulary.translate_text", new_callable=AsyncMock, return_value=["鲸鱼上升了。"]):
        resp = await client.post(
            "/api/vocabulary/export/obsidian",
            json={"book_id": BOOK_ID, "target_language": "zh"},
        )

    assert resp.status_code == 200
    assert "鲸鱼上升了。" in captured_content.get("content", "")


async def test_export_reraises_http_exception(client, test_user):
    """HTTPException raised inside _build_and_push_book should propagate unchanged."""
    await _setup_export(test_user)

    with patch(
        "routers.vocabulary._github_put",
        new_callable=AsyncMock,
        side_effect=HTTPException(status_code=502, detail="Bad gateway"),
    ), patch("routers.vocabulary.translate_text", new_callable=AsyncMock, return_value=[]):
        resp = await client.post("/api/vocabulary/export/obsidian", json={"book_id": BOOK_ID})

    assert resp.status_code == 502


async def test_export_wraps_generic_exception_as_500(client, test_user):
    """Non-HTTP exceptions from _build_and_push_book become 500."""
    await _setup_export(test_user)

    with patch(
        "routers.vocabulary._github_put",
        new_callable=AsyncMock,
        side_effect=RuntimeError("unexpected failure"),
    ), patch("routers.vocabulary.translate_text", new_callable=AsyncMock, return_value=[]):
        resp = await client.post("/api/vocabulary/export/obsidian", json={"book_id": BOOK_ID})

    assert resp.status_code == 500
    assert "unexpected failure" in resp.json()["detail"]


async def test_export_uses_default_path_when_obsidian_path_not_set(client, test_user):
    """When obsidian_path is not configured, a default path is used."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(test_user["id"], "ship", BOOK_ID, 0, "The ship sailed.")
    enc_token = encrypt_api_key("ghp_test_token")
    # Pass None for path so the default kicks in
    await update_obsidian_settings(test_user["id"], enc_token, "user/repo", None)

    captured_paths = []

    async def fake_put(token, repo, path, filename, content_md, message):
        captured_paths.append(path)
        return "https://github.com/url"

    with patch("routers.vocabulary._github_put", side_effect=fake_put), \
         patch("routers.vocabulary.translate_text", new_callable=AsyncMock, return_value=[]):
        resp = await client.post("/api/vocabulary/export/obsidian", json={"book_id": BOOK_ID})

    assert resp.status_code == 200
    # Default path should be used
    assert any("All Notes" in p for p in captured_paths)


async def test_save_word_different_sentence_same_chapter_creates_second_occurrence(client, test_user):
    """Saving the same word in the same chapter with a different sentence creates a second occurrence."""
    await save_book(BOOK_ID, _BOOK_META, "text")

    await client.post("/api/vocabulary", json={
        "word": "tempest",
        "book_id": BOOK_ID,
        "chapter_index": 2,
        "sentence_text": "The tempest raged.",
    })
    await client.post("/api/vocabulary", json={
        "word": "tempest",
        "book_id": BOOK_ID,
        "chapter_index": 2,
        "sentence_text": "A tempest approached.",
    })

    resp = await client.get("/api/vocabulary")
    vocab = resp.json()
    entry = next(v for v in vocab if v["word"] == "tempest")
    assert len(entry["occurrences"]) == 2


async def test_save_word_same_sentence_different_chapter_creates_separate_occurrences(client, test_user):
    """Same word in different chapters creates separate occurrences."""
    await save_book(BOOK_ID, _BOOK_META, "text")

    await client.post("/api/vocabulary", json={
        "word": "horizon",
        "book_id": BOOK_ID,
        "chapter_index": 0,
        "sentence_text": "The horizon stretched far.",
    })
    await client.post("/api/vocabulary", json={
        "word": "horizon",
        "book_id": BOOK_ID,
        "chapter_index": 5,
        "sentence_text": "The horizon stretched far.",
    })

    resp = await client.get("/api/vocabulary")
    vocab = resp.json()
    entry = next(v for v in vocab if v["word"] == "horizon")
    assert len(entry["occurrences"]) == 2
    chapters = {occ["chapter_index"] for occ in entry["occurrences"]}
    assert 0 in chapters
    assert 5 in chapters


# ── GET /vocabulary/definition/{word} ────────────────────────────────────────

async def test_get_definition_returns_wiktionary_result(client, test_user):
    fake_result = {
        "lemma": "whale",
        "language": "en",
        "definitions": [{"pos": "noun", "text": "A large marine mammal."}],
        "url": "https://en.wiktionary.org/wiki/whale",
    }
    from services import wiktionary as wikt_mod
    with patch.object(wikt_mod, "lookup", new_callable=AsyncMock, return_value=fake_result):
        resp = await client.get("/api/vocabulary/definition/whale?lang=en")

    assert resp.status_code == 200
    data = resp.json()
    assert data["lemma"] == "whale"
    assert len(data["definitions"]) == 1


async def test_get_definition_requires_auth(anon_client):
    resp = await anon_client.get("/api/vocabulary/definition/whale")
    assert resp.status_code == 401


# ── Lemma + language fields in vocabulary list ────────────────────────────────

async def test_get_vocabulary_includes_lemma_language_fields(client, test_user):
    """GET /vocabulary returns lemma and language fields (even if null initially)."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(test_user["id"], "swam", BOOK_ID, 0, "The fish swam.")

    resp = await client.get("/api/vocabulary")
    assert resp.status_code == 200
    vocab = resp.json()
    entry = next(v for v in vocab if v["word"] == "swam")
    assert "lemma" in entry
    assert "language" in entry
