"""
Story shares — phase 2 track A backend
(design: docs/design/user-translations.md phase 2; issue #2752).
"""

import aiosqlite
import pytest
import services.db as db_module
from services.db import save_book, upsert_session_paragraph, create_annotation

_META = {"title": "Faust", "authors": ["Goethe"], "languages": ["de"], "subjects": [], "download_count": 0, "cover": ""}
# First block is multi-line — a lone short first line would be classified
# as a heading by the chapter splitter and stripped from the body.
_TEXT = "Die Sonne tönt, nach alter Weise.\nIn Brudersphären Wettgesang.\n\nEs schäumt das Meer in breiten Flüssen."


@pytest.fixture(autouse=True)
async def _seed_book(client):
    await save_book(1, _META, _TEXT)


async def _make_session(client, name="诗意版", status="private"):
    resp = await client.post("/api/translation-sessions", json={
        "book_id": 1, "name": name, "target_language": "zh", "provider": "deepseek",
        "status": status,
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
    assert "author_picture" in story
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


# ── Follow graph + Following timeline ───────────────────────────────────────

async def _second_author_story(book_id=1):
    """A story by a second (non-caller) user, inserted directly."""
    from services.db import get_or_create_user, create_story
    other = await get_or_create_user(google_id="g-mira", email="mira@example.com", name="Mira", picture="")
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        cur = await db.execute(
            "INSERT INTO translation_sessions (user_id, book_id, name, target_language, provider) VALUES (?, ?, 'M', 'zh', 'deepseek')",
            (other["id"], book_id),
        )
        sid = cur.lastrowid
        await db.execute(
            "INSERT INTO translation_session_paragraphs (session_id, chapter_index, paragraph_index, text, provider, model) VALUES (?, 0, 0, 'x', 'deepseek', 'm')",
            (sid,),
        )
        await db.commit()
    story = await create_story(other["id"], {
        "kind": "translation", "book_id": book_id, "chapter_index": 0,
        "session_id": sid, "paragraph_start": 0, "paragraph_end": 0,
    })
    return other, story


async def test_follow_and_following_timeline(client, test_user):
    other, _story = await _second_author_story()
    # Own story too — must NOT appear in the following timeline
    sid = await _translated_session(client)
    await _share_translation(client, sid)

    # Empty before following
    empty = (await client.get("/api/stories/feed", params={"scope": "following"})).json()
    assert empty["stories"] == []

    assert (await client.post(f"/api/stories/follow/{other['id']}")).status_code == 200
    timeline = (await client.get("/api/stories/feed", params={"scope": "following"})).json()
    assert [s["author_name"] for s in timeline["stories"]] == ["Mira"]
    assert timeline["stories"][0]["following_author"] is True

    # The full feed flags followed authors
    full = (await client.get("/api/stories/feed")).json()
    flags = {s["author_name"]: s["following_author"] for s in full["stories"]}
    assert flags["Mira"] is True and flags[test_user["name"]] is False


async def test_unfollow_empties_the_timeline(client, test_user):
    other, _ = await _second_author_story()
    await client.post(f"/api/stories/follow/{other['id']}")
    assert (await client.delete(f"/api/stories/follow/{other['id']}")).status_code == 200
    timeline = (await client.get("/api/stories/feed", params={"scope": "following"})).json()
    assert timeline["stories"] == []
    # Unfollowing again is a 404
    assert (await client.delete(f"/api/stories/follow/{other['id']}")).status_code == 404


async def test_cannot_follow_yourself_or_ghosts(client, test_user):
    assert (await client.post(f"/api/stories/follow/{test_user['id']}")).status_code == 422
    assert (await client.post("/api/stories/follow/9999")).status_code == 404


# ── Editorial comment anchors + replies (migration 050) ─────────────────────

async def test_editorial_comment_roundtrip_and_replies(client, test_user):
    anchor = {"book_id": 1, "target_language": "zh", "chapter_index": 0, "paragraph_index": 1}
    resp = await client.post("/api/stories/comments/editorial", json={**anchor, "body": "编辑版这段译得稳。"})
    assert resp.status_code == 200
    top = resp.json()
    assert top["author_name"] == test_user["name"]

    reply = (await client.post("/api/stories/comments/editorial", json={
        **anchor, "body": "同意。", "parent_id": top["id"],
    })).json()
    assert reply["parent_comment_id"] == top["id"]

    listed = (await client.get("/api/stories/comments/editorial", params=anchor)).json()["comments"]
    assert [c["body"] for c in listed] == ["编辑版这段译得稳。", "同意。"]
    # A different paragraph is a different anchor
    other = (await client.get("/api/stories/comments/editorial", params={**anchor, "paragraph_index": 2})).json()
    assert other["comments"] == []


async def test_story_comment_replies(client, test_user):
    sid = await _translated_session(client)
    story_id = (await _share_translation(client, sid)).json()["id"]
    top = (await client.post(f"/api/stories/{story_id}/comments", json={"body": "top"})).json()
    reply = (await client.post(f"/api/stories/{story_id}/comments", json={"body": "reply", "parent_id": top["id"]})).json()
    assert reply["parent_comment_id"] == top["id"]
    listed = (await client.get(f"/api/stories/{story_id}/comments")).json()["comments"]
    assert len(listed) == 2


async def test_editorial_comment_unknown_book_404(client):
    resp = await client.post("/api/stories/comments/editorial", json={
        "book_id": 999, "target_language": "zh", "chapter_index": 0, "paragraph_index": 0, "body": "x",
    })
    assert resp.status_code == 404


# ── Posted paragraphs are protected from retranslation (owner, 2026-08-31) ──

async def test_paragraph_retranslate_refused_when_posted(client, test_user):
    from services.auth import encrypt_api_key
    from services.db import set_user_deepseek_key
    await set_user_deepseek_key(test_user["id"], encrypt_api_key("k"))
    sid = await _translated_session(client)
    await _share_translation(client, sid, start=0, end=0)
    resp = await client.post(f"/api/translation-sessions/{sid}/translate", json={
        "book_id": 1, "chapter_index": 0, "scope": 0,
    })
    assert resp.status_code == 409
    assert "make it private" in resp.json()["detail"]


async def test_force_chapter_run_keeps_posted_paragraphs(client, test_user):
    from unittest.mock import AsyncMock, patch
    from services.auth import encrypt_api_key
    from services.db import set_user_deepseek_key
    await set_user_deepseek_key(test_user["id"], encrypt_api_key("k"))

    sid = await _translated_session(client)
    await _share_translation(client, sid, start=0, end=0)  # paragraph 0 posted
    with patch("services.user_translate.translate_paragraph",
               new=AsyncMock(return_value=("机器重译", "deepseek-v4-flash"))):
        resp = await client.post(f"/api/translation-sessions/{sid}/translate", json={
            "book_id": 1, "chapter_index": 0, "scope": "chapter", "force": True,
        })
        assert resp.status_code == 200
        assert resp.json()["run"]["total"] == 1, resp.json()
        # Wait for the background run to finish
        run = None
        for _ in range(100):
            ch = (await client.get(f"/api/translation-sessions/{sid}/chapters/0")).json()
            run = ch.get("run")
            if not (run or {}).get("active"):
                break
            import asyncio as _a; await _a.sleep(0.05)
    assert not (run or {}).get("error"), run
    paras = (await client.get(f"/api/translation-sessions/{sid}/chapters/0")).json()["paragraphs"]
    assert paras["0"]["text"] == "太阳依着古老的方式轰腾。" if False else paras["0"]["text"] == "太阳依着古老的方式轰鸣。"  # posted → untouched
    assert paras["1"]["text"] == "机器重译"  # unposted machine paragraph → redone


# ── Public sessions auto-post their renderings (owner, 2026-08-28) ──────────

async def test_public_session_autoposts_translations(client, test_user):
    from unittest.mock import AsyncMock, patch
    from services.auth import encrypt_api_key
    from services.db import set_user_deepseek_key
    await set_user_deepseek_key(test_user["id"], encrypt_api_key("k"))

    resp = await client.post("/api/translation-sessions", json={
        "book_id": 1, "name": "公开版", "target_language": "zh",
        "provider": "deepseek", "status": "public",
    })
    assert resp.status_code == 201
    assert resp.json()["status"] == "public"
    sid = resp.json()["id"]

    with patch("services.user_translate.translate_paragraph",
               new=AsyncMock(return_value=("公开译文", "deepseek-v4-flash"))):
        await client.post(f"/api/translation-sessions/{sid}/translate", json={
            "book_id": 1, "chapter_index": 0, "scope": 0,
        })
    stories = (await client.get("/api/stories", params={"book_id": 1, "chapter_index": 0})).json()["stories"]
    mine = [s for s in stories if s["session_id"] == sid]
    assert len(mine) == 1
    assert mine[0]["paragraphs"][0]["text"] == "公开译文"


async def test_private_session_does_not_autopost(client, test_user):
    from unittest.mock import AsyncMock, patch
    from services.auth import encrypt_api_key
    from services.db import set_user_deepseek_key
    await set_user_deepseek_key(test_user["id"], encrypt_api_key("k"))
    sid = await _make_session(client, name="私有版")
    with patch("services.user_translate.translate_paragraph",
               new=AsyncMock(return_value=("私有译文", "deepseek-v4-flash"))):
        await client.post(f"/api/translation-sessions/{sid}/translate", json={
            "book_id": 1, "chapter_index": 0, "scope": 0,
        })
    stories = (await client.get("/api/stories", params={"book_id": 1, "chapter_index": 0})).json()["stories"]
    assert [s for s in stories if s["session_id"] == sid] == []


async def test_new_sessions_default_to_public(client, test_user):
    resp = await client.post("/api/translation-sessions", json={
        "book_id": 1, "name": "默认版", "target_language": "zh", "provider": "deepseek",
    })
    assert resp.status_code == 201
    assert resp.json()["status"] == "public"  # owner, 2026-08-29


# ── Notes anchor to the VERSION, not the language (owner, 2026-08-30) ───────

async def test_session_paragraph_notes_are_per_version(client, test_user):
    a = await _make_session(client, name="甲版")
    b = await _make_session(client, name="乙版")
    anchor_a = {"session_id": a, "chapter_index": 0, "paragraph_index": 0}
    anchor_b = {"session_id": b, "chapter_index": 0, "paragraph_index": 0}

    assert (await client.post("/api/stories/comments/session", json={**anchor_a, "body": "甲版的笔记"})).status_code == 200
    listed_a = (await client.get("/api/stories/comments/session", params=anchor_a)).json()["comments"]
    assert [c["body"] for c in listed_a] == ["甲版的笔记"]
    # The other version does NOT inherit it
    assert (await client.get("/api/stories/comments/session", params=anchor_b)).json()["comments"] == []
    # …nor does another paragraph of the same version
    other_para = (await client.get("/api/stories/comments/session",
                                   params={**anchor_a, "paragraph_index": 1})).json()
    assert other_para["comments"] == []


async def test_session_notes_support_replies(client, test_user):
    sid = await _make_session(client, name="回复版")
    anchor = {"session_id": sid, "chapter_index": 0, "paragraph_index": 0}
    top = (await client.post("/api/stories/comments/session", json={**anchor, "body": "顶层"})).json()
    reply = (await client.post("/api/stories/comments/session",
                               json={**anchor, "body": "回复", "parent_id": top["id"]})).json()
    assert reply["parent_comment_id"] == top["id"]
    assert len((await client.get("/api/stories/comments/session", params=anchor)).json()["comments"]) == 2


async def test_private_version_notes_are_not_readable_by_others(client, test_user):
    from services.db import get_or_create_user, create_translation_session
    other = await get_or_create_user(google_id="g-other", email="o@e.com", name="Other", picture="")
    private = await create_translation_session(other["id"], 1, "别人的私有版", "zh", "deepseek")
    resp = await client.get("/api/stories/comments/session", params={
        "session_id": private["id"], "chapter_index": 0, "paragraph_index": 0,
    })
    assert resp.status_code == 404
    # A PUBLIC version of another reader is readable
    public = await create_translation_session(other["id"], 1, "别人的公开版", "zh", "deepseek", status="public")
    ok = await client.get("/api/stories/comments/session", params={
        "session_id": public["id"], "chapter_index": 0, "paragraph_index": 0,
    })
    assert ok.status_code == 200


# ── Per-note visibility (owner, 2026-08-30) ────────────────────────────────

async def test_private_notes_are_hidden_from_other_readers(client, test_user):
    from services.db import get_or_create_user, create_translation_session, create_session_paragraph_comment
    sid = await _make_session(client, name="公开笔记版")
    await client.patch(f"/api/translation-sessions/{sid}", json={"status": "public"})
    anchor = {"session_id": sid, "chapter_index": 0, "paragraph_index": 0}

    await client.post("/api/stories/comments/session", json={**anchor, "body": "公开的笔记"})
    await client.post("/api/stories/comments/session", json={**anchor, "body": "只给自己看", "visibility": "private"})

    # The author sees both
    mine = (await client.get("/api/stories/comments/session", params=anchor)).json()["comments"]
    assert [c["body"] for c in mine] == ["公开的笔记", "只给自己看"]
    assert mine[1]["visibility"] == "private"

    # Another reader sees only the public one
    other = await get_or_create_user(google_id="g-reader", email="r@e.com", name="Reader", picture="")
    visible = await list_visible_for(sid, other["id"])
    assert [c["body"] for c in visible] == ["公开的笔记"]


async def list_visible_for(session_id: int, viewer_id: int):
    from services.db import list_session_paragraph_comments
    return await list_session_paragraph_comments(session_id, 0, 0, viewer_id)
