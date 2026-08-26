"""Freezing a book no longer publishes it.

Freezing is technical and irreversible — the split is fixed so annotations can
anchor. Publishing is editorial, outward-facing and reversible. An architect
session makes the first call; a human makes the second.
"""
import aiosqlite

import services.db as db_module
from services.db import save_book, list_audited_books, list_frozen_unpublished, set_book_published

_META = {
    "title": "Faust",
    "authors": ["Goethe"],
    "languages": ["de"],
    "subjects": ["Drama"],
    "download_count": 10,
    "cover": "",
}


async def _freeze(book_id: int, published: bool = False, frozen_at: str = "2026-08-26") -> None:
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            "INSERT INTO book_freeze (book_id, splitter, chapter_source, frozen_at,"
            " audited_by, content_sha256, published_at)"
            " VALUES (?, 'html_preference', 'epub', ?, 'architect', 'abc', ?)",
            (book_id, frozen_at, frozen_at if published else None),
        )
        await db.commit()


async def _make(book_id: int, title: str = "Faust") -> None:
    await save_book(book_id, {**_META, "title": title}, "text")


# ── the catalog ───────────────────────────────────────────────────────────────

async def test_frozen_but_unpublished_book_is_not_in_the_catalog(client, test_user):
    await _make(7201)
    await _freeze(7201, published=False)
    assert await list_audited_books() == []


async def test_published_book_is_in_the_catalog(client, test_user):
    await _make(7202)
    await _freeze(7202, published=True)
    assert [b["title"] for b in await list_audited_books()] == ["Faust"]


async def test_catalog_endpoint_hides_unpublished_books(client, test_user):
    await _make(7203, "Published")
    await _freeze(7203, published=True)
    await _make(7204, "Awaiting review")
    await _freeze(7204, published=False)

    resp = await client.get("/api/books/catalog")
    assert [b["title"] for b in resp.json()] == ["Published"]


# ── the review queue ──────────────────────────────────────────────────────────

async def test_frozen_unpublished_books_are_listed_for_review(client, test_user):
    await _make(7205, "Awaiting")
    await _freeze(7205, published=False)
    await _make(7206, "Already out")
    await _freeze(7206, published=True)

    pending = await list_frozen_unpublished()
    assert [b["title"] for b in pending] == ["Awaiting"]
    assert pending[0]["audited_by"] == "architect"


async def test_review_queue_reports_chapter_count(client, test_user):
    await _make(7207)
    await _freeze(7207, published=False)
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.executemany(
            "INSERT INTO book_chapters (book_id, chapter_index, title, text) VALUES (?,?,?,?)",
            [(7207, i, f"Ch {i}", "x") for i in range(4)],
        )
        await db.commit()
    assert (await list_frozen_unpublished())[0]["chapter_count"] == 4


async def test_review_queue_ignores_books_that_were_never_frozen(client, test_user):
    await _make(7208)
    assert await list_frozen_unpublished() == []


# ── publishing and unpublishing ───────────────────────────────────────────────

async def test_publishing_puts_a_book_in_the_catalog(client, test_user):
    await _make(7209)
    await _freeze(7209, published=False)

    assert await set_book_published(7209, True) is True
    assert [b["id"] for b in await list_audited_books()] == [7209]


async def test_unpublishing_removes_it_again(client, test_user):
    await _make(7210)
    await _freeze(7210, published=True)

    assert await set_book_published(7210, False) is True
    assert await list_audited_books() == []


async def test_unpublishing_leaves_the_freeze_intact(client, test_user):
    """Unpublishing is reversible precisely because it does not touch the freeze —
    annotations stay anchored to the same chapter indices."""
    await _make(7211)
    await _freeze(7211, published=True)
    await set_book_published(7211, False)

    async with aiosqlite.connect(db_module.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT frozen_at, audited_by, content_sha256 FROM book_freeze WHERE book_id=?", (7211,)
        ) as cur:
            row = await cur.fetchone()
    assert row["frozen_at"] == "2026-08-26"
    assert row["audited_by"] == "architect"
    assert row["content_sha256"] == "abc"


async def test_publishing_an_unfrozen_book_does_nothing(client, test_user):
    """A book cannot be published before its split is fixed."""
    await _make(7212)
    assert await set_book_published(7212, True) is False
    assert await list_audited_books() == []


async def test_republishing_keeps_the_original_publish_time(client, test_user):
    await _make(7213)
    await _freeze(7213, published=True)
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        async with db.execute("SELECT published_at FROM book_freeze WHERE book_id=?", (7213,)) as cur:
            first = (await cur.fetchone())[0]
    await set_book_published(7213, True)
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        async with db.execute("SELECT published_at FROM book_freeze WHERE book_id=?", (7213,)) as cur:
            assert (await cur.fetchone())[0] == first


# ── the admin surface ─────────────────────────────────────────────────────────

async def test_admin_can_list_and_publish(client, test_user):
    await _make(7214, "Awaiting")
    await _freeze(7214, published=False)

    listing = await client.get("/api/admin/books/pending-publish")
    assert listing.status_code == 200
    assert [b["title"] for b in listing.json()] == ["Awaiting"]

    resp = await client.post("/api/admin/books/7214/publish")
    assert resp.status_code == 200
    assert [b["id"] for b in await list_audited_books()] == [7214]

    assert (await client.get("/api/admin/books/pending-publish")).json() == []


async def test_admin_can_unpublish(client, test_user):
    await _make(7215)
    await _freeze(7215, published=True)
    resp = await client.post("/api/admin/books/7215/unpublish")
    assert resp.status_code == 200
    assert await list_audited_books() == []


async def test_publishing_an_unfrozen_book_404s(client, test_user):
    await _make(7216)
    resp = await client.post("/api/admin/books/7216/publish")
    assert resp.status_code == 404


async def test_publish_requires_admin(client, test_user):
    await _make(7217)
    await _freeze(7217, published=False)
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute("UPDATE users SET role='user' WHERE id=?", (test_user["id"],))
        await db.commit()

    resp = await client.post("/api/admin/books/7217/publish")
    assert resp.status_code in (401, 403)
    assert await list_audited_books() == []


# ── audit state on the main admin list ───────────────────────────────────────

async def test_admin_books_reports_unfrozen_state(client, test_user):
    await _make(7301, "Never audited")
    book = next(b for b in (await client.get("/api/admin/books")).json() if b["id"] == 7301)
    assert book["frozen"] is False
    assert book["published"] is False
    assert book["audited_by"] is None


async def test_admin_books_reports_frozen_but_unpublished(client, test_user):
    await _make(7302, "Awaiting review")
    await _freeze(7302, published=False)
    book = next(b for b in (await client.get("/api/admin/books")).json() if b["id"] == 7302)
    assert book["frozen"] is True
    assert book["published"] is False
    assert book["audited_by"] == "architect"
    assert book["frozen_at"] == "2026-08-26"


async def test_admin_books_reports_published(client, test_user):
    await _make(7303, "Live")
    await _freeze(7303, published=True)
    book = next(b for b in (await client.get("/api/admin/books")).json() if b["id"] == 7303)
    assert book["frozen"] is True
    assert book["published"] is True


# ── translation readiness in the review queue ────────────────────────────────

async def _chapters(book_id: int, n: int) -> None:
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.executemany(
            "INSERT INTO book_chapters (book_id, chapter_index, title, text) VALUES (?,?,?,?)",
            [(book_id, i, f"Ch {i}", "x") for i in range(n)],
        )
        await db.commit()


async def _translate(book_id: int, lang: str, chapter_indices) -> None:
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.executemany(
            "INSERT OR IGNORE INTO translations (book_id, chapter_index, target_language, paragraphs)"
            " VALUES (?,?,?,'[\"p\"]')",
            [(book_id, i, lang) for i in chapter_indices],
        )
        await db.commit()


async def test_queue_reports_translation_progress(client, test_user):
    """A frozen book can still be mid-translation. Publishing it then puts a
    half-translated book in the library, so the queue has to say."""
    await _make(7401, "Crime and Punishment")
    await _freeze(7401, published=False)
    await _chapters(7401, 42)
    await _translate(7401, "zh", range(11))

    entry = (await list_frozen_unpublished())[0]
    assert entry["translations"] == [
        {"language": "zh", "translated": 11, "total": 42, "complete": False}
    ]


async def test_queue_marks_a_finished_translation_complete(client, test_user):
    await _make(7402)
    await _freeze(7402, published=False)
    await _chapters(7402, 3)
    await _translate(7402, "zh", range(3))
    assert (await list_frozen_unpublished())[0]["translations"][0]["complete"] is True


async def test_queue_reports_every_target_language(client, test_user):
    await _make(7403)
    await _freeze(7403, published=False)
    await _chapters(7403, 4)
    await _translate(7403, "zh", range(4))
    await _translate(7403, "de", range(1))

    langs = {t["language"]: t for t in (await list_frozen_unpublished())[0]["translations"]}
    assert langs["zh"]["complete"] is True
    assert langs["de"] == {"language": "de", "translated": 1, "total": 4, "complete": False}


async def test_queue_reports_an_untranslated_book_as_such(client, test_user):
    await _make(7404)
    await _freeze(7404, published=False)
    await _chapters(7404, 5)
    assert (await list_frozen_unpublished())[0]["translations"] == []


async def test_translation_status_reaches_the_admin_endpoint(client, test_user):
    await _make(7406, "Faust")
    await _freeze(7406, published=False)
    await _chapters(7406, 2)
    await _translate(7406, "zh", [0])

    resp = await client.get("/api/admin/books/pending-publish")
    book = next(b for b in resp.json() if b["id"] == 7406)
    assert book["translations"] == [
        {"language": "zh", "translated": 1, "total": 2, "complete": False}
    ]


async def test_incomplete_translation_does_not_block_publishing(client, test_user):
    """Shown, not enforced — publishing an untranslated original is legitimate."""
    await _make(7407)
    await _freeze(7407, published=False)
    await _chapters(7407, 4)
    await _translate(7407, "zh", range(1))

    resp = await client.post("/api/admin/books/7407/publish")
    assert resp.status_code == 200
    assert [b["id"] for b in await list_audited_books()] == [7407]
