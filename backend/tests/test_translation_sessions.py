"""
Per-user translation sessions — phase 1 backend
(design: docs/design/user-translations.md, user-approved 2026-08-26; #2740).
"""

from unittest.mock import AsyncMock, patch

import aiosqlite
import pytest
import services.db as db_module
from services.auth import encrypt_api_key
from services.db import (
    list_published_sessions,
    get_readable_session,
    create_translation_session,
    save_book,
    set_user_claude_key,
    set_user_deepseek_key,
    get_or_create_user,
)
from services import user_translate

_META = {"title": "Faust", "authors": ["Goethe"], "languages": ["de"], "subjects": [], "download_count": 0, "cover": ""}
# Two paragraphs (split on blank line) — the editorial split contract.
_TEXT = "Die Sonne tönt, nach alter Weise.\nIn Brudersphären Wettgesang.\n\nEs schäumt das Meer in breiten Flüssen."


@pytest.fixture(autouse=True)
async def _seed_book(client):
    await save_book(1, _META, _TEXT)


async def _create(client, name="诗意版", provider="deepseek", lang="zh", style="优雅的书面语"):
    # Explicitly private: these tests cover the core translate mechanics;
    # public-session auto-posting is covered in test_stories.
    resp = await client.post("/api/translation-sessions", json={
        "book_id": 1, "name": name, "target_language": lang,
        "provider": provider, "style_prompt": style, "status": "private",
    })
    return resp


# ── Migration ────────────────────────────────────────────────────────────────

async def test_migration_tables_exist(client):
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        for table in ("translation_sessions", "translation_session_paragraphs"):
            async with db.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
            ) as c:
                assert await c.fetchone() is not None, table


# ── Session CRUD ─────────────────────────────────────────────────────────────

async def test_create_and_list_sessions(client, test_user):
    resp = await _create(client)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "诗意版"
    assert data["target_language"] == "zh"
    assert data["provider"] == "deepseek"
    assert data["status"] == "private"

    listed = (await client.get("/api/translation-sessions", params={"book_id": 1})).json()
    assert len(listed) == 1
    assert listed[0]["coverage"] == {}


async def test_duplicate_name_is_409(client, test_user):
    await _create(client)
    resp = await _create(client)
    assert resp.status_code == 409
    assert "诗意版" in resp.json()["detail"]
    assert "version" in resp.json()["detail"]


async def test_rename_and_retune(client, test_user):
    sid = (await _create(client)).json()["id"]
    resp = await client.patch(f"/api/translation-sessions/{sid}", json={
        "name": "直译版", "provider": "claude", "style_prompt": "直译"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "直译版"
    assert data["provider"] == "claude"
    assert data["style_prompt"] == "直译"


async def test_target_language_changeable_mid_version(client, test_user):
    """Owner decision (2026-08-27): the language is editable on an existing
    version; already-translated paragraphs stay untouched."""
    await set_user_deepseek_key(test_user["id"], encrypt_api_key("sk-ds"))
    sid = (await _create(client, lang="zh")).json()["id"]
    with patch("services.user_translate.translate_paragraph",
               new=AsyncMock(return_value=("译文", "deepseek-v4-flash"))):
        await client.post(f"/api/translation-sessions/{sid}/translate",
                          json={"chapter_index": 0, "scope": 0})
    resp = await client.patch(f"/api/translation-sessions/{sid}", json={"target_language": "EN-us"})
    assert resp.status_code == 200
    assert resp.json()["target_language"] == "en"
    data = (await client.get(f"/api/translation-sessions/{sid}/chapters/0")).json()
    assert data["paragraphs"]["0"]["text"] == "译文"  # old-language paragraph survives


async def test_delete_session_cascades(client, test_user):
    sid = (await _create(client)).json()["id"]
    with patch("services.user_translate.translate_paragraph",
               new=AsyncMock(return_value=("译文", "deepseek-v4-flash"))):
        await set_user_deepseek_key(test_user["id"], encrypt_api_key("sk-ds"))
        await client.post(f"/api/translation-sessions/{sid}/translate",
                          json={"chapter_index": 0, "scope": 0})
    assert (await client.delete(f"/api/translation-sessions/{sid}")).status_code == 200
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        async with db.execute("SELECT COUNT(*) FROM translation_session_paragraphs") as c:
            assert (await c.fetchone())[0] == 0


async def test_foreign_session_is_404(client, test_user):
    sid = (await _create(client)).json()["id"]
    other = await get_or_create_user("g-x", "x@example.com", "X", "")
    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute("UPDATE translation_sessions SET user_id = ? WHERE id = ?", (other["id"], sid))
        await db.commit()
    for call in (
        client.patch(f"/api/translation-sessions/{sid}", json={"name": "hijack"}),
        client.delete(f"/api/translation-sessions/{sid}"),
        client.get(f"/api/translation-sessions/{sid}/chapters/0"),
        client.post(f"/api/translation-sessions/{sid}/translate", json={"chapter_index": 0, "scope": 0}),
    ):
        assert (await call).status_code == 404


async def _await_run(client, sid, chapter=0, tries=50):
    """Poll the chapter endpoint until the background run finishes."""
    import asyncio as _asyncio
    for _ in range(tries):
        data = (await client.get(f"/api/translation-sessions/{sid}/chapters/{chapter}")).json()
        if data.get("run") is None or not data["run"]["active"]:
            return data
        await _asyncio.sleep(0.02)
    raise AssertionError("chapter run did not finish")


# ── Translate ────────────────────────────────────────────────────────────────

async def test_translate_single_paragraph_records_model_tag(client, test_user):
    await set_user_deepseek_key(test_user["id"], encrypt_api_key("sk-ds"))
    sid = (await _create(client)).json()["id"]
    with patch("services.user_translate.translate_paragraph",
               new=AsyncMock(return_value=("太阳依着古老的方式轰鸣。", "deepseek-v4-flash"))) as mock:
        resp = await client.post(f"/api/translation-sessions/{sid}/translate",
                                 json={"chapter_index": 0, "scope": 0})
    assert resp.status_code == 200
    data = resp.json()
    assert data["paragraph_count"] == 2
    assert data["paragraphs"]["0"]["text"] == "太阳依着古老的方式轰鸣。"
    assert data["paragraphs"]["0"]["model"] == "deepseek-v4-flash"
    assert "1" not in data["paragraphs"]  # partial coverage is expected
    # style prompt reached the service
    assert mock.await_args.args[5] == "优雅的书面语"


async def test_translate_chapter_runs_in_background_with_progress(client, test_user):
    """Chapter scope returns immediately with a run status; paragraphs land
    incrementally and the run reports done/total (owner feedback: the old
    single long request rendered nothing until a reload)."""
    await set_user_deepseek_key(test_user["id"], encrypt_api_key("sk-ds"))
    sid = (await _create(client)).json()["id"]
    with patch("services.user_translate.translate_paragraph",
               new=AsyncMock(return_value=("译文", "deepseek-v4-flash"))):
        resp = await client.post(f"/api/translation-sessions/{sid}/translate",
                                 json={"chapter_index": 0, "scope": "chapter"})
        assert resp.status_code == 200
        run = resp.json()["run"]
        assert run["total"] == 2
        data = await _await_run(client, sid)
    assert set(data["paragraphs"].keys()) == {"0", "1"}


async def test_second_chapter_run_is_409_and_paragraph_locked_during_run(client, test_user):
    import asyncio as _asyncio
    await set_user_deepseek_key(test_user["id"], encrypt_api_key("sk-ds"))
    sid = (await _create(client)).json()["id"]
    gate = _asyncio.Event()

    async def _blocked(*a, **k):
        await gate.wait()
        return ("译文", "deepseek-v4-flash")

    with patch("services.user_translate.translate_paragraph", new=AsyncMock(side_effect=_blocked)):
        first = await client.post(f"/api/translation-sessions/{sid}/translate",
                                  json={"chapter_index": 0, "scope": "chapter"})
        assert first.status_code == 200 and first.json()["run"]["active"]
        second = await client.post(f"/api/translation-sessions/{sid}/translate",
                                   json={"chapter_index": 0, "scope": "chapter"})
        assert second.status_code == 409
        para = await client.post(f"/api/translation-sessions/{sid}/translate",
                                 json={"chapter_index": 0, "scope": 0})
        assert para.status_code == 409
        gate.set()
        await _await_run(client, sid)


async def test_chapter_run_error_is_reported_via_polling(client, test_user):
    await set_user_deepseek_key(test_user["id"], encrypt_api_key("sk-ds"))
    sid = (await _create(client)).json()["id"]
    with patch("services.user_translate.translate_paragraph",
               new=AsyncMock(side_effect=RuntimeError("secret boom"))):
        resp = await client.post(f"/api/translation-sessions/{sid}/translate",
                                 json={"chapter_index": 0, "scope": "chapter"})
        assert resp.status_code == 200
        data = await _await_run(client, sid)
    assert data["run"]["error"] is not None
    assert "boom" not in data["run"]["error"]
    assert "DeepSeek" in data["run"]["error"]


async def test_chapter_run_fills_missing_only_by_default(client, test_user):
    """A second chapter click never silently re-burns tokens: the default
    run translates only paragraphs with no translation yet (owner,
    2026-08-27). force=true retranslates machine paragraphs but ALWAYS
    keeps manual edits."""
    await set_user_deepseek_key(test_user["id"], encrypt_api_key("sk-ds"))
    sid = (await _create(client)).json()["id"]
    await client.patch(f"/api/translation-sessions/{sid}/chapters/0/paragraphs/0",
                       json={"text": "我亲手写的译文"})
    with patch("services.user_translate.translate_paragraph",
               new=AsyncMock(return_value=("第一轮", "deepseek-v4-flash"))):
        await client.post(f"/api/translation-sessions/{sid}/translate",
                          json={"chapter_index": 0, "scope": "chapter"})
        data = await _await_run(client, sid)
    assert data["paragraphs"]["0"]["text"] == "我亲手写的译文"  # edited kept
    assert data["paragraphs"]["1"]["text"] == "第一轮"

    # Default re-run: nothing missing → nothing re-translated
    mock = AsyncMock(return_value=("第二轮", "deepseek-v4-flash"))
    with patch("services.user_translate.translate_paragraph", new=mock):
        await client.post(f"/api/translation-sessions/{sid}/translate",
                          json={"chapter_index": 0, "scope": "chapter"})
        data = await _await_run(client, sid)
    assert mock.await_count == 0
    assert data["paragraphs"]["1"]["text"] == "第一轮"

    # Explicit retranslate: machine paragraphs redo, edits still kept
    with patch("services.user_translate.translate_paragraph",
               new=AsyncMock(return_value=("第二轮", "deepseek-v4-flash"))):
        await client.post(f"/api/translation-sessions/{sid}/translate",
                          json={"chapter_index": 0, "scope": "chapter", "force": True})
        data = await _await_run(client, sid)
    assert data["paragraphs"]["0"]["text"] == "我亲手写的译文"  # edits survive force
    assert data["paragraphs"]["1"]["text"] == "第二轮"


async def test_provider_override_uses_that_key(client, test_user):
    await set_user_claude_key(test_user["id"], encrypt_api_key("sk-ant"))
    sid = (await _create(client, provider="deepseek")).json()["id"]  # session default: deepseek
    with patch("services.user_translate.translate_paragraph",
               new=AsyncMock(return_value=("译文", "claude-sonnet-5"))) as mock:
        resp = await client.post(f"/api/translation-sessions/{sid}/translate",
                                 json={"chapter_index": 0, "scope": 0, "provider": "claude"})
    assert resp.status_code == 200
    assert mock.await_args.args[0] == "claude"
    assert mock.await_args.args[1] == "sk-ant"


async def test_translate_without_key_is_400(client, test_user):
    sid = (await _create(client)).json()["id"]
    resp = await client.post(f"/api/translation-sessions/{sid}/translate",
                             json={"chapter_index": 0, "scope": 0})
    assert resp.status_code == 400
    assert "DeepSeek" in resp.json()["detail"]


async def test_provider_error_maps_to_actionable_502(client, test_user):
    await set_user_deepseek_key(test_user["id"], encrypt_api_key("sk-ds"))
    sid = (await _create(client)).json()["id"]
    with patch("services.user_translate.translate_paragraph",
               new=AsyncMock(side_effect=RuntimeError("secret boom"))):
        resp = await client.post(f"/api/translation-sessions/{sid}/translate",
                                 json={"chapter_index": 0, "scope": 0})
    assert resp.status_code == 502
    assert "boom" not in resp.json()["detail"]
    assert "DeepSeek" in resp.json()["detail"]


async def test_paragraph_out_of_range_is_400(client, test_user):
    await set_user_deepseek_key(test_user["id"], encrypt_api_key("sk-ds"))
    sid = (await _create(client)).json()["id"]
    resp = await client.post(f"/api/translation-sessions/{sid}/translate",
                             json={"chapter_index": 0, "scope": 99})
    assert resp.status_code == 400


# ── Manual edit / delete ─────────────────────────────────────────────────────

async def test_manual_edit_keeps_model_tag_and_marks_edited(client, test_user):
    await set_user_deepseek_key(test_user["id"], encrypt_api_key("sk-ds"))
    sid = (await _create(client)).json()["id"]
    with patch("services.user_translate.translate_paragraph",
               new=AsyncMock(return_value=("机器译文", "deepseek-v4-flash"))):
        await client.post(f"/api/translation-sessions/{sid}/translate",
                          json={"chapter_index": 0, "scope": 0})
    resp = await client.patch(f"/api/translation-sessions/{sid}/chapters/0/paragraphs/0",
                              json={"text": "改过的译文"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["text"] == "改过的译文"
    assert data["model"] == "deepseek-v4-flash"   # original tag preserved
    assert data["edited_by_user"] is True


async def test_manual_paragraph_from_scratch_tags_manual(client, test_user):
    sid = (await _create(client)).json()["id"]
    resp = await client.patch(f"/api/translation-sessions/{sid}/chapters/0/paragraphs/1",
                              json={"text": "从零手写的译文"})
    assert resp.json()["model"] == "manual"


async def test_delete_paragraph(client, test_user):
    sid = (await _create(client)).json()["id"]
    await client.patch(f"/api/translation-sessions/{sid}/chapters/0/paragraphs/0",
                       json={"text": "x"})
    assert (await client.delete(f"/api/translation-sessions/{sid}/chapters/0/paragraphs/0")).status_code == 200
    assert (await client.delete(f"/api/translation-sessions/{sid}/chapters/0/paragraphs/0")).status_code == 404


# ── user_translate service ───────────────────────────────────────────────────

def test_system_prompt_appends_readers_requirements():
    s = user_translate._system("保留诗行结构")
    assert "Reader's requirements:" in s
    assert "保留诗行结构" in s
    assert user_translate._system(None) == user_translate._system("  ")


@pytest.mark.asyncio
async def test_deepseek_dispatch_returns_model_tag():
    with patch("services.user_translate._deepseek_call",
               new=AsyncMock(return_value="译文")) as mock:
        text, model = await user_translate.translate_paragraph(
            "deepseek", "sk-ds", "Die Sonne tönt", "de", "zh", "优雅"
        )
    assert text == "译文"
    assert model == "deepseek-v4-flash"
    assert "Reader's requirements:" in mock.await_args.args[1]


@pytest.mark.asyncio
async def test_deepseek_empty_content_retries_with_bigger_budget():
    """Regression (owner report, 2026-08-27): deepseek-v4-flash is a
    reasoning model — thinking can eat the whole max_tokens budget and the
    API returns 200 with EMPTY content, which we stored as blank paragraphs.
    An empty first answer retries once with a larger budget."""
    mock = AsyncMock(side_effect=["", "译文"])
    with patch("services.user_translate._deepseek_call", new=mock):
        text, model = await user_translate.translate_paragraph(
            "deepseek", "sk-ds", "Die Sonne tönt", "de", "zh", None
        )
    assert text == "译文"
    assert mock.await_count == 2
    assert mock.await_args_list[0].args[3] < mock.await_args_list[1].args[3]


@pytest.mark.asyncio
async def test_deepseek_empty_twice_raises_never_stores_blank():
    with patch("services.user_translate._deepseek_call",
               new=AsyncMock(side_effect=["", "  "])):
        with pytest.raises(RuntimeError, match="empty translation"):
            await user_translate.translate_paragraph(
                "deepseek", "sk-ds", "Die Sonne tönt", "de", "zh", None
            )


# ── Track B: whole-book publication (#2752) ─────────────────────────────────

async def _translate_everything(client, sid: int, chapters: int = 1):
    """Fill every paragraph of every chapter so the completeness gate opens."""
    with patch("services.user_translate.translate_paragraph",
               new=AsyncMock(return_value=("完整译文", "deepseek-v4-flash"))):
        for i in range(chapters):
            await client.post(f"/api/translation-sessions/{sid}/translate",
                              json={"chapter_index": i, "scope": "chapter"})
            for _ in range(100):
                ch = (await client.get(f"/api/translation-sessions/{sid}/chapters/{i}")).json()
                if not (ch.get("run") or {}).get("active"):
                    break
                import asyncio as _a
                await _a.sleep(0.05)


async def test_publish_requires_the_whole_book(client, test_user):
    await set_user_deepseek_key(test_user["id"], encrypt_api_key("sk-ds"))
    sid = (await _create(client)).json()["id"]

    # Nothing translated yet → refused, with a countable explanation
    resp = await client.post(f"/api/translation-sessions/{sid}/publish")
    assert resp.status_code == 409
    assert "whole book" in resp.json()["detail"]

    state = (await client.get(f"/api/translation-sessions/{sid}/completeness")).json()
    assert state["complete"] is False
    assert state["translated_paragraphs"] == 0
    assert state["total_paragraphs"] > 0

    await _translate_everything(client, sid)
    done = (await client.get(f"/api/translation-sessions/{sid}/completeness")).json()
    assert done["complete"] is True

    published = (await client.post(f"/api/translation-sessions/{sid}/publish")).json()
    assert published["status"] == "published"
    assert published["published_at"]


async def test_published_versions_are_listed_and_readable_by_others(client, test_user):
    await set_user_deepseek_key(test_user["id"], encrypt_api_key("sk-ds"))
    sid = (await _create(client, name="完整版")).json()["id"]
    await _translate_everything(client, sid)
    await client.post(f"/api/translation-sessions/{sid}/publish")

    # A second reader sees it in the Community list and can read its chapters
    other = await get_or_create_user(google_id="g-visitor", email="v@e.com", name="Visitor", picture="")
    listed, _ = await list_published_sessions(1, exclude_user_id=other["id"])
    assert [s["name"] for s in listed] == ["完整版"]
    assert listed[0]["author_name"] == test_user["name"]
    assert listed[0]["model_tags"] == ["deepseek-v4-flash"]

    readable = await get_readable_session(sid, other["id"])
    assert readable is not None
    # …while a private version of someone else stays invisible
    private = await create_translation_session(other["id"], 1, "他的私有版", "zh", "deepseek")
    assert await get_readable_session(private["id"], test_user["id"]) is None


async def test_unpublish_withdraws_from_the_community_list(client, test_user):
    await set_user_deepseek_key(test_user["id"], encrypt_api_key("sk-ds"))
    sid = (await _create(client, name="撤回版")).json()["id"]
    await _translate_everything(client, sid)
    await client.post(f"/api/translation-sessions/{sid}/publish")

    resp = await client.delete(f"/api/translation-sessions/{sid}/publish")
    assert resp.status_code == 200
    assert resp.json()["status"] == "public"
    other = await get_or_create_user(google_id="g-visitor2", email="v2@e.com", name="V2", picture="")
    assert (await list_published_sessions(1, exclude_user_id=other["id"]))[0] == []
    assert await get_readable_session(sid, other["id"]) is None


async def test_published_endpoint_excludes_your_own_versions(client, test_user):
    await set_user_deepseek_key(test_user["id"], encrypt_api_key("sk-ds"))
    sid = (await _create(client, name="我的完整版")).json()["id"]
    await _translate_everything(client, sid)
    await client.post(f"/api/translation-sessions/{sid}/publish")
    mine = (await client.get("/api/translation-sessions/published", params={"book_id": 1})).json()
    assert mine["items"] == []  # my own versions are already in my list


async def test_admin_can_unpublish_anyone_but_never_rewrites(client, test_user):
    """Moderation withdraws visibility; the paragraphs stay untouched."""
    from services.db import (
        create_translation_session, upsert_session_paragraph,
        set_session_publication, get_session_paragraphs, get_or_create_user,
    )
    author = await get_or_create_user(google_id="g-author", email="a@e.com", name="Author", picture="")
    sess = await create_translation_session(author["id"], 1, "他人的完整版", "zh", "deepseek")
    await upsert_session_paragraph(sess["id"], 0, 0, "他的译文", "deepseek", "m")
    await set_session_publication(sess["id"], author["id"], True)

    # A non-admin stranger cannot withdraw it
    assert await set_session_publication(sess["id"], test_user["id"], False) is None
    # An admin can
    moderated = await set_session_publication(sess["id"], test_user["id"], False, is_admin=True)
    assert moderated["status"] == "public"
    # …and the translation itself survives
    paras = await get_session_paragraphs(sess["id"], 0)
    assert paras[0]["text"] == "他的译文"


async def test_published_list_ranks_by_popularity_searches_and_pages(client, test_user):
    """The sidebar shows the top few; the dialog searches and pages the rest."""
    from services.db import (
        create_translation_session, upsert_session_paragraph,
        set_session_publication, toggle_reaction, get_or_create_user,
    )
    reader = await get_or_create_user(google_id="g-reader-x", email="rx@e.com", name="Reader X", picture="")
    made = []
    for i, (author_name, gid) in enumerate([("Mira", "g-m2"), ("Jonas", "g-j2"), ("Yuki", "g-y2")]):
        u = await get_or_create_user(google_id=gid, email=f"{gid}@e.com", name=author_name, picture="")
        sess = await create_translation_session(u["id"], 1, f"版本{i}", "zh", "deepseek")
        await upsert_session_paragraph(sess["id"], 0, 0, "译文", "deepseek", "m")
        await set_session_publication(sess["id"], u["id"], True)
        made.append(sess["id"])
    # Two likes for the middle one, one for the last → popularity order
    await toggle_reaction(reader["id"], "session", made[1])
    await toggle_reaction(test_user["id"], "session", made[1])
    await toggle_reaction(reader["id"], "session", made[2])

    ranked, _ = await list_published_sessions(1, exclude_user_id=reader["id"], sort="popular")
    assert [r["id"] for r in ranked[:2]] == [made[1], made[2]]
    assert ranked[0]["likes"] == 2

    # Search by author name
    found, _ = await list_published_sessions(1, exclude_user_id=reader["id"], q="Yuki")
    assert [r["id"] for r in found] == [made[2]]

    # Paging: first page reports more, second returns the remainder
    page1, more1 = await list_published_sessions(1, exclude_user_id=reader["id"], limit=2)
    assert len(page1) == 2 and more1 is True
    page2, more2 = await list_published_sessions(1, exclude_user_id=reader["id"], limit=2, offset=2)
    assert len(page2) == 1 and more2 is False
