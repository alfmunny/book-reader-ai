"""Unified FTS5 search over user annotations, vocabulary context, and uploaded chapters.

Issue #592, implementation of docs/design/fts5-in-app-search.md.

Results are ALWAYS user-scoped — the user_id filter is applied on every
JOIN back to the source table so one user's query never returns another
user's content.
"""

from __future__ import annotations

import aiosqlite

import services.db as _db

# Max chars per query — enforced at the router layer too, but we also
# defensively cap inside the service in case of direct callers.
MAX_QUERY_LEN = 200
MAX_LIMIT = 50

SCOPES = ("annotations", "vocabulary", "chapters")


def _prepare_fts_query(q: str) -> str:
    """Escape a user query for FTS5 MATCH.

    FTS5 MATCH is not plain text — raw user input can produce parser errors
    on unbalanced quotes, `AND`/`OR`/`NOT`, bare `*`, column filters, etc.
    We wrap the stripped query in double quotes after escaping any internal
    double quotes, turning the whole thing into a phrase search. Advanced
    syntax (opt-in) is a follow-up design.
    """
    cleaned = q.strip()
    # Escape embedded double quotes by doubling them, then wrap.
    return '"' + cleaned.replace('"', '""') + '"'


async def search_content(
    user_id: int,
    q: str,
    scope: list[str] | None = None,
    limit: int = 20,
) -> dict:
    """Run the FTS5 query across the requested scopes and return merged results.

    Returns a dict with shape:
        {"query": q, "results": [...], "total": int}
    Each result has a "type" key in {"annotation", "vocabulary", "chapter"}.
    """
    q = (q or "").strip()
    if not q:
        return {"query": q, "results": [], "total": 0}
    if len(q) > MAX_QUERY_LEN:
        q = q[:MAX_QUERY_LEN]
    if scope is None:
        scope = list(SCOPES)
    scope = [s for s in scope if s in SCOPES]
    if not scope:
        return {"query": q, "results": [], "total": 0}
    if limit < 1:
        limit = 1
    if limit > MAX_LIMIT:
        limit = MAX_LIMIT

    match_q = _prepare_fts_query(q)
    results: list[dict] = []

    async with aiosqlite.connect(_db.DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        if "annotations" in scope:
            async with db.execute(
                """
                SELECT a.id, a.book_id, b.title AS book_title, a.chapter_index,
                       a.note_text,
                       snippet(annotations_fts, 0, '<b>', '</b>', '…', 20) AS snippet
                FROM annotations_fts
                JOIN annotations a ON annotations_fts.rowid = a.id
                LEFT JOIN books b ON a.book_id = b.id
                WHERE annotations_fts MATCH ? AND a.user_id = ?
                ORDER BY rank
                LIMIT ?
                """,
                (match_q, user_id, limit),
            ) as cur:
                async for row in cur:
                    results.append({
                        "type": "annotation",
                        "id": row["id"],
                        "book_id": row["book_id"],
                        "book_title": row["book_title"] or "",
                        "chapter_index": row["chapter_index"],
                        "snippet": row["snippet"],
                        "note_text": row["note_text"],
                    })

        if "vocabulary" in scope:
            async with db.execute(
                """
                SELECT v.word, wo.id AS occurrence_id, wo.book_id,
                       b.title AS book_title, wo.chapter_index,
                       snippet(word_occurrences_fts, 0, '<b>', '</b>', '…', 20) AS snippet
                FROM word_occurrences_fts
                JOIN word_occurrences wo ON word_occurrences_fts.rowid = wo.id
                JOIN vocabulary v ON wo.vocabulary_id = v.id
                LEFT JOIN books b ON wo.book_id = b.id
                WHERE word_occurrences_fts MATCH ? AND v.user_id = ?
                ORDER BY rank
                LIMIT ?
                """,
                (match_q, user_id, limit),
            ) as cur:
                async for row in cur:
                    results.append({
                        "type": "vocabulary",
                        "word": row["word"],
                        "occurrence_id": row["occurrence_id"],
                        "book_id": row["book_id"],
                        "book_title": row["book_title"] or "",
                        "chapter_index": row["chapter_index"],
                        "snippet": row["snippet"],
                    })

        if "chapters" in scope:
            async with db.execute(
                """
                SELECT uc.id, uc.book_id, b.title AS book_title, uc.chapter_index,
                       uc.title AS chapter_title,
                       snippet(user_chapters_fts, 1, '<b>', '</b>', '…', 30) AS snippet
                FROM user_chapters_fts
                JOIN user_book_chapters uc ON user_chapters_fts.rowid = uc.id
                JOIN books b ON uc.book_id = b.id
                WHERE user_chapters_fts MATCH ?
                  AND uc.is_draft = 0
                  AND b.source = 'upload'
                  AND b.owner_user_id = ?
                ORDER BY rank
                LIMIT ?
                """,
                (match_q, user_id, limit),
            ) as cur:
                async for row in cur:
                    results.append({
                        "type": "chapter",
                        "id": row["id"],
                        "book_id": row["book_id"],
                        "book_title": row["book_title"] or "",
                        "chapter_index": row["chapter_index"],
                        "chapter_title": row["chapter_title"],
                        "snippet": row["snippet"],
                    })

    return {"query": q, "results": results, "total": len(results)}
