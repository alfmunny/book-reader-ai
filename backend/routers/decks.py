"""Router for user-owned study decks (issue #645).

Endpoints:
    GET    /decks                    — list the user's decks
    POST   /decks                    — create a deck
    GET    /decks/{id}               — fetch a single deck with resolved members
    PATCH  /decks/{id}               — edit name/description/rules_json
    DELETE /decks/{id}               — delete a deck (cascades members)
    POST   /decks/{id}/members       — add a word to a manual deck
    DELETE /decks/{id}/members/{vid} — remove a word from a manual deck
"""

from __future__ import annotations

from typing import Annotated, Literal

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel, Field

from services import decks as decks_service
from services.auth import get_current_user

router = APIRouter(prefix="/decks", tags=["decks"])


class SmartRules(BaseModel):
    """Allowed filter keys on a smart deck. All fields optional; unknown keys
    are rejected at the Pydantic layer (`extra='forbid'`)."""
    language: str | None = Field(default=None, min_length=1, max_length=20)
    book_ids: list[Annotated[int, Field(ge=1)]] | None = Field(default=None, max_length=200)
    tags_any: list[Annotated[str, Field(min_length=1, max_length=50)]] | None = Field(default=None, max_length=100)
    tags_all: list[Annotated[str, Field(min_length=1, max_length=50)]] | None = Field(default=None, max_length=100)
    saved_after: str | None = Field(default=None, pattern=r'^\d{4}-\d{2}-\d{2}$')
    saved_before: str | None = Field(default=None, pattern=r'^\d{4}-\d{2}-\d{2}$')

    model_config = {"extra": "forbid"}


class DeckCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    description: str = Field(default="", max_length=500)
    mode: Literal["manual", "smart"]
    rules_json: SmartRules | None = None


class DeckPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    rules_json: SmartRules | None = None


class MemberAdd(BaseModel):
    vocabulary_id: int = Field(..., ge=1)


def _dump_rules(r: SmartRules | None) -> dict | None:
    if r is None:
        return None
    return r.model_dump(exclude_none=True)


@router.get("")
async def list_my_decks(user: dict = Depends(get_current_user)):
    return await decks_service.list_decks(user["id"])


@router.post("", status_code=201)
async def create_deck(req: DeckCreate, user: dict = Depends(get_current_user)):
    try:
        return await decks_service.create_deck(
            user["id"],
            req.name.strip(),
            req.description,
            req.mode,
            _dump_rules(req.rules_json),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except aiosqlite.IntegrityError:
        raise HTTPException(status_code=409, detail="A deck with this name already exists")


@router.get("/{deck_id}")
async def get_deck(
    deck_id: int = Path(..., ge=1),
    user: dict = Depends(get_current_user),
):
    deck = await decks_service.get_deck(user["id"], deck_id)
    if deck is None:
        raise HTTPException(status_code=404, detail="Deck not found")
    return deck


@router.patch("/{deck_id}")
async def patch_deck(
    req: DeckPatch,
    deck_id: int = Path(..., ge=1),
    user: dict = Depends(get_current_user),
):
    existing = await decks_service.get_deck(user["id"], deck_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Deck not found")
    try:
        updated = await decks_service.update_deck(
            user["id"],
            deck_id,
            name=req.name.strip() if req.name is not None else None,
            description=req.description,
            rules_json=_dump_rules(req.rules_json),
            rules_provided=("rules_json" in req.model_fields_set),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return updated


@router.delete("/{deck_id}", status_code=204)
async def delete_deck(
    deck_id: int = Path(..., ge=1),
    user: dict = Depends(get_current_user),
):
    deleted = await decks_service.delete_deck(user["id"], deck_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Deck not found")
    return None


@router.post("/{deck_id}/members", status_code=201)
async def add_member(
    req: MemberAdd,
    deck_id: int = Path(..., ge=1),
    user: dict = Depends(get_current_user),
):
    try:
        ok = await decks_service.add_manual_member(user["id"], deck_id, req.vocabulary_id)
    except ValueError as e:
        # Smart deck — cannot add members
        raise HTTPException(status_code=409, detail=str(e))
    if not ok:
        raise HTTPException(status_code=404, detail="Deck or vocabulary not found")
    return {"vocabulary_id": req.vocabulary_id}


@router.delete("/{deck_id}/members/{vocabulary_id}", status_code=204)
async def remove_member(
    deck_id: int = Path(..., ge=1),
    vocabulary_id: int = Path(..., ge=1),
    user: dict = Depends(get_current_user),
):
    removed = await decks_service.remove_manual_member(user["id"], deck_id, vocabulary_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Deck member not found")
    return None
