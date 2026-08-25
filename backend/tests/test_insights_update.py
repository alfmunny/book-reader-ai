"""
Owner request (2026-08-26): saved insight questions must be editable on the
notes page (typo fixes for questions typed in the chat) — the answer stays
untouched. PATCH /insights/{id} updates the question with the same ownership
and validation rules as the other insight endpoints.
"""

from httpx import AsyncClient
from services.db import save_book, save_insight, get_or_create_user

_META = {"title": "Test", "authors": [], "languages": ["en"], "subjects": [], "download_count": 0, "cover": ""}


async def _create(client, book_id=1, question="What is the theem?", answer="The theme is striving."):
    await save_book(book_id, _META, "text")
    resp = await client.post(
        "/api/insights",
        json={"book_id": book_id, "chapter_index": 0, "question": question, "answer": answer},
    )
    return resp.json()


async def test_patch_updates_the_question_only(client: AsyncClient):
    ins = await _create(client)
    resp = await client.patch(f"/api/insights/{ins['id']}", json={"question": "What is the theme?"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["question"] == "What is the theme?"
    assert data["answer"] == "The theme is striving."
    assert data["id"] == ins["id"]

    listed = (await client.get("/api/insights", params={"book_id": 1})).json()
    assert listed[0]["question"] == "What is the theme?"


async def test_patch_nonexistent_returns_404(client: AsyncClient):
    resp = await client.patch("/api/insights/99999", json={"question": "Anything"})
    assert resp.status_code == 404


async def test_patch_someone_elses_insight_returns_404(client: AsyncClient, test_user):
    await save_book(2, _META, "text")
    other = await get_or_create_user("g-other", "other@example.com", "Other", "")
    ins = await save_insight(other["id"], 2, 0, "Their question", "Their answer")
    resp = await client.patch(f"/api/insights/{ins['id']}", json={"question": "Hijacked"})
    assert resp.status_code == 404


async def test_patch_blank_question_rejected(client: AsyncClient):
    ins = await _create(client, book_id=3)
    resp = await client.patch(f"/api/insights/{ins['id']}", json={"question": "   "})
    assert resp.status_code in (400, 422)
