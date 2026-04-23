"""In-app full-text search across the user's annotations, vocabulary, and uploaded chapters.

Issue #592 / #648. See docs/design/fts5-in-app-search.md.
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from services.auth import get_current_user
from services.search import MAX_LIMIT, MAX_QUERY_LEN, SCOPES, search_content

router = APIRouter(prefix="/search", tags=["search"])


def _parse_scope(raw: str | None) -> list[str]:
    if not raw:
        return list(SCOPES)
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    invalid = [p for p in parts if p not in SCOPES]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown scope(s): {','.join(invalid)}. Valid: {','.join(SCOPES)}.",
        )
    return parts or list(SCOPES)


@router.get("")
async def search(
    q: str = Query(..., min_length=1, max_length=MAX_QUERY_LEN),
    scope: str | None = Query(None, max_length=200),
    limit: int = Query(20, ge=1, le=MAX_LIMIT),
    user: dict = Depends(get_current_user),
):
    """Return ranked FTS5 matches from the caller's own content.

    Query params:
      q     : required, 1..200 chars (trimmed; whitespace-only rejected)
      scope : optional CSV of scope names (annotations,vocabulary,chapters).
              Omitted → all scopes.
      limit : optional, 1..50 results per scope.
    """
    if not q.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")
    scopes = _parse_scope(scope)
    return await search_content(user_id=user["id"], q=q, scope=scopes, limit=limit)
