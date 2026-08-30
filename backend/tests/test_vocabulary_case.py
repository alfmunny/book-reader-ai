"""Capitalisation is lexical information and must survive a save (#2748).

German nouns are capitalised — `Pracht` and `pracht` are not the same word,
and the second is simply misspelled. Every word was force-lowercased on save,
so 5 of the 12 rows in the live database were wrong.

The rule is not "don't lowercase German". It is: store the canonical form the
dictionary gives us, and match case-insensitively so English still normalises
and no duplicate entries appear.
"""
import aiosqlite
import pytest
from unittest.mock import AsyncMock, patch

import services.db as db_module
from services.db import save_book, save_word, delete_word, get_vocabulary
from services.db import _resolve_base_form as real_resolve

BOOK_ID = 8300
_META = {
    "id": BOOK_ID, "title": "Faust", "authors": ["Goethe"], "languages": ["de"],
    "subjects": [], "download_count": 0, "cover": "",
}


def _resolves_to(lemma: str, language: str = "de"):
    """Stub base-form resolution to answer with the dictionary's canonical form.

    conftest's autouse fixture already replaces the real resolver (to keep HTTP
    out of the suite); this replaces that stub in turn, so save_word sees the
    casing a real lookup would have returned.
    """
    async def _resolve(word, book_id, provided=None):
        return (lemma, language, None)
    return _resolve


@pytest.fixture(autouse=True)
async def _book(tmp_db):
    await save_book(BOOK_ID, _META, "text")


async def _saved_words(user_id: int) -> list[str]:
    return [w["word"] for w in await get_vocabulary(user_id)]


async def test_german_noun_keeps_its_capital(test_user):
    """The whole point: `Pracht`, not `pracht`."""
    with patch.object(db_module, "_resolve_base_form", _resolves_to("Pracht")):
        await save_word(test_user["id"], "Pracht", BOOK_ID, 0, "Welch eine Pracht.")

    assert await _saved_words(test_user["id"]) == ["Pracht"]


async def test_capitalisation_comes_from_the_dictionary_not_the_text(test_user):
    """`schalk` mid-sentence still resolves to the noun `Schalk` (#2748)."""
    with patch.object(db_module, "_resolve_base_form", _resolves_to("Schalk")):
        await save_word(test_user["id"], "schalk", BOOK_ID, 0, "Du bist ein schalk.")

    assert await _saved_words(test_user["id"]) == ["Schalk"]


async def test_german_verb_stays_lowercase(test_user):
    """Verbs are not capitalised — the fix must not capitalise indiscriminately."""
    with patch.object(db_module, "_resolve_base_form", _resolves_to("ergründen")):
        await save_word(test_user["id"], "Ergründen", BOOK_ID, 0, "Ergründen wollte er es.")

    assert await _saved_words(test_user["id"]) == ["ergründen"]


async def test_english_word_at_the_start_of_a_sentence_normalises(test_user):
    """`The` must not become a second entry beside `the`."""
    with patch.object(db_module, "_resolve_base_form", _resolves_to("the", "en")):
        await save_word(test_user["id"], "The", BOOK_ID, 0, "The whale.")

    assert await _saved_words(test_user["id"]) == ["the"]


async def test_saving_the_same_word_in_another_casing_does_not_duplicate(test_user):
    """Matching is case-insensitive, so one entry gains an occurrence."""
    with patch.object(db_module, "_resolve_base_form", _resolves_to("Pracht")):
        await save_word(test_user["id"], "Pracht", BOOK_ID, 0, "Welch eine Pracht.")
        await save_word(test_user["id"], "pracht", BOOK_ID, 1, "Die pracht verging.")

    words = await get_vocabulary(test_user["id"])
    assert len(words) == 1, "one entry, not two"
    assert words[0]["word"] == "Pracht"
    assert len(words[0]["occurrences"]) == 2


async def test_delete_matches_regardless_of_casing(test_user):
    """A capitalised row must still be deletable (delete_word lowercases input)."""
    with patch.object(db_module, "_resolve_base_form", _resolves_to("Pracht")):
        await save_word(test_user["id"], "Pracht", BOOK_ID, 0, "Welch eine Pracht.")

    assert await delete_word(test_user["id"], "pracht") is True
    assert await _saved_words(test_user["id"]) == []


async def test_the_surface_form_keeps_the_casing_from_the_text(test_user):
    """word_occurrences.surface_form records the form actually met."""
    with patch.object(db_module, "_resolve_base_form", _resolves_to("Pracht")):
        await save_word(test_user["id"], "Pracht", BOOK_ID, 0, "Welch eine Pracht.")

    async with aiosqlite.connect(db_module.DB_PATH) as db:
        async with db.execute("SELECT surface_form FROM word_occurrences") as cur:
            assert (await cur.fetchone())[0] == "Pracht"


async def test_case_variants_cannot_both_be_stored(test_user):
    """The unique index is case-insensitive, so the DB itself refuses a twin."""
    with patch.object(db_module, "_resolve_base_form", _resolves_to("Pracht")):
        await save_word(test_user["id"], "Pracht", BOOK_ID, 0, "Welch eine Pracht.")

    async with aiosqlite.connect(db_module.DB_PATH) as db:
        with pytest.raises(aiosqlite.IntegrityError):
            await db.execute(
                "INSERT INTO vocabulary (user_id, word, lemma, language) VALUES (?,?,?,?)",
                (test_user["id"], "pracht", "pracht", "de"),
            )
            await db.commit()


async def test_resolver_keeps_the_dictionarys_casing(test_user):
    """The resolver itself is where the capital used to be discarded (#2748).

    Uses the real _resolve_base_form (conftest stubs it out for everyone else)
    with only the HTTP lookup replaced.
    """
    lookup = AsyncMock(return_value={
        "lemma": "Schalk", "language": "de", "definitions": [{"pos": "noun", "text": "rogue"}],
        "form_of": None, "url": "https://en.wiktionary.org/wiki/Schalk",
        "definition_lang": "en",
    })
    with patch("services.wiktionary.lookup", lookup):
        base, language, _ = await real_resolve("schalk", BOOK_ID, None)

    assert base == "Schalk", "the lookup answered Schalk and that must survive"
    assert language == "de"


async def test_resolver_keeps_casing_of_a_caller_supplied_lemma(test_user):
    """The tooltip passes the lemma it already resolved — don't fold it."""
    base, _language, _ = await real_resolve("prachten", BOOK_ID, provided="Pracht")

    assert base == "Pracht"
