"""Story shares — the generic share pipeline (design: user-translations.md
phase 2, issue #2752).

One pipeline for every share kind: a translated paragraph range from the
author's own translation session, or one of their annotations (highlight +
note). Stories snapshot nothing — reads JOIN the live rows, so improving a
rendering improves the story. Reading stays calm: the reader only fetches
stories when the "Show others' shares" toggle is on.
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field

from services.auth import get_current_user, check_book_access
from services.db import (
    get_cached_book,
    get_translation_session,
    get_session_paragraphs,
    create_story,
    list_stories,
    get_story,
    delete_story,
    create_story_comment,
    list_story_comments,
    delete_story_comment,
    update_story_comment,
    create_editorial_comment,
    list_editorial_comments,
    create_session_paragraph_comment,
    list_session_paragraph_comments,
    get_translation_session_any,
    count_paragraph_notes,
    toggle_reaction,
    reaction_counts,
    get_annotations,
    list_story_feed,
    follow_user,
    unfollow_user,
    list_following,
)

router = APIRouter(prefix="/stories", tags=["stories"])


class StoryCreate(BaseModel):
    kind: Literal["translation", "note"]
    book_id: int = Field(ge=1)
    chapter_index: int = Field(ge=0)
    # kind='translation'
    session_id: int | None = Field(default=None, ge=1)
    paragraph_start: int | None = Field(default=None, ge=0)
    paragraph_end: int | None = Field(default=None, ge=0)
    # kind='note'
    annotation_id: int | None = Field(default=None, ge=1)
    caption: str | None = Field(default=None, max_length=2000)


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    parent_id: int | None = Field(default=None, ge=1)
    visibility: Literal["public", "private"] = "public"
    quote: str | None = Field(default=None, max_length=1000)


class SessionParagraphCommentCreate(BaseModel):
    session_id: int = Field(ge=1)
    chapter_index: int = Field(ge=0)
    paragraph_index: int = Field(ge=0)
    body: str = Field(min_length=1, max_length=4000)
    parent_id: int | None = Field(default=None, ge=1)
    visibility: Literal["public", "private"] = "public"
    quote: str | None = Field(default=None, max_length=1000)


class CommentUpdate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    visibility: Literal["public", "private"] | None = None


class EditorialCommentCreate(BaseModel):
    book_id: int = Field(ge=1)
    target_language: str = Field(min_length=2, max_length=8)
    chapter_index: int = Field(ge=0)
    paragraph_index: int = Field(ge=0)
    body: str = Field(min_length=1, max_length=4000)
    parent_id: int | None = Field(default=None, ge=1)
    visibility: Literal["public", "private"] = "public"
    quote: str | None = Field(default=None, max_length=1000)


async def _require_book(book_id: int, user: dict) -> dict:
    book = await get_cached_book(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    check_book_access(book, user)
    return book


@router.post("")
async def create(req: StoryCreate, user: dict = Depends(get_current_user)):
    await _require_book(req.book_id, user)
    fields = req.model_dump()

    if req.kind == "translation":
        if req.session_id is None or req.paragraph_start is None or req.paragraph_end is None:
            raise HTTPException(
                status_code=422,
                detail="A translation story needs session_id, paragraph_start and paragraph_end.",
            )
        if req.paragraph_end < req.paragraph_start:
            raise HTTPException(status_code=422, detail="paragraph_end must be >= paragraph_start.")
        session = await get_translation_session(req.session_id, user["id"])
        if not session or session["book_id"] != req.book_id:
            raise HTTPException(status_code=404, detail="Version not found")
        paragraphs = await get_session_paragraphs(req.session_id, req.chapter_index)
        missing = [
            i for i in range(req.paragraph_start, req.paragraph_end + 1)
            if i not in paragraphs
        ]
        if missing:
            raise HTTPException(
                status_code=422,
                detail="Every paragraph in the shared range must be translated first.",
            )
        fields["annotation_id"] = None

    else:  # kind == "note"
        if req.annotation_id is None:
            raise HTTPException(status_code=422, detail="A note story needs annotation_id.")
        annotations = await get_annotations(user["id"], req.book_id)
        anno = next((a for a in annotations if a["id"] == req.annotation_id), None)
        if not anno:
            raise HTTPException(status_code=404, detail="Annotation not found")
        fields["chapter_index"] = anno["chapter_index"]
        fields["session_id"] = None
        fields["paragraph_start"] = None
        fields["paragraph_end"] = None

    return await create_story(user["id"], fields)


@router.get("")
async def list_for_book(
    book_id: int = Query(ge=1),
    chapter_index: int | None = Query(default=None, ge=0),
    user: dict = Depends(get_current_user),
):
    await _require_book(book_id, user)
    return {"stories": await list_stories(book_id, chapter_index)}


@router.get("/feed")
async def feed(
    scope: Literal["all", "following"] = Query(default="all"),
    user: dict = Depends(get_current_user),
):
    """Recent shares across all books — the Discover page. scope=following
    limits the timeline to authors the caller follows."""
    follower_id = user["id"] if scope == "following" else None
    stories = await list_story_feed(follower_id=follower_id)
    following = {u["id"] for u in await list_following(user["id"])}
    for s in stories:
        s["following_author"] = s["user_id"] in following
    return {"stories": stories}


@router.get("/following")
async def following(user: dict = Depends(get_current_user)):
    return {"following": await list_following(user["id"])}


@router.post("/follow/{user_id}")
async def follow(user_id: int = Path(ge=1), user: dict = Depends(get_current_user)):
    if user_id == user["id"]:
        raise HTTPException(status_code=422, detail="You cannot follow yourself.")
    from services.db import get_user_by_id
    if not await get_user_by_id(user_id):
        raise HTTPException(status_code=404, detail="User not found")
    await follow_user(user["id"], user_id)
    return {"ok": True}


@router.delete("/follow/{user_id}")
async def unfollow(user_id: int = Path(ge=1), user: dict = Depends(get_current_user)):
    if not await unfollow_user(user["id"], user_id):
        raise HTTPException(status_code=404, detail="Not following this user")
    return {"ok": True}


async def _readable_session(session_id: int, user: dict) -> dict:
    """A version's notes are visible to its owner, and to everyone once the
    version is public."""
    session = await get_translation_session_any(session_id)
    if not session or (session["user_id"] != user["id"] and session.get("status") != "public"):
        raise HTTPException(status_code=404, detail="Version not found")
    await _require_book(session["book_id"], user)
    return session


class ReactionToggle(BaseModel):
    target_kind: Literal["story", "comment"]
    target_id: int = Field(ge=1)


@router.post("/reactions")
async def toggle_like(req: ReactionToggle, user: dict = Depends(get_current_user)):
    """Like or un-like a post or a note (track B, #2752)."""
    liked = await toggle_reaction(user["id"], req.target_kind, req.target_id)
    counts = await reaction_counts(req.target_kind, [req.target_id], user["id"])
    return {"liked": liked, "count": counts.get(req.target_id, {}).get("count", 0)}


@router.get("/reactions")
async def list_likes(
    target_kind: Literal["story", "comment"] = Query(...),
    ids: str = Query(..., description="comma-separated target ids"),
    user: dict = Depends(get_current_user),
):
    parsed = [int(x) for x in ids.split(",") if x.strip().isdigit()][:200]
    counts = await reaction_counts(target_kind, parsed, user["id"])
    return {"reactions": {str(k): v for k, v in counts.items()}}


@router.get("/comments/counts")
async def paragraph_note_counts(
    chapter_index: int = Query(ge=0),
    session_id: int | None = Query(default=None, ge=1),
    book_id: int | None = Query(default=None, ge=1),
    target_language: str | None = Query(default=None, min_length=2, max_length=8),
    user: dict = Depends(get_current_user),
):
    """Per-paragraph note counts for a chapter — one call, drives the
    reading-view note marker."""
    if session_id is not None:
        await _readable_session(session_id, user)
        counts = await count_paragraph_notes(chapter_index, user["id"], session_id=session_id)
    else:
        if book_id is None or not target_language:
            raise HTTPException(status_code=422, detail="book_id and target_language are required without session_id.")
        await _require_book(book_id, user)
        counts = await count_paragraph_notes(
            chapter_index, user["id"], book_id=book_id, target_language=target_language,
        )
    return {"counts": {str(k): v for k, v in counts.items()}}


@router.get("/comments/session")
async def session_paragraph_comments(
    session_id: int = Query(ge=1),
    chapter_index: int = Query(ge=0),
    paragraph_index: int = Query(ge=0),
    user: dict = Depends(get_current_user),
):
    """Notes on ONE version's rendering of a paragraph (owner, 2026-08-30)."""
    await _readable_session(session_id, user)
    return {"comments": await list_session_paragraph_comments(session_id, chapter_index, paragraph_index, user["id"])}


@router.post("/comments/session")
async def add_session_paragraph_comment(
    req: SessionParagraphCommentCreate, user: dict = Depends(get_current_user),
):
    await _readable_session(req.session_id, user)
    return await create_session_paragraph_comment(
        req.session_id, req.chapter_index, req.paragraph_index,
        user["id"], req.body.strip(), req.parent_id, req.visibility,
        (req.quote or "").strip() or None,
    )


@router.get("/comments/editorial")
async def editorial_comments(
    book_id: int = Query(ge=1),
    target_language: str = Query(min_length=2, max_length=8),
    chapter_index: int = Query(ge=0),
    paragraph_index: int = Query(ge=0),
    user: dict = Depends(get_current_user),
):
    """Comments anchored on an editorial paragraph (owner design,
    2026-08-30: every displayed translation paragraph is an anchor)."""
    await _require_book(book_id, user)
    return {"comments": await list_editorial_comments(book_id, target_language, chapter_index, paragraph_index, user["id"])}


@router.post("/comments/editorial")
async def add_editorial_comment(req: EditorialCommentCreate, user: dict = Depends(get_current_user)):
    await _require_book(req.book_id, user)
    return await create_editorial_comment(
        req.book_id, req.target_language, req.chapter_index, req.paragraph_index,
        user["id"], req.body.strip(), req.parent_id, req.visibility,
        (req.quote or "").strip() or None,
    )


@router.patch("/comments/{comment_id}")
async def edit_comment(
    req: CommentUpdate,
    comment_id: int = Path(ge=1),
    user: dict = Depends(get_current_user),
):
    """Edit your own note or reply (owner, 2026-08-30)."""
    updated = await update_story_comment(comment_id, user["id"], req.body.strip(), req.visibility)
    if not updated:
        raise HTTPException(status_code=404, detail="Comment not found")
    return updated


@router.delete("/comments/{comment_id}")
async def remove_comment(comment_id: int = Path(ge=1), user: dict = Depends(get_current_user)):
    if not await delete_story_comment(comment_id, user["id"], is_admin=user.get("role") == "admin"):
        raise HTTPException(status_code=404, detail="Comment not found")
    return {"ok": True}


@router.delete("/{story_id}")
async def delete(story_id: int = Path(ge=1), user: dict = Depends(get_current_user)):
    if not await delete_story(story_id, user["id"], is_admin=user.get("role") == "admin"):
        raise HTTPException(status_code=404, detail="Story not found")
    return {"ok": True}


@router.post("/{story_id}/comments")
async def add_comment(
    req: CommentCreate,
    story_id: int = Path(ge=1),
    user: dict = Depends(get_current_user),
):
    story = await get_story(story_id)
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    await _require_book(story["book_id"], user)
    return await create_story_comment(
        story_id, user["id"], req.body.strip(), req.parent_id, req.visibility,
        (req.quote or "").strip() or None,
    )


@router.get("/{story_id}/comments")
async def get_comments(story_id: int = Path(ge=1), user: dict = Depends(get_current_user)):
    story = await get_story(story_id)
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    await _require_book(story["book_id"], user)
    return {"comments": await list_story_comments(story_id, user["id"])}
