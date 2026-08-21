"""Vocabulary entries are stored under the word's base form (#2663).

Saving "acknowledged" must land in the word list as "acknowledge", so the same
word encountered in three inflections is one entry rather than three. Whenever the
base form cannot be determined — no entry, network failure, already a base form —
the word is stored exactly as it appeared in the text.
"""
import pytest
from unittest.mock import AsyncMock, patch

import services.db as db_module
from services.db import save_book, save_word, get_vocabulary
# Bound at import time so the autouse conftest stub does not shadow the real one.
from services.db import _resolve_base_form as _real_resolve_base_form

_BOOK_META = {
    "title": "Pride and Prejudice",
    "authors": ["Jane Austen"],
    "languages": ["en"],
    "subjects": [],
    "download_count": 0,
    "cover": "",
}
BOOK_ID = 9201


# ── storage ───────────────────────────────────────────────────────────────────

async def test_save_word_stores_the_base_form(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    row = await save_word(
        test_user["id"], "acknowledged", BOOK_ID, 0,
        "It is a truth universally acknowledged.", lemma="acknowledge",
    )
    assert row["word"] == "acknowledge"
    assert row["lemma"] == "acknowledge"


async def test_inflections_collapse_into_one_entry(client, test_user):
    """Three surface forms of one word must not produce three list entries."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    for surface, sentence in [
        ("acknowledged", "It is a truth universally acknowledged."),
        ("acknowledging", "Acknowledging her error, she left."),
        ("acknowledge", "I acknowledge the point."),
    ]:
        await save_word(test_user["id"], surface, BOOK_ID, 0, sentence, lemma="acknowledge")

    vocab = await get_vocabulary(test_user["id"])
    words = [v["word"] for v in vocab]
    assert words == ["acknowledge"]
    assert len(vocab[0]["occurrences"]) == 3


async def test_occurrence_attaches_to_the_base_form_entry(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(
        test_user["id"], "acknowledged", BOOK_ID, 3,
        "It is a truth universally acknowledged.", lemma="acknowledge",
    )
    vocab = await get_vocabulary(test_user["id"])
    entry = next(v for v in vocab if v["word"] == "acknowledge")
    assert entry["occurrences"][0]["chapter_index"] == 3


async def test_supplied_base_form_is_normalised(client, test_user):
    """A capitalised or padded base form from the client must not create a
    second entry that differs only in case."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(test_user["id"], "Acknowledged", BOOK_ID, 0, "A.", lemma="  Acknowledge  ")
    await save_word(test_user["id"], "acknowledging", BOOK_ID, 1, "B.", lemma="acknowledge")

    vocab = await get_vocabulary(test_user["id"])
    assert [v["word"] for v in vocab] == ["acknowledge"]


# ── falling back when no base form can be found ───────────────────────────────

@pytest.mark.asyncio
async def test_resolve_falls_back_to_the_word_when_lookup_finds_nothing():
    """No Wiktionary entry → store the word exactly as it appeared."""
    with patch("services.wiktionary.lookup", AsyncMock(return_value={
        "lemma": "flibbertigibbet", "language": "en", "definitions": [], "form_of": None, "url": "",
    })):
        base, lang = await _real_resolve_base_form("flibbertigibbet", BOOK_ID, None)
    assert base == "flibbertigibbet"
    assert lang == "en"


@pytest.mark.asyncio
async def test_resolve_falls_back_to_the_word_when_lookup_raises():
    """Network failure must never cost the user their save."""
    with patch("services.wiktionary.lookup", AsyncMock(side_effect=Exception("network down"))):
        base, _lang = await _real_resolve_base_form("acknowledged", BOOK_ID, None)
    assert base == "acknowledged"


@pytest.mark.asyncio
async def test_resolve_falls_back_when_lookup_returns_a_blank_lemma():
    with patch("services.wiktionary.lookup", AsyncMock(return_value={
        "lemma": "   ", "language": "en", "definitions": [], "form_of": None, "url": "",
    })):
        base, _lang = await _real_resolve_base_form("acknowledged", BOOK_ID, None)
    assert base == "acknowledged"


@pytest.mark.asyncio
async def test_resolve_uses_the_lookup_result_when_no_base_form_supplied():
    with patch("services.wiktionary.lookup", AsyncMock(return_value={
        "lemma": "acknowledge", "language": "en", "definitions": [], "form_of": None, "url": "",
    })) as mock_lookup:
        base, _lang = await _real_resolve_base_form("acknowledged", BOOK_ID, None)
    assert base == "acknowledge"
    assert mock_lookup.await_count == 1


@pytest.mark.asyncio
async def test_resolve_skips_the_lookup_when_a_base_form_is_supplied():
    """The tooltip already fetched the definition — no second round-trip."""
    with patch("services.wiktionary.lookup", AsyncMock()) as mock_lookup:
        base, _lang = await _real_resolve_base_form("acknowledged", BOOK_ID, "acknowledge")
    assert base == "acknowledge"
    assert mock_lookup.await_count == 0


async def test_save_word_survives_a_failing_lookup(client, test_user, monkeypatch):
    """End-to-end: a dictionary outage still results in a saved word."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    monkeypatch.setattr(db_module, "_resolve_base_form", _real_resolve_base_form)
    with patch("services.wiktionary.lookup", AsyncMock(side_effect=Exception("boom"))):
        row = await save_word(test_user["id"], "acknowledged", BOOK_ID, 0, "A sentence.")
    assert row["word"] == "acknowledged"


# ── router plumbing ───────────────────────────────────────────────────────────

async def test_post_vocabulary_accepts_and_forwards_the_base_form(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    resp = await client.post("/api/vocabulary", json={
        "word": "acknowledged",
        "lemma": "acknowledge",
        "book_id": BOOK_ID,
        "chapter_index": 0,
        "sentence_text": "It is a truth universally acknowledged.",
    })
    assert resp.status_code == 200
    assert resp.json()["word"] == "acknowledge"


async def test_post_vocabulary_still_works_without_a_base_form(client, test_user):
    """Older clients that don't send `lemma` must keep working."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    resp = await client.post("/api/vocabulary", json={
        "word": "leviathan",
        "book_id": BOOK_ID,
        "chapter_index": 0,
        "sentence_text": "The great leviathan swam past.",
    })
    assert resp.status_code == 200
    assert resp.json()["word"] == "leviathan"
