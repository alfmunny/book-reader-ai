"""The vocabulary stores each word's meaning at save time (#2704).

Previously the entry held no meaning, so the list showed only occurrences and the
reader's tooltip re-ran a dictionary lookup on every click — even for words
already saved. The definition is captured once and read back from the DB.
"""
import json
import pytest
from unittest.mock import AsyncMock, patch

import services.db as db_module
from services.db import save_book, save_word, get_vocabulary, store_definition
from services.db import _resolve_base_form as _real_resolve_base_form

_BOOK_META = {
    "title": "Faust",
    "authors": ["Goethe"],
    "languages": ["de"],
    "subjects": [],
    "download_count": 0,
    "cover": "",
}
BOOK_ID = 9301

_DEFS = [{"pos": "verb", "text": "to go, to walk"}, {"pos": "verb", "text": "to leave"}]


# ── capture at save time ──────────────────────────────────────────────────────

async def test_save_word_stores_the_definition(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(
        test_user["id"], "gegangen", BOOK_ID, 0, "Er ist gegangen.",
        lemma="gehen", definitions=_DEFS,
        form_of="past participle of gehen",
        definition_url="https://en.wiktionary.org/wiki/gehen",
    )
    vocab = await get_vocabulary(test_user["id"])
    entry = next(v for v in vocab if v["word"] == "gehen")
    assert entry["definitions"] == _DEFS
    assert entry["form_of"] == "past participle of gehen"
    assert entry["definition_url"] == "https://en.wiktionary.org/wiki/gehen"


async def test_entry_without_a_definition_reads_back_as_empty(client, test_user):
    """A word saved with no definition must not blow up the list read."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(test_user["id"], "himmelslichts", BOOK_ID, 0, "A sentence.")
    vocab = await get_vocabulary(test_user["id"])
    entry = next(v for v in vocab if v["word"] == "himmelslichts")
    assert entry["definitions"] == []
    assert entry["form_of"] is None


async def test_saving_again_does_not_wipe_a_stored_definition(client, test_user):
    """Re-saving from a surface that has no definition in hand (the mobile
    drawer) must not blank out a meaning already captured."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(test_user["id"], "gehen", BOOK_ID, 0, "A.", lemma="gehen", definitions=_DEFS)
    await save_word(test_user["id"], "gehen", BOOK_ID, 1, "B.", lemma="gehen")

    vocab = await get_vocabulary(test_user["id"])
    entry = next(v for v in vocab if v["word"] == "gehen")
    assert entry["definitions"] == _DEFS


async def test_a_later_save_can_fill_in_a_missing_definition(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(test_user["id"], "gehen", BOOK_ID, 0, "A.", lemma="gehen")
    await save_word(test_user["id"], "gehen", BOOK_ID, 1, "B.", lemma="gehen", definitions=_DEFS)

    vocab = await get_vocabulary(test_user["id"])
    assert next(v for v in vocab if v["word"] == "gehen")["definitions"] == _DEFS


async def test_corrupt_stored_json_reads_back_as_empty(client, test_user):
    """A hand-edited or half-written row must not break the whole list."""
    import aiosqlite
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(test_user["id"], "gehen", BOOK_ID, 0, "A.", lemma="gehen")
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute("UPDATE vocabulary SET definitions = ? WHERE word = 'gehen'", ("{not json",))
        await db.commit()

    vocab = await get_vocabulary(test_user["id"])
    assert next(v for v in vocab if v["word"] == "gehen")["definitions"] == []


# ── server-side fallback when the client has nothing in hand ──────────────────

async def test_save_word_captures_the_definition_from_its_own_lookup(client, test_user, monkeypatch):
    """No definition supplied → the lookup the backend already runs to resolve the
    base form also yields the meaning, so no second round-trip is needed."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    monkeypatch.setattr(db_module, "_resolve_base_form", _real_resolve_base_form)
    lookup = AsyncMock(return_value={
        "lemma": "gehen", "language": "de", "definitions": _DEFS,
        "form_of": "past participle of gehen", "url": "https://en.wiktionary.org/wiki/gehen",
    })
    with patch("services.wiktionary.lookup", lookup):
        await save_word(test_user["id"], "gegangen", BOOK_ID, 0, "Er ist gegangen.")

    vocab = await get_vocabulary(test_user["id"])
    entry = next(v for v in vocab if v["word"] == "gehen")
    assert entry["definitions"] == _DEFS
    assert lookup.await_count == 1


async def test_save_survives_a_failing_lookup_with_no_definition(client, test_user, monkeypatch):
    await save_book(BOOK_ID, _BOOK_META, "text")
    monkeypatch.setattr(db_module, "_resolve_base_form", _real_resolve_base_form)
    with patch("services.wiktionary.lookup", AsyncMock(side_effect=Exception("down"))):
        await save_word(test_user["id"], "gegangen", BOOK_ID, 0, "Er ist gegangen.")

    vocab = await get_vocabulary(test_user["id"])
    entry = next(v for v in vocab if v["word"] == "gegangen")
    assert entry["definitions"] == []


# ── lazy backfill ─────────────────────────────────────────────────────────────

async def test_store_definition_backfills_an_existing_entry(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(test_user["id"], "gehen", BOOK_ID, 0, "A.", lemma="gehen")

    stored = await store_definition(test_user["id"], "gehen", {
        "definitions": _DEFS, "form_of": None, "url": "https://en.wiktionary.org/wiki/gehen",
    })
    assert stored is True
    vocab = await get_vocabulary(test_user["id"])
    assert next(v for v in vocab if v["word"] == "gehen")["definitions"] == _DEFS


async def test_store_definition_leaves_an_already_stored_meaning_alone(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(test_user["id"], "gehen", BOOK_ID, 0, "A.", lemma="gehen", definitions=_DEFS)

    stored = await store_definition(test_user["id"], "gehen", {
        "definitions": [{"pos": "noun", "text": "something else"}], "form_of": None, "url": "",
    })
    assert stored is False
    vocab = await get_vocabulary(test_user["id"])
    assert next(v for v in vocab if v["word"] == "gehen")["definitions"] == _DEFS


async def test_store_definition_ignores_a_word_the_user_has_not_saved(client, test_user):
    stored = await store_definition(test_user["id"], "unsaved", {
        "definitions": _DEFS, "form_of": None, "url": "",
    })
    assert stored is False


async def test_store_definition_ignores_an_empty_result(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(test_user["id"], "gehen", BOOK_ID, 0, "A.", lemma="gehen")
    stored = await store_definition(test_user["id"], "gehen", {
        "definitions": [], "form_of": None, "url": "",
    })
    assert stored is False


# ── the definition endpoint reads from the DB for saved words ────────────────

async def test_definition_endpoint_serves_a_saved_word_without_a_lookup(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(
        test_user["id"], "gehen", BOOK_ID, 0, "A.", lemma="gehen",
        definitions=_DEFS, form_of=None, definition_url="https://en.wiktionary.org/wiki/gehen",
    )
    lookup = AsyncMock()
    with patch("services.wiktionary.lookup", lookup):
        resp = await client.get("/api/vocabulary/definition/gehen?lang=de")

    assert resp.status_code == 200
    assert resp.json()["definitions"] == _DEFS
    assert lookup.await_count == 0, "a stored meaning must not trigger a network lookup"


async def test_definition_endpoint_matches_a_saved_word_case_insensitively(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(test_user["id"], "gehen", BOOK_ID, 0, "A.", lemma="gehen", definitions=_DEFS)
    with patch("services.wiktionary.lookup", AsyncMock()) as lookup:
        resp = await client.get("/api/vocabulary/definition/GEHEN?lang=de")
    assert resp.json()["definitions"] == _DEFS
    assert lookup.await_count == 0


async def test_definition_endpoint_still_looks_up_an_unsaved_word(client, test_user):
    fresh = {"lemma": "laufen", "language": "de", "definitions": _DEFS, "form_of": None, "url": ""}
    with patch("services.wiktionary.lookup", AsyncMock(return_value=fresh)) as lookup:
        resp = await client.get("/api/vocabulary/definition/laufen?lang=de")
    assert resp.status_code == 200
    assert lookup.await_count == 1


async def test_definition_endpoint_backfills_a_saved_word_that_has_no_meaning(client, test_user):
    """Lazy backfill: the lookup a saved-but-meaningless word triggers is persisted
    so the next click is served from the DB."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(test_user["id"], "gehen", BOOK_ID, 0, "A.", lemma="gehen")

    fresh = {"lemma": "gehen", "language": "de", "definitions": _DEFS,
             "form_of": None, "url": "https://en.wiktionary.org/wiki/gehen"}
    with patch("services.wiktionary.lookup", AsyncMock(return_value=fresh)):
        await client.get("/api/vocabulary/definition/gehen?lang=de")

    vocab = await get_vocabulary(test_user["id"])
    assert next(v for v in vocab if v["word"] == "gehen")["definitions"] == _DEFS


async def test_post_vocabulary_forwards_the_definition(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    resp = await client.post("/api/vocabulary", json={
        "word": "gegangen",
        "lemma": "gehen",
        "definitions": _DEFS,
        "form_of": "past participle of gehen",
        "definition_url": "https://en.wiktionary.org/wiki/gehen",
        "book_id": BOOK_ID,
        "chapter_index": 0,
        "sentence_text": "Er ist gegangen.",
    })
    assert resp.status_code == 200
    vocab = await get_vocabulary(test_user["id"])
    assert next(v for v in vocab if v["word"] == "gehen")["definitions"] == _DEFS


async def test_post_vocabulary_rejects_a_malformed_definition_list(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    resp = await client.post("/api/vocabulary", json={
        "word": "gehen",
        "definitions": "not-a-list",
        "book_id": BOOK_ID,
        "chapter_index": 0,
        "sentence_text": "A.",
    })
    assert resp.status_code == 422


# ── flashcards get the meaning too ───────────────────────────────────────────

async def test_flashcards_due_includes_the_stored_definition(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(test_user["id"], "gehen", BOOK_ID, 0, "Er ist gegangen.",
                    lemma="gehen", definitions=_DEFS)
    resp = await client.get("/api/vocabulary/flashcards/due")
    assert resp.status_code == 200
    card = next(c for c in resp.json() if c["word"] == "gehen")
    assert card["definitions"] == _DEFS


# ── dictionary language selection ────────────────────────────────────────────

_ZH_DEFS = [{"pos": "verb", "text": "走，行走"}]


@pytest.mark.asyncio
async def test_lookup_queries_the_target_languages_wiktionary():
    """Each Wiktionary edition is its own wiki, so the target language picks the host."""
    from services import wiktionary
    seen = {}

    async def _fake_get(url, **_kw):
        seen["url"] = url
        raise Exception("stop here")

    with patch("services.wiktionary.httpx.AsyncClient") as cls:
        client_mock = AsyncMock()
        cls.return_value.__aenter__ = AsyncMock(return_value=client_mock)
        cls.return_value.__aexit__ = AsyncMock(return_value=False)
        client_mock.get = AsyncMock(side_effect=_fake_get)
        await wiktionary.lookup("gehen", "de", target="zh")

    assert "zh.wiktionary.org" in seen["url"]


@pytest.mark.asyncio
async def test_lookup_reports_the_language_the_definitions_are_written_in():
    from services import wiktionary
    with patch("services.wiktionary._fetch", AsyncMock(return_value=None)):
        result = await wiktionary.lookup("gehen", "de", target="zh")
    assert result["definition_lang"] == "zh"


@pytest.mark.asyncio
async def test_ai_lookup_is_told_to_answer_in_the_target_language():
    from services import wiktionary
    captured = {}

    async def _generate(_key, system, _prompt, **_kw):
        captured["system"] = system
        return '{"lemma": "gehen", "definitions": [{"pos": "verb", "text": "走"}]}'

    with patch("services.gemini._generate", _generate):
        result = await wiktionary.ai_lookup("gehen", "de", "key", provider="gemini", target="zh")

    assert "Chinese" in captured["system"]
    assert result["definition_lang"] == "zh"
    assert result["definitions"][0]["text"] == "走"


@pytest.mark.asyncio
async def test_ai_lookup_prompt_is_unchanged_for_english():
    from services import wiktionary
    captured = {}

    async def _generate(_key, system, _prompt, **_kw):
        captured["system"] = system
        return '{"lemma": "gehen", "definitions": [{"pos": "verb", "text": "to go"}]}'

    with patch("services.gemini._generate", _generate):
        await wiktionary.ai_lookup("gehen", "de", "key", provider="gemini", target="en")

    assert captured["system"] == wiktionary._AI_SYSTEM


async def test_definition_endpoint_falls_back_to_english_when_target_has_nothing(client, test_user):
    """Target Wiktionary empty and no AI key configured → an English gloss beats none."""
    from services import wiktionary as _w
    calls = []

    async def _lookup(word, lang, target=_w.DEFAULT_TARGET_LANG):
        calls.append(target)
        if target == "en":
            return {"lemma": word, "language": lang, "definitions": _DEFS,
                    "form_of": None, "url": "", "definition_lang": "en"}
        return {"lemma": word, "language": lang, "definitions": [],
                "form_of": None, "url": "", "definition_lang": target}

    with patch("services.wiktionary.lookup", _lookup):
        resp = await client.get("/api/vocabulary/definition/gehen?lang=de&target=zh")

    assert calls == ["zh", "en"]
    body = resp.json()
    assert body["definitions"] == _DEFS
    # The client can tell it did not get what it asked for.
    assert body["definition_lang"] == "en"


async def test_definition_endpoint_does_not_fall_back_when_target_is_english(client, test_user):
    calls = []

    async def _lookup(word, lang, target="en"):
        calls.append(target)
        return {"lemma": word, "language": lang, "definitions": [],
                "form_of": None, "url": "", "definition_lang": target}

    with patch("services.wiktionary.lookup", _lookup):
        await client.get("/api/vocabulary/definition/gehen?lang=de&target=en")
    assert calls == ["en"]


async def test_stored_english_is_not_served_to_a_chinese_request(client, test_user):
    """The whole point of definition_lang: a cached English gloss must not be
    handed back to someone who switched the dictionary to Chinese."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(test_user["id"], "gehen", BOOK_ID, 0, "A.", lemma="gehen",
                    definitions=_DEFS, definition_lang="en")

    async def _lookup(word, lang, target="en"):
        return {"lemma": word, "language": lang, "definitions": _ZH_DEFS,
                "form_of": None, "url": "", "definition_lang": target}

    with patch("services.wiktionary.lookup", _lookup):
        resp = await client.get("/api/vocabulary/definition/gehen?lang=de&target=zh")

    assert resp.json()["definitions"] == _ZH_DEFS


async def test_switching_language_replaces_the_stored_meaning(client, test_user):
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(test_user["id"], "gehen", BOOK_ID, 0, "A.", lemma="gehen",
                    definitions=_DEFS, definition_lang="en")

    stored = await store_definition(test_user["id"], "gehen", {
        "definitions": _ZH_DEFS, "form_of": None, "url": "", "definition_lang": "zh",
    }, "zh")
    assert stored is True

    vocab = await get_vocabulary(test_user["id"])
    entry = next(v for v in vocab if v["word"] == "gehen")
    assert entry["definitions"] == _ZH_DEFS
    assert entry["definition_lang"] == "zh"


async def test_definition_endpoint_rejects_a_blank_target(client, test_user):
    resp = await client.get("/api/vocabulary/definition/gehen?lang=de&target=%20")
    assert resp.status_code == 422
