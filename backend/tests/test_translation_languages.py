"""
GET /books/{id}/translation-languages — which languages have editorial
translations, with coverage (owner request, 2026-08-27: no more cycling
through every target language to discover what exists).
"""

import aiosqlite
import services.db as db_module
from services.db import save_book

_META = {"title": "Faust", "authors": ["Goethe"], "languages": ["de"], "subjects": [], "download_count": 0, "cover": ""}
_TEXT = "Erster Absatz.\n\nZweiter Absatz."


async def _seed_translation(book_id, lang, chapters):
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        for ch in range(chapters):
            await db.execute(
                "INSERT INTO translations (book_id, chapter_index, target_language, paragraphs) VALUES (?, ?, ?, ?)",
                (book_id, ch, lang, '["x"]'),
            )
        await db.commit()


async def test_lists_available_languages_with_coverage(client, test_user):
    await save_book(1, _META, _TEXT)
    await _seed_translation(1, "zh", 2)
    await _seed_translation(1, "en", 1)
    resp = await client.get("/api/books/1/translation-languages")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_chapters"] == 1
    langs = {l["target_language"]: l["translated_chapters"] for l in data["languages"]}
    assert langs == {"zh": 2, "en": 1}
    # Ordered by coverage descending
    assert data["languages"][0]["target_language"] == "zh"


async def test_empty_book_returns_no_languages(client, test_user):
    await save_book(2, _META, _TEXT)
    resp = await client.get("/api/books/2/translation-languages")
    assert resp.status_code == 200
    assert resp.json()["languages"] == []


async def test_missing_book_is_404(client, test_user):
    resp = await client.get("/api/books/999/translation-languages")
    assert resp.status_code == 404
