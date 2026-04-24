"""Tag helpers for vocabulary rows (issue #645).

Tags are user-scoped free text attached to vocabulary items. Normalization on
write: trim leading/trailing whitespace, lowercase. Empty / whitespace-only
tags are rejected.
"""

from __future__ import annotations

import aiosqlite

import services.db as _db_module

MAX_TAG_LEN = 50


def normalize_tag(raw: str) -> str:
    """Trim + lowercase. Raises ValueError on empty or overly long tags."""
    if not isinstance(raw, str):
        raise ValueError("tag must be a string")
    t = raw.strip().lower()
    if not t:
        raise ValueError("tag cannot be empty")
    if len(t) > MAX_TAG_LEN:
        raise ValueError(f"tag exceeds {MAX_TAG_LEN} chars")
    return t


async def list_user_tags(user_id: int) -> list[dict]:
    """Return all distinct tags the user has used, with word counts."""
    async with aiosqlite.connect(_db_module.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """
            SELECT tag, COUNT(DISTINCT vocabulary_id) AS word_count
            FROM vocabulary_tags
            WHERE user_id = ?
            GROUP BY tag
            ORDER BY tag
            """,
            (user_id,),
        ) as cur:
            return [dict(r) for r in await cur.fetchall()]


async def get_vocab_tags(user_id: int, vocabulary_id: int) -> list[str] | None:
    """Return the tags on a specific vocabulary word (user-scoped).

    Returns None if vocabulary_id does not belong to user_id (caller raises 404).
    """
    async with aiosqlite.connect(_db_module.DB_PATH) as db:
        async with db.execute(
            "SELECT 1 FROM vocabulary WHERE id = ? AND user_id = ?",
            (vocabulary_id, user_id),
        ) as cur:
            if await cur.fetchone() is None:
                return None
        async with db.execute(
            """
            SELECT tag FROM vocabulary_tags
            WHERE user_id = ? AND vocabulary_id = ?
            ORDER BY tag
            """,
            (user_id, vocabulary_id),
        ) as cur:
            return [r[0] for r in await cur.fetchall()]


async def add_vocab_tag(user_id: int, vocabulary_id: int, raw_tag: str) -> str | None:
    """Insert a tag after normalization. Returns the normalized tag, or None
    if the vocabulary row doesn't exist or doesn't belong to the user."""
    tag = normalize_tag(raw_tag)
    async with aiosqlite.connect(_db_module.DB_PATH) as db:
        async with db.execute(
            "SELECT 1 FROM vocabulary WHERE id = ? AND user_id = ?",
            (vocabulary_id, user_id),
        ) as cur:
            if await cur.fetchone() is None:
                return None
        await db.execute(
            """
            INSERT OR IGNORE INTO vocabulary_tags (user_id, vocabulary_id, tag)
            VALUES (?, ?, ?)
            """,
            (user_id, vocabulary_id, tag),
        )
        await db.commit()
    return tag


async def remove_vocab_tag(user_id: int, vocabulary_id: int, raw_tag: str) -> bool:
    """Returns True if a row was deleted."""
    tag = normalize_tag(raw_tag)
    async with aiosqlite.connect(_db_module.DB_PATH) as db:
        cur = await db.execute(
            """
            DELETE FROM vocabulary_tags
            WHERE user_id = ? AND vocabulary_id = ? AND tag = ?
            """,
            (user_id, vocabulary_id, tag),
        )
        await db.commit()
        return cur.rowcount > 0
