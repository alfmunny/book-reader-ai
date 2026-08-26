"""
Story shares — phase 2 track A backend
(design: docs/design/user-translations.md phase 2; issue #2752).
"""

import aiosqlite
import pytest
import services.db as db_module
from services.db import save_book, upsert_session_paragraph, create_annotation

_META = {"title": "Faust", "authors": ["Goethe"], "languages": ["de"], "subjects": [], "download_count": 0, "cover": ""}
_TEXT = "Die Sonne tönt, nach alter Weise.\n\nEs schäumt das Meer in breiten Flüssen."


@pytest.fixture(autouse=True)
async def _seed_book(client):
    await save_book(1, _META, _TEXT)


async def _make_session(client, name="诗意版"):
    resp = await client.post("/api/translation-sessions", json={
        "book_id": 1, "name": name, "target_language": "zh", "provider": "deepseek",
    })
    assert resp.status_code == 201
    return resp.json()["id"]


async def _translated_session(client):
    """A session with both chapter-0 paragraphs translated."""
    sid = await _make_session(client)
    await upsert_session_paragraph(sid, 0, 0, "太阳依着古老的方式轰鸣。", "deepseek", "deepseek-v4-flash")
    await upsert_session_paragraph(sid, 0, 1, "大海在宽阔的河流中翻腾。", "deepseek", "deepseek-v4-flash")
    return sid


async def _share_translation(client, sid, start=0, end=0, caption="look at this stanza"):
    return await client.post("/api/stories", json={
        "kind": "translation", "book_id": 1, "chapter_index": 0,
        "session_id": sid, "paragraph_start": start, "paragraph_end": end,
        "caption": caption,
    })


# ── Migration ────────────────────────────────────────────────────────────────

async def test_migration_tables_exist(client):
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        for table in ("stories", "story_comments"):
            async with db.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
            ) as c:
                assert await c.fetchone() is not None, table


# ── Creating stories ─────────────────────────────────────────────────────────

async def test_share_translation_paragraph(client, test_user):
    sid = await _translated_session(client)
    resp = await _share_translation(client, sid)
    assert resp.status_code == 200
    data = resp.json()
    assert data["kind"] == "translation"
    assert data["session_id"] == sid
    assert data["caption"] == "look at this stanza"


async def test_translation_story_requires_translated_range(client, test_user):
    sid = await _make_session(client)  # nothing translated
    resp = await _share_translation(client, sid)
    assert resp.status_code == 422
    assert "translated first" in resp.json()["detail"]


async def test_translation_story_rejects_foreign_session(client, test_user):
    resp = await _share_translation(client, 999)
    assert resp.status_code == 404


async def test_translation_story_rejects_inverted_range(client, test_user):
    sid = await _translated_session(client)
    resp = await _share_translation(client, sid, start=1, end=0)
    assert resp.status_code == 422


async def test_share_note(client, test_user):
    anno = await create_annotation(
        test_user["id"], 1, 0, "Die Sonne tönt, nach alter Weise.", "wonderful opening", "yellow"
    )
    resp = await client.post("/api/stories", json={
        "kind": "note", "book_id": 1, "chapter_index": 0,
        "annotation_id": anno["id"], "caption": "my thought",
    })
    assert resp.status_code == 200
    assert resp.json()["kind"] == "note"
    assert resp.json()["annotation_id"] == anno["id"]


async def test_note_story_rejects_foreign_annotation(client, test_user):
    resp = await client.post("/api/stories", json={
        "kind": "note", "book_id": 1, "chapter_index": 0, "annotation_id": 999,
    })
    assert resp.status_code == 404


# ── Listing: live references ─────────────────────────────────────────────────

async def test_list_returns_live_paragraphs_and_author(client, test_user):
    sid = await _translated_session(client)
    await _share_translation(client, sid, start=0, end=1)
    data = (await client.get("/api/stories", params={"book_id": 1, "chapter_index": 0})).json()
    assert len(data["stories"]) == 1
    story = data["stories"][0]
    assert story["author_name"] == test_user["name"]
    assert story["session_name"] == "诗意版"
    assert story["target_language"] == "zh"
    assert [p["paragraph_index"] for p in story["paragraphs"]] == [0, 1]
    assert story["comment_count"] == 0


async def test_story_reflects_improved_rendering(client, test_user):
    """Stories snapshot nothing — editing the session paragraph changes the story."""
    sid = await _translated_session(client)
    await _share_translation(client, sid)
    await upsert_session_paragraph(sid, 0, 0, "改进后的译文。", "deepseek", "deepseek-v4-flash", edited_by_user=True)
    data = (await client.get("/api/stories", params={"book_id": 1})).json()
    assert data["stories"][0]["paragraphs"][0]["text"] == "改进后的译文。"


async def test_list_includes_note_anchor(client, test_user):
    anno = await create_annotation(test_user["id"], 1, 0, "Die Sonne tönt.", "thought", "blue")
    await client.post("/api/stories", json={
        "kind": "note", "book_id": 1, "chapter_index": 0, "annotation_id": anno["id"],
    })
    story = (await client.get("/api/stories", params={"book_id": 1})).json()["stories"][0]
    assert story["sentence_text"] == "Die Sonne tönt."
    assert story["note_text"] == "thought"


async def test_list_unknown_book_is_404(client):
    resp = await client.get("/api/stories", params={"book_id": 999})
    assert resp.status_code == 404


# ── Deleting ─────────────────────────────────────────────────────────────────

async def test_author_deletes_own_story(client, test_user):
    sid = await _translated_session(client)
    story_id = (await _share_translation(client, sid)).json()["id"]
    assert (await client.delete(f"/api/stories/{story_id}")).status_code == 200
    assert (await client.get("/api/stories", params={"book_id": 1})).json()["stories"] == []


async def test_delete_unknown_story_is_404(client):
    assert (await client.delete("/api/stories/999")).status_code == 404


# ── Comments ─────────────────────────────────────────────────────────────────

async def test_comment_roundtrip(client, test_user):
    sid = await _translated_session(client)
    story_id = (await _share_translation(client, sid)).json()["id"]

    resp = await client.post(f"/api/stories/{story_id}/comments", json={"body": "beautiful rendering"})
    assert resp.status_code == 200
    assert resp.json()["author_name"] == test_user["name"]

    comments = (await client.get(f"/api/stories/{story_id}/comments")).json()["comments"]
    assert [c["body"] for c in comments] == ["beautiful rendering"]

    # comment_count surfaces on the story list
    story = (await client.get("/api/stories", params={"book_id": 1})).json()["stories"][0]
    assert story["comment_count"] == 1


async def test_comment_on_unknown_story_is_404(client):
    resp = await client.post("/api/stories/999/comments", json={"body": "hi"})
    assert resp.status_code == 404


async def test_delete_own_comment(client, test_user):
    sid = await _translated_session(client)
    story_id = (await _share_translation(client, sid)).json()["id"]
    cid = (await client.post(f"/api/stories/{story_id}/comments", json={"body": "x"})).json()["id"]
    assert (await client.delete(f"/api/stories/comments/{cid}")).status_code == 200
    assert (await client.get(f"/api/stories/{story_id}/comments")).json()["comments"] == []


async def test_deleting_story_cascades_comments(client, test_user):
    sid = await _translated_session(client)
    story_id = (await _share_translation(client, sid)).json()["id"]
    await client.post(f"/api/stories/{story_id}/comments", json={"body": "x"})
    await client.delete(f"/api/stories/{story_id}")
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        async with db.execute("SELECT COUNT(*) FROM story_comments") as c:
            assert (await c.fetchone())[0] == 0


# ── Discover feed ────────────────────────────────────────────────────────────

async def test_feed_lists_recent_stories_with_book_title(client, test_user):
    sid = await _translated_session(client)
    await _share_translation(client, sid)
    anno = await create_annotation(test_user["id"], 1, 0, "Die Sonne tönt.", "t", "yellow")
    await client.post("/api/stories", json={
        "kind": "note", "book_id": 1, "chapter_index": 0, "annotation_id": anno["id"],
    })
    data = (await client.get("/api/stories/feed")).json()
    assert len(data["stories"]) == 2
    assert data["stories"][0]["book_title"] == "Faust"
    kinds = {s["kind"] for s in data["stories"]}
    assert kinds == {"translation", "note"}
