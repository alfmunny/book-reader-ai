"""Decks service — custom study decks backing the vocab tags/decks feature
(issue #645). Design doc: docs/design/vocab-tags-decks.md.

Two deck modes:
    manual — explicit membership via deck_members rows
    smart  — membership resolved at query time from rules_json

All functions are user-scoped: the user_id is part of every query so a user can
never see or modify another user's deck.
"""

from __future__ import annotations

import json

import aiosqlite

import services.db as _db_module

ALLOWED_RULE_KEYS = {
    "language",
    "book_ids",
    "tags_any",
    "tags_all",
    "saved_after",
    "saved_before",
}


def _validate_rules(rules: dict | None) -> None:
    """Raise ValueError if rules_json contains unsupported keys or bad shapes."""
    if rules is None:
        return
    if not isinstance(rules, dict):
        raise ValueError("rules_json must be an object")
    unknown = set(rules.keys()) - ALLOWED_RULE_KEYS
    if unknown:
        raise ValueError(f"Unknown rule keys: {sorted(unknown)}")
    if "language" in rules and not isinstance(rules["language"], str):
        raise ValueError("language must be a string")
    for k in ("book_ids",):
        if k in rules:
            v = rules[k]
            if not isinstance(v, list) or not all(isinstance(x, int) for x in v):
                raise ValueError(f"{k} must be a list of integers")
    for k in ("tags_any", "tags_all"):
        if k in rules:
            v = rules[k]
            if not isinstance(v, list) or not all(isinstance(x, str) for x in v):
                raise ValueError(f"{k} must be a list of strings")
    for k in ("saved_after", "saved_before"):
        if k in rules and not isinstance(rules[k], str):
            raise ValueError(f"{k} must be a YYYY-MM-DD string")


async def list_decks(user_id: int) -> list[dict]:
    """Return the user's decks with member count and due-today count."""
    # Make sure flashcard_reviews rows exist for every word so due_today counts
    # match what a user sees on the flashcards page.
    await _db_module._ensure_flashcard_rows(user_id)
    async with aiosqlite.connect(_db_module.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """
            SELECT id, name, description, mode, rules_json, created_at, updated_at
            FROM decks
            WHERE user_id = ?
            ORDER BY LOWER(name)
            """,
            (user_id,),
        ) as cur:
            decks = [dict(r) for r in await cur.fetchall()]

        for d in decks:
            members = await _resolve_member_ids(db, user_id, d)
            d["member_count"] = len(members)
            if not members:
                d["due_today"] = 0
                continue
            placeholders = ",".join(["?"] * len(members))
            async with db.execute(
                f"""
                SELECT COUNT(*) FROM flashcard_reviews
                WHERE user_id = ? AND due_date <= date('now')
                  AND vocabulary_id IN ({placeholders})
                """,
                (user_id, *members),
            ) as cur:
                d["due_today"] = (await cur.fetchone())[0]
    return decks


async def get_deck(user_id: int, deck_id: int) -> dict | None:
    async with aiosqlite.connect(_db_module.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM decks WHERE id = ? AND user_id = ?",
            (deck_id, user_id),
        ) as cur:
            row = await cur.fetchone()
        if row is None:
            return None
        deck = dict(row)
        deck["members"] = await _resolve_member_ids(db, user_id, deck)
    return deck


async def create_deck(
    user_id: int,
    name: str,
    description: str,
    mode: str,
    rules_json: dict | None,
) -> dict:
    if mode not in ("manual", "smart"):
        raise ValueError("mode must be 'manual' or 'smart'")
    if mode == "smart":
        _validate_rules(rules_json)
    rules_text = json.dumps(rules_json) if rules_json is not None else None
    async with aiosqlite.connect(_db_module.DB_PATH) as db:
        cur = await db.execute(
            """
            INSERT INTO decks (user_id, name, description, mode, rules_json)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user_id, name, description, mode, rules_text),
        )
        deck_id = cur.lastrowid
        await db.commit()
    created = await get_deck(user_id, deck_id)
    if created is None:
        raise RuntimeError("deck INSERT succeeded but SELECT returned None")
    return created


async def update_deck(
    user_id: int,
    deck_id: int,
    name: str | None = None,
    description: str | None = None,
    rules_json: dict | None = None,
    rules_provided: bool = False,
) -> dict | None:
    """Patch subset of deck fields. rules_provided distinguishes "didn't touch"
    from "explicitly set to null"; needed because rules_json defaults to None
    for manual decks too.
    """
    fields: list[str] = []
    params: list = []
    if name is not None:
        fields.append("name = ?")
        params.append(name)
    if description is not None:
        fields.append("description = ?")
        params.append(description)
    if rules_provided:
        _validate_rules(rules_json)
        fields.append("rules_json = ?")
        params.append(json.dumps(rules_json) if rules_json is not None else None)
    if not fields:
        return await get_deck(user_id, deck_id)
    fields.append("updated_at = CURRENT_TIMESTAMP")
    params.extend([deck_id, user_id])
    async with aiosqlite.connect(_db_module.DB_PATH) as db:
        await db.execute(
            f"UPDATE decks SET {', '.join(fields)} WHERE id = ? AND user_id = ?",
            params,
        )
        await db.commit()
    return await get_deck(user_id, deck_id)


async def delete_deck(user_id: int, deck_id: int) -> bool:
    async with aiosqlite.connect(_db_module.DB_PATH) as db:
        cur = await db.execute(
            "DELETE FROM decks WHERE id = ? AND user_id = ?",
            (deck_id, user_id),
        )
        await db.commit()
        return cur.rowcount > 0


async def add_manual_member(user_id: int, deck_id: int, vocabulary_id: int) -> bool:
    """Returns True if the deck exists, belongs to the user, is manual mode,
    and the word exists and belongs to the user. False means 404."""
    async with aiosqlite.connect(_db_module.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT mode FROM decks WHERE id = ? AND user_id = ?",
            (deck_id, user_id),
        ) as cur:
            deck = await cur.fetchone()
        if deck is None:
            return False
        if deck["mode"] != "manual":
            raise ValueError("Cannot add members to a smart deck")
        async with db.execute(
            "SELECT 1 FROM vocabulary WHERE id = ? AND user_id = ?",
            (vocabulary_id, user_id),
        ) as cur:
            if await cur.fetchone() is None:
                return False
        await db.execute(
            "INSERT OR IGNORE INTO deck_members (deck_id, vocabulary_id) VALUES (?, ?)",
            (deck_id, vocabulary_id),
        )
        await db.commit()
    return True


async def remove_manual_member(user_id: int, deck_id: int, vocabulary_id: int) -> bool:
    async with aiosqlite.connect(_db_module.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT 1 FROM decks WHERE id = ? AND user_id = ?",
            (deck_id, user_id),
        ) as cur:
            if await cur.fetchone() is None:
                return False
        cur = await db.execute(
            "DELETE FROM deck_members WHERE deck_id = ? AND vocabulary_id = ?",
            (deck_id, vocabulary_id),
        )
        await db.commit()
        return cur.rowcount > 0


async def resolve_deck_vocab_ids(user_id: int, deck_id: int) -> list[int] | None:
    """Return the list of vocabulary_ids belonging to the deck, or None if the
    deck does not exist or does not belong to the user."""
    async with aiosqlite.connect(_db_module.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, mode, rules_json FROM decks WHERE id = ? AND user_id = ?",
            (deck_id, user_id),
        ) as cur:
            row = await cur.fetchone()
        if row is None:
            return None
        return await _resolve_member_ids(db, user_id, dict(row))


async def _resolve_member_ids(
    db: aiosqlite.Connection,
    user_id: int,
    deck: dict,
) -> list[int]:
    """Return vocabulary_ids that belong to the deck. Works for both modes."""
    if deck["mode"] == "manual":
        async with db.execute(
            "SELECT vocabulary_id FROM deck_members WHERE deck_id = ? ORDER BY added_at",
            (deck["id"],),
        ) as cur:
            return [r[0] for r in await cur.fetchall()]

    rules = json.loads(deck["rules_json"]) if deck.get("rules_json") else {}
    where = ["v.user_id = ?"]
    params: list = [user_id]

    if "language" in rules:
        where.append("v.language = ?")
        params.append(rules["language"])
    if "book_ids" in rules and rules["book_ids"]:
        ids = rules["book_ids"]
        placeholders = ",".join(["?"] * len(ids))
        where.append(
            f"EXISTS (SELECT 1 FROM word_occurrences wo "
            f"WHERE wo.vocabulary_id = v.id AND wo.book_id IN ({placeholders}))"
        )
        params.extend(ids)
    if "tags_any" in rules and rules["tags_any"]:
        tags = rules["tags_any"]
        placeholders = ",".join(["?"] * len(tags))
        where.append(
            f"EXISTS (SELECT 1 FROM vocabulary_tags vt "
            f"WHERE vt.vocabulary_id = v.id AND vt.tag IN ({placeholders}))"
        )
        params.extend(tags)
    if "tags_all" in rules and rules["tags_all"]:
        for t in rules["tags_all"]:
            where.append(
                "EXISTS (SELECT 1 FROM vocabulary_tags vt "
                "WHERE vt.vocabulary_id = v.id AND vt.tag = ?)"
            )
            params.append(t)
    if "saved_after" in rules:
        where.append("date(v.created_at) >= date(?)")
        params.append(rules["saved_after"])
    if "saved_before" in rules:
        where.append("date(v.created_at) <= date(?)")
        params.append(rules["saved_before"])

    sql = f"SELECT v.id FROM vocabulary v WHERE {' AND '.join(where)} ORDER BY v.id"
    async with db.execute(sql, params) as cur:
        return [r[0] for r in await cur.fetchall()]
