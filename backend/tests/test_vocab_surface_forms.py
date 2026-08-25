"""
Owner design (2026-08-26): keep both directions of the form↔lemma mapping.
Saving stores the exact form met in the text (surface_form on the occurrence)
alongside the base-form vocabulary entry, so the reader can underline saved
words deterministically (no stemming needed for new saves — including ablaut
forms like sah→sehen) and the vocabulary page can group forms per base.
"""

import aiosqlite
import pytest
import services.db as db_module
from services.db import save_word, get_vocabulary


@pytest.fixture(autouse=True)
async def _seed_book(client):
    # word_occurrences.book_id carries a declared FK — seed the referenced book.
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "INSERT OR IGNORE INTO books (id, title, images, source) VALUES (1, 'T', '[]', 'upload')"
        )
        await db.commit()


async def _save(user_id, surface, lemma, sentence):
    return await save_word(user_id, surface, 1, 0, sentence, lemma=lemma)


async def test_migration_adds_surface_form_column(client):
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        async with db.execute("PRAGMA table_info(word_occurrences)") as cur:
            cols = [r[1] for r in await cur.fetchall()]
    assert "surface_form" in cols


async def test_save_word_records_the_surface_form(client, test_user):
    await _save(test_user["id"], "verhöhnt", "verhöhnen",
                "Und wenn mich auch der ganze Kreis verhöhnt;")
    words = await get_vocabulary(test_user["id"])
    assert len(words) == 1
    assert words[0]["word"] == "verhöhnen"
    assert words[0]["occurrences"][0]["surface_form"] == "verhöhnt"


async def test_inflections_group_under_one_entry_with_their_forms(client, test_user):
    await _save(test_user["id"], "verhöhnt", "verhöhnen", "Der Kreis verhöhnt ihn.")
    await _save(test_user["id"], "verhöhnte", "verhöhnen", "Er verhöhnte den Kreis.")
    words = await get_vocabulary(test_user["id"])
    assert len(words) == 1
    forms = sorted(o["surface_form"] for o in words[0]["occurrences"])
    assert forms == ["verhöhnt", "verhöhnte"]


async def test_resave_backfills_a_null_surface_form(client, test_user):
    """Occurrences saved before this migration have surface_form NULL —
    re-saving the same sentence fills it in instead of duplicating."""
    await _save(test_user["id"], "verhöhnt", "verhöhnen", "Der Kreis verhöhnt ihn.")
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute("UPDATE word_occurrences SET surface_form = NULL")
        await db.commit()

    await _save(test_user["id"], "verhöhnt", "verhöhnen", "Der Kreis verhöhnt ihn.")
    words = await get_vocabulary(test_user["id"])
    assert len(words[0]["occurrences"]) == 1
    assert words[0]["occurrences"][0]["surface_form"] == "verhöhnt"
