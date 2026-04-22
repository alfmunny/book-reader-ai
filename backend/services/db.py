"""
SQLite book cache.

Schema
------
books: id, title, authors (JSON), languages (JSON), subjects (JSON),
       download_count, cover, text, cached_at
"""

import json
import os
import aiosqlite

# DB file location. In local dev, defaults to backend/books.db (relative to
# this file). In production (e.g. Railway), set DB_PATH to a path inside a
# persistent volume so the file survives container redeploys — otherwise
# every redeploy starts with an empty database. See README "Deployment".
DB_PATH = os.environ.get(
    "DB_PATH",
    os.path.join(os.path.dirname(__file__), "..", "books.db"),
)


# ── Global aiosqlite tuning for concurrent writes ────────────────────────────
#
# By default sqlite3.connect uses `timeout=5.0` as its busy_timeout. Under the
# always-on translation queue we have MANY overlapping writers:
#   - worker writing translations + queue updates + rate_limiter_usage
#   - admin PUT /queue/settings updating app_settings
#   - save_book auto-enqueueing
# A 5s window isn't always enough — admins were seeing
# "database is locked" 500s on /admin/queue/settings. We monkey-patch
# aiosqlite.connect to apply a 30-second busy timeout globally, which makes
# SQLite retry the busy writer instead of failing fast. Combined with WAL
# mode (set persistently in init_db), this eliminates the contention we
# actually see in practice.

_BUSY_TIMEOUT_ATTR = "_book_reader_ai_busy_timeout_patched"

if not getattr(aiosqlite.connect, _BUSY_TIMEOUT_ATTR, False):
    _original_aiosqlite_connect = aiosqlite.connect

    def _aiosqlite_connect_with_busy_timeout(database, **kwargs):
        kwargs.setdefault("timeout", 30)
        return _original_aiosqlite_connect(database, **kwargs)

    setattr(_aiosqlite_connect_with_busy_timeout, _BUSY_TIMEOUT_ATTR, True)
    aiosqlite.connect = _aiosqlite_connect_with_busy_timeout


async def init_db() -> None:
    """Ensure the database schema is up-to-date by running any pending
    versioned migrations from backend/migrations/*.sql.

    This replaces the old inline CREATE TABLE + ALTER TABLE + DROP/CREATE
    soup that previously lived here. All schema definitions now live in
    numbered SQL files so there's a clear audit trail and SQLite's
    limitations (can't ALTER primary keys, etc.) are handled per-migration
    rather than with ad-hoc sqlite_master inspections.
    """
    # Make sure the parent directory exists. Important on first run after
    # mounting a Railway volume at e.g. /app/data — the mount point exists
    # but no books.db file does yet, and SQLite needs the directory to be
    # present before it can create the file.
    db_dir = os.path.dirname(DB_PATH)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)

    from services.migrations import run as run_migrations
    applied = await run_migrations(DB_PATH)
    if applied:
        import logging
        logging.getLogger(__name__).info("Applied %d migration(s): %s", len(applied), ", ".join(applied))

    # Enable WAL journaling — concurrent readers don't block a writer, which
    # is what our queue worker + admin settings + save_book paths constantly
    # do. Persists across restarts once set on the file.
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute("PRAGMA journal_mode=WAL")
            await db.commit()
    except Exception:
        import logging
        logging.getLogger(__name__).warning(
            "Failed to enable WAL mode (non-fatal)", exc_info=True,
        )


async def get_or_create_user(google_id: str, email: str, name: str, picture: str) -> dict:
    """Return existing user or create a new one.

    First user ever → role='admin', approved=1 (auto-admin).
    Subsequent users → role='user', approved=0 (pending approval).
    """
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM users WHERE google_id = ?", (google_id,)
        ) as cursor:
            row = await cursor.fetchone()
        if row:
            await db.execute(
                "UPDATE users SET email=?, name=?, picture=? WHERE google_id=?",
                (email, name, picture, google_id),
            )
            await db.commit()
            updated = dict(row)
            updated["email"] = email
            updated["name"] = name
            updated["picture"] = picture
            return updated

        # New user — check if this is the very first user (auto-admin)
        async with db.execute("SELECT COUNT(*) FROM users") as cursor:
            count = (await cursor.fetchone())[0]
        is_first = count == 0

        await db.execute(
            "INSERT INTO users (google_id, email, name, picture, role, approved) VALUES (?,?,?,?,?,?)",
            (google_id, email, name, picture,
             "admin" if is_first else "user",
             1 if is_first else 0),
        )
        async with db.execute(
            "SELECT * FROM users WHERE google_id = ?", (google_id,)
        ) as cursor:
            row = await cursor.fetchone()
        await db.commit()
        return dict(row)


async def get_or_create_user_github(github_id: str, email: str, name: str, picture: str) -> dict:
    """Return existing user (by github_id or email) or create a new one for GitHub OAuth."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        # Try finding by github_id first
        async with db.execute("SELECT * FROM users WHERE github_id = ?", (github_id,)) as cursor:
            row = await cursor.fetchone()
        if row:
            await db.execute(
                "UPDATE users SET email=?, name=?, picture=? WHERE github_id=?",
                (email, name, picture, github_id),
            )
            await db.commit()
            updated = dict(row)
            updated["email"] = email
            updated["name"] = name
            updated["picture"] = picture
            return updated

        # Try linking to existing account by email (user signed in via Google before)
        if email:
            async with db.execute("SELECT * FROM users WHERE email = ?", (email,)) as cursor:
                row = await cursor.fetchone()
            if row:
                await db.execute(
                    "UPDATE users SET github_id=?, name=?, picture=? WHERE id=?",
                    (github_id, name, picture, row["id"]),
                )
                await db.commit()
                updated = dict(row)
                updated["github_id"] = github_id
                updated["name"] = name
                updated["picture"] = picture
                return updated

        # New user
        async with db.execute("SELECT COUNT(*) FROM users") as cursor:
            count = (await cursor.fetchone())[0]
        is_first = count == 0

        await db.execute(
            "INSERT INTO users (google_id, github_id, email, name, picture, role, approved) VALUES (?,?,?,?,?,?,?)",
            (f"github:{github_id}", github_id, email, name, picture,
             "admin" if is_first else "user",
             1 if is_first else 0),
        )
        async with db.execute("SELECT * FROM users WHERE github_id = ?", (github_id,)) as cursor:
            row = await cursor.fetchone()
        await db.commit()
        return dict(row)


async def get_or_create_user_apple(apple_id: str, email: str, name: str) -> dict:
    """Return existing user (by apple_id or email) or create a new one for Apple OAuth.

    Apple only returns name/email on the first login; subsequent logins only
    provide the subject (apple_id). We therefore only update name/email when
    they are non-empty.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        # Try finding by apple_id first
        async with db.execute("SELECT * FROM users WHERE apple_id = ?", (apple_id,)) as cursor:
            row = await cursor.fetchone()
        if row:
            if email or name:
                await db.execute(
                    "UPDATE users SET email=COALESCE(NULLIF(?,''), email), name=COALESCE(NULLIF(?,''), name) WHERE apple_id=?",
                    (email, name, apple_id),
                )
            async with db.execute("SELECT * FROM users WHERE apple_id = ?", (apple_id,)) as cursor:
                row = await cursor.fetchone()
            await db.commit()
            return dict(row)

        # Try linking to existing account by email
        if email:
            async with db.execute("SELECT * FROM users WHERE email = ?", (email,)) as cursor:
                row = await cursor.fetchone()
            if row:
                await db.execute(
                    "UPDATE users SET apple_id=? WHERE id=?",
                    (apple_id, row["id"]),
                )
                await db.commit()
                updated = dict(row)
                updated["apple_id"] = apple_id
                return updated

        # New user
        async with db.execute("SELECT COUNT(*) FROM users") as cursor:
            count = (await cursor.fetchone())[0]
        is_first = count == 0

        await db.execute(
            "INSERT INTO users (google_id, apple_id, email, name, role, approved) VALUES (?,?,?,?,?,?)",
            (f"apple:{apple_id}", apple_id, email, name,
             "admin" if is_first else "user",
             1 if is_first else 0),
        )
        async with db.execute("SELECT * FROM users WHERE apple_id = ?", (apple_id,)) as cursor:
            row = await cursor.fetchone()
        await db.commit()
        return dict(row)


async def get_user_by_id(user_id: int) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ) as cursor:
            row = await cursor.fetchone()
    return dict(row) if row else None


async def list_users() -> list[dict]:
    """Return all users (for the admin panel)."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, email, name, picture, role, approved, created_at FROM users ORDER BY created_at"
        ) as cursor:
            return [dict(row) async for row in cursor]


async def set_user_approved(user_id: int, approved: bool) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE users SET approved = ? WHERE id = ?",
            (1 if approved else 0, user_id),
        )
        await db.commit()


async def set_user_role(user_id: int, role: str) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE users SET role = ? WHERE id = ?",
            (role, user_id),
        )
        await db.commit()


async def delete_user(user_id: int) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """DELETE FROM word_occurrences WHERE vocabulary_id IN (
               SELECT id FROM vocabulary WHERE user_id = ?)""",
            (user_id,),
        )
        await db.execute("DELETE FROM vocabulary WHERE user_id = ?", (user_id,))
        await db.execute("DELETE FROM annotations WHERE user_id = ?", (user_id,))
        await db.execute("DELETE FROM book_insights WHERE user_id = ?", (user_id,))
        await db.execute("DELETE FROM user_reading_progress WHERE user_id = ?", (user_id,))
        await db.execute("DELETE FROM reading_history WHERE user_id = ?", (user_id,))
        await db.execute("DELETE FROM book_uploads WHERE user_id = ?", (user_id,))
        # Cascade deletions for uploaded books owned by this user.
        # SQLite FK enforcement is OFF so ON DELETE CASCADE never fires automatically.
        _owned = "SELECT id FROM books WHERE owner_user_id = ?"
        await db.execute(f"DELETE FROM translations WHERE book_id IN ({_owned})", (user_id,))
        await db.execute(f"DELETE FROM audio_cache WHERE book_id IN ({_owned})", (user_id,))
        await db.execute(f"DELETE FROM chapter_summaries WHERE book_id IN ({_owned})", (user_id,))
        await db.execute(f"DELETE FROM translation_queue WHERE book_id IN ({_owned})", (user_id,))
        await db.execute(f"DELETE FROM word_occurrences WHERE book_id IN ({_owned})", (user_id,))
        # Prune vocabulary entries that now have no occurrences (owned books just deleted).
        await db.execute(
            "DELETE FROM vocabulary WHERE id NOT IN (SELECT DISTINCT vocabulary_id FROM word_occurrences)"
        )
        await db.execute(f"DELETE FROM annotations WHERE book_id IN ({_owned})", (user_id,))
        await db.execute(f"DELETE FROM book_insights WHERE book_id IN ({_owned})", (user_id,))
        await db.execute(f"DELETE FROM user_reading_progress WHERE book_id IN ({_owned})", (user_id,))
        await db.execute(f"DELETE FROM reading_history WHERE book_id IN ({_owned})", (user_id,))
        await db.execute(f"DELETE FROM book_uploads WHERE book_id IN ({_owned})", (user_id,))
        await db.execute("DELETE FROM books WHERE owner_user_id = ?", (user_id,))
        await db.execute("DELETE FROM users WHERE id = ?", (user_id,))
        await db.commit()


async def set_user_plan(user_id: int, plan: str) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE users SET plan = ? WHERE id = ?",
            (plan, user_id),
        )
        await db.commit()


async def set_user_gemini_key(user_id: int, encrypted_key: str | None) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE users SET gemini_key = ? WHERE id = ?",
            (encrypted_key, user_id),
        )
        await db.commit()


async def get_cached_translation(book_id: int, chapter_index: int, target_language: str) -> list[str] | None:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT paragraphs FROM translations WHERE book_id=? AND chapter_index=? AND target_language=?",
            (book_id, chapter_index, target_language),
        ) as cursor:
            row = await cursor.fetchone()
    return json.loads(row[0]) if row else None


async def get_cached_translation_with_meta(
    book_id: int, chapter_index: int, target_language: str,
) -> dict | None:
    """Like get_cached_translation, but also returns provider/model metadata
    and the translated chapter title (may be None for rows saved before the
    011 migration, or when the translator couldn't produce a title)."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT paragraphs, provider, model, title_translation
               FROM translations
               WHERE book_id=? AND chapter_index=? AND target_language=?""",
            (book_id, chapter_index, target_language),
        ) as cursor:
            row = await cursor.fetchone()
    if not row:
        return None
    return {
        "paragraphs": json.loads(row["paragraphs"]),
        "provider": row["provider"],
        "model": row["model"],
        "title_translation": row["title_translation"],
    }


async def save_translation(
    book_id: int,
    chapter_index: int,
    target_language: str,
    paragraphs: list[str],
    *,
    provider: str | None = None,
    model: str | None = None,
    title_translation: str | None = None,
) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT OR REPLACE INTO translations
              (book_id, chapter_index, target_language, paragraphs,
               provider, model, title_translation)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (book_id, chapter_index, target_language,
             json.dumps(paragraphs), provider, model, title_translation),
        )
        await db.commit()

    # Self-cleaning queue: any pending/running row for this (book, chapter,
    # lang) gets marked 'done' so the worker doesn't claim and skip-cache
    # later. Works for all save paths: reader on-demand, bulk job, manual
    # retranslate, and even the worker's own save (no-op in that case).
    # Lazy import for cycle safety; non-fatal on error.
    try:
        from services.translation_queue import mark_queue_row_done
        await mark_queue_row_done(book_id, chapter_index, target_language)
    except ImportError:
        pass  # FastAPI not installed (offline pretranslate context) — queue cleanup not needed
    except Exception:
        import logging
        logging.getLogger(__name__).warning(
            "Queue cleanup after save_translation failed", exc_info=True,
        )


async def count_translations_for_book(book_id: int, target_language: str) -> int:
    """Count how many chapters of a book have a translation cached."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM translations WHERE book_id=? AND target_language=?",
            (book_id, target_language),
        ) as cursor:
            row = await cursor.fetchone()
    return row[0] if row else 0



async def get_cached_book(book_id: int) -> dict | None:
    """Return cached book dict (includes 'text') or None."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM books WHERE id = ?", (book_id,)
        ) as cursor:
            row = await cursor.fetchone()
    if row is None:
        return None
    d = dict(row)
    for field in ("authors", "languages", "subjects"):
        if isinstance(d.get(field), str):
            d[field] = json.loads(d[field])
    if isinstance(d.get("images"), str):
        d["images"] = json.loads(d["images"])
    return d


async def save_book(book_id: int, meta: dict, text: str, images: list | None = None) -> None:
    """Insert or replace a book record (meta + full text + images).

    After saving, the translation queue is auto-seeded with this book's
    chapters for every configured target language. The worker (if running)
    will pick them up on its next tick.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT OR REPLACE INTO books
                (id, title, authors, languages, subjects, download_count, cover, text, images)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                book_id,
                meta.get("title", ""),
                json.dumps(meta.get("authors", [])),
                json.dumps(meta.get("languages", [])),
                json.dumps(meta.get("subjects", [])),
                meta.get("download_count", 0),
                meta.get("cover", ""),
                text,
                json.dumps(images or []),
            ),
        )
        await db.commit()

    # Auto-enqueue for translation. Lazy-imported to avoid a circular import
    # (translation_queue → db → translation_queue). Failures are non-fatal:
    # a book save must never be blocked by queue trouble.
    try:
        from services.translation_queue import enqueue_for_book, worker
        added = await enqueue_for_book(book_id)
        if added:
            worker().wake()
    except Exception:
        import logging
        logging.getLogger(__name__).warning(
            "Auto-enqueue after save_book(%s) failed", book_id, exc_info=True,
        )



# ── App settings (key/value config used by the always-on queue, etc.) ────────

async def get_setting(key: str) -> str | None:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT value FROM app_settings WHERE key=?", (key,),
        ) as cursor:
            row = await cursor.fetchone()
    return row[0] if row else None


async def set_setting(key: str, value: str) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO app_settings (key, value) VALUES (?, ?)
               ON CONFLICT(key) DO UPDATE SET value=excluded.value""",
            (key, value),
        )
        await db.commit()


async def get_chapter_summary(book_id: int, chapter_index: int) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT content, model, created_at FROM chapter_summaries WHERE book_id=? AND chapter_index=?",
            (book_id, chapter_index),
        ) as cursor:
            row = await cursor.fetchone()
    return dict(row) if row else None


async def save_chapter_summary(book_id: int, chapter_index: int, content: str, model: str | None = None) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO chapter_summaries (book_id, chapter_index, content, model)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(book_id, chapter_index) DO UPDATE
               SET content=excluded.content, model=excluded.model, created_at=CURRENT_TIMESTAMP""",
            (book_id, chapter_index, content, model),
        )
        await db.commit()


async def get_reading_progress(user_id: int) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT book_id, chapter_index, last_read FROM user_reading_progress WHERE user_id=? ORDER BY last_read DESC",
            (user_id,),
        ) as cursor:
            rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def upsert_reading_progress(user_id: int, book_id: int, chapter_index: int) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO user_reading_progress (user_id, book_id, chapter_index, last_read)
               VALUES (?, ?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT(user_id, book_id) DO UPDATE SET
                 chapter_index=excluded.chapter_index,
                 last_read=excluded.last_read""",
            (user_id, book_id, chapter_index),
        )
        await db.commit()


async def log_reading_event(user_id: int, book_id: int, chapter_index: int) -> None:
    """Append one row to reading_history for streak / heatmap analytics."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO reading_history (user_id, book_id, chapter_index) VALUES (?, ?, ?)",
            (user_id, book_id, chapter_index),
        )
        await db.commit()


async def upsert_progress_and_log_event(
    user_id: int, book_id: int, chapter_index: int
) -> None:
    """Atomically save reading position and append an analytics event.

    Both writes share a single connection and commit so they either both
    persist or both roll back — eliminating the window where progress is
    saved but the streak/heatmap event is silently dropped.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO user_reading_progress (user_id, book_id, chapter_index, last_read)
               VALUES (?, ?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT(user_id, book_id) DO UPDATE SET
                 chapter_index=excluded.chapter_index,
                 last_read=excluded.last_read""",
            (user_id, book_id, chapter_index),
        )
        await db.execute(
            "INSERT INTO reading_history (user_id, book_id, chapter_index) VALUES (?, ?, ?)",
            (user_id, book_id, chapter_index),
        )
        await db.commit()


async def get_user_stats(user_id: int) -> dict:
    """Return aggregated reading statistics for a user."""
    from datetime import date, timedelta, datetime, timezone

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        # ── Totals ────────────────────────────────────────────────────────────
        async with db.execute(
            "SELECT COUNT(DISTINCT book_id) FROM user_reading_progress WHERE user_id=?",
            (user_id,),
        ) as cur:
            books_started = (await cur.fetchone())[0]

        async with db.execute(
            "SELECT COUNT(*) FROM vocabulary WHERE user_id=?", (user_id,)
        ) as cur:
            vocab_words = (await cur.fetchone())[0]

        async with db.execute(
            "SELECT COUNT(*) FROM annotations WHERE user_id=?", (user_id,)
        ) as cur:
            annotations = (await cur.fetchone())[0]

        async with db.execute(
            "SELECT COUNT(*) FROM book_insights WHERE user_id=?", (user_id,)
        ) as cur:
            insights = (await cur.fetchone())[0]

        # ── Activity per day (last 365 days) — union of all event types ──────
        activity_sql = """
            SELECT DATE(ts) AS day, COUNT(*) AS cnt FROM (
                SELECT created_at AS ts FROM vocabulary WHERE user_id=?
                UNION ALL SELECT created_at FROM annotations WHERE user_id=?
                UNION ALL SELECT created_at FROM book_insights WHERE user_id=?
                UNION ALL SELECT read_at FROM reading_history WHERE user_id=?
            ) WHERE ts >= DATE('now', '-365 days')
            GROUP BY day ORDER BY day DESC
        """
        async with db.execute(activity_sql, (user_id, user_id, user_id, user_id)) as cur:
            activity_rows = await cur.fetchall()

    activity = [{"date": r["day"], "count": r["cnt"]} for r in activity_rows]

    # ── Streak (consecutive days ending today or yesterday) ───────────────────
    dates_set = {a["date"] for a in activity}
    _utc_today = datetime.now(timezone.utc).date()
    today = _utc_today.isoformat()
    yesterday = (_utc_today - timedelta(days=1)).isoformat()

    streak = 0
    if today in dates_set or yesterday in dates_set:
        check = _utc_today if today in dates_set else _utc_today - timedelta(days=1)
        while check.isoformat() in dates_set:
            streak += 1
            check -= timedelta(days=1)

    # Longest streak in the available data
    sorted_dates = sorted(dates_set)
    longest = 0
    run = 0
    prev: date | None = None
    for ds in sorted_dates:
        d = date.fromisoformat(ds)
        if prev is None or (d - prev).days == 1:
            run += 1
        else:
            run = 1
        longest = max(longest, run)
        prev = d

    return {
        "totals": {
            "books_started": books_started,
            "vocabulary_words": vocab_words,
            "annotations": annotations,
            "insights": insights,
        },
        "streak": streak,
        "longest_streak": longest,
        "activity": activity,
    }


async def list_cached_books() -> list[dict]:
    """Return all cached books (without text field)."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, title, authors, languages, subjects, download_count, cover, cached_at FROM books ORDER BY cached_at DESC"
        ) as cursor:
            rows = await cursor.fetchall()
    result = []
    for row in rows:
        d = dict(row)
        for field in ("authors", "languages", "subjects"):
            if isinstance(d.get(field), str):
                d[field] = json.loads(d[field])
        result.append(d)
    return result


# ── Annotations ───────────────────────────────────────────────────────────────

async def create_annotation(
    user_id: int,
    book_id: int,
    chapter_index: int,
    sentence_text: str,
    note_text: str,
    color: str,
) -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """INSERT INTO annotations (user_id, book_id, chapter_index, sentence_text, note_text, color)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT (user_id, book_id, chapter_index, sentence_text)
               DO UPDATE SET note_text = excluded.note_text, color = excluded.color""",
            (user_id, book_id, chapter_index, sentence_text, note_text, color),
        )
        async with db.execute(
            "SELECT * FROM annotations WHERE user_id = ? AND book_id = ? AND chapter_index = ? AND sentence_text = ?",
            (user_id, book_id, chapter_index, sentence_text),
        ) as c:
            row = await c.fetchone()
        await db.commit()
    return dict(row)


async def get_annotations(user_id: int, book_id: int) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM annotations WHERE user_id = ? AND book_id = ? ORDER BY chapter_index, created_at",
            (user_id, book_id),
        ) as cursor:
            rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def update_annotation(
    annotation_id: int,
    user_id: int,
    note_text: str | None = None,
    color: str | None = None,
) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        clauses, params = [], []
        if note_text is not None:
            clauses.append("note_text = ?")
            params.append(note_text)
        if color is not None:
            clauses.append("color = ?")
            params.append(color)
        if clauses:
            params.extend([annotation_id, user_id])
            await db.execute(
                f"UPDATE annotations SET {', '.join(clauses)} WHERE id = ? AND user_id = ?",
                params,
            )
        async with db.execute(
            "SELECT * FROM annotations WHERE id = ? AND user_id = ?",
            (annotation_id, user_id),
        ) as cursor:
            row = await cursor.fetchone()
        await db.commit()
    return dict(row) if row else None


async def delete_annotation(annotation_id: int, user_id: int) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "DELETE FROM annotations WHERE id = ? AND user_id = ?",
            (annotation_id, user_id),
        )
        await db.commit()
    return cursor.rowcount > 0


async def get_all_annotations(user_id: int) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """
            SELECT a.*, b.title AS book_title
            FROM annotations a
            LEFT JOIN books b ON b.id = a.book_id
            WHERE a.user_id = ?
            ORDER BY b.title, a.chapter_index, a.created_at
            """,
            (user_id,),
        ) as cursor:
            rows = await cursor.fetchall()
    return [dict(r) for r in rows]


# ── Vocabulary ────────────────────────────────────────────────────────────────

async def _update_lemma(vocab_id: int, word: str, book_id: int) -> None:
    try:
        book = await get_cached_book(book_id)
        langs = book.get("languages", ["en"]) if book else ["en"]
        lang = langs[0] if langs else "en"
        from services import wiktionary
        result = await wiktionary.lookup(word, lang)
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                "UPDATE vocabulary SET lemma = ?, language = ? WHERE id = ?",
                (result["lemma"], result["language"], vocab_id),
            )
            await db.commit()
    except Exception:
        import logging
        logging.getLogger(__name__).warning("Lemma update failed for %s", word, exc_info=True)


async def save_word(
    user_id: int,
    word: str,
    book_id: int,
    chapter_index: int,
    sentence_text: str,
) -> dict:
    import asyncio
    word = word.strip().lower()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await db.execute(
            "INSERT OR IGNORE INTO vocabulary (user_id, word) VALUES (?, ?)",
            (user_id, word),
        )
        # SQLite makes uncommitted writes visible to subsequent reads on the
        # same connection, so no intermediate commit is needed before the SELECT.
        async with db.execute(
            "SELECT id FROM vocabulary WHERE user_id = ? AND word = ?",
            (user_id, word),
        ) as cursor:
            vocab_row = await cursor.fetchone()
        vocab_id = vocab_row["id"]

        # UNIQUE INDEX on (vocabulary_id, book_id, chapter_index, sentence_text) prevents duplicates
        await db.execute(
            """INSERT OR IGNORE INTO word_occurrences (vocabulary_id, book_id, chapter_index, sentence_text)
               VALUES (?, ?, ?, ?)""",
            (vocab_id, book_id, chapter_index, sentence_text),
        )
        async with db.execute("SELECT * FROM vocabulary WHERE id = ?", (vocab_id,)) as cursor:
            row = await cursor.fetchone()
        await db.commit()  # single atomic commit for both inserts

    asyncio.create_task(_update_lemma(vocab_id, word, book_id))
    return dict(row)


async def get_vocabulary(user_id: int) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, word, lemma, language, created_at FROM vocabulary WHERE user_id = ? ORDER BY word",
            (user_id,),
        ) as cursor:
            vocab_rows = await cursor.fetchall()

        result = []
        for v in vocab_rows:
            async with db.execute(
                """SELECT wo.book_id, b.title AS book_title, wo.chapter_index, wo.sentence_text
                   FROM word_occurrences wo
                   LEFT JOIN books b ON b.id = wo.book_id
                   WHERE wo.vocabulary_id = ?
                   ORDER BY wo.created_at""",
                (v["id"],),
            ) as cursor:
                occurrences = [dict(r) for r in await cursor.fetchall()]
            result.append({
                "id": v["id"],
                "word": v["word"],
                "lemma": v["lemma"],
                "language": v["language"],
                "created_at": v["created_at"],
                "occurrences": occurrences,
            })
    return result


async def delete_word(user_id: int, word: str) -> bool:
    word = word.strip().lower()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """DELETE FROM word_occurrences WHERE vocabulary_id IN (
               SELECT id FROM vocabulary WHERE user_id = ? AND word = ?)""",
            (user_id, word),
        )
        cursor = await db.execute(
            "DELETE FROM vocabulary WHERE user_id = ? AND word = ?",
            (user_id, word),
        )
        await db.commit()
    return cursor.rowcount > 0


# ── Obsidian / GitHub settings ────────────────────────────────────────────────

async def update_obsidian_settings(
    user_id: int,
    github_token_encrypted: str | None,
    repo: str | None,
    path: str | None,
    *,
    token_explicitly_set: bool = True,
) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        if token_explicitly_set:
            await db.execute(
                "UPDATE users SET github_token = ?, obsidian_repo = ?, obsidian_path = ? WHERE id = ?",
                (github_token_encrypted, repo, path, user_id),
            )
        else:
            # github_token omitted intentionally — avoid a non-atomic read-then-write race.
            await db.execute(
                "UPDATE users SET obsidian_repo = ?, obsidian_path = ? WHERE id = ?",
                (repo, path, user_id),
            )
        await db.commit()


async def get_obsidian_settings(user_id: int) -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT github_token, obsidian_repo, obsidian_path FROM users WHERE id = ?",
            (user_id,),
        ) as cursor:
            row = await cursor.fetchone()
    return dict(row) if row else {}


# ── Book Insights (saved AI Q&A) ──────────────────────────────────────────────

async def save_insight(
    user_id: int,
    book_id: int,
    chapter_index: int | None,
    question: str,
    answer: str,
    context_text: str | None = None,
) -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """INSERT INTO book_insights (user_id, book_id, chapter_index, question, answer, context_text)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (user_id, book_id, chapter_index, question, answer, context_text),
        )
        row_id = cursor.lastrowid
        async with db.execute("SELECT * FROM book_insights WHERE id = ?", (row_id,)) as c:
            row = await c.fetchone()
        await db.commit()
    return dict(row)


async def get_insights(user_id: int, book_id: int) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM book_insights WHERE user_id = ? AND book_id = ? ORDER BY created_at",
            (user_id, book_id),
        ) as cursor:
            rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def get_all_insights(user_id: int) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """
            SELECT i.*, b.title AS book_title
            FROM book_insights i
            LEFT JOIN books b ON b.id = i.book_id
            WHERE i.user_id = ?
            ORDER BY b.title, i.chapter_index, i.created_at
            """,
            (user_id,),
        ) as cursor:
            rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def delete_insight(insight_id: int, user_id: int) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "DELETE FROM book_insights WHERE id = ? AND user_id = ?",
            (insight_id, user_id),
        )
        await db.commit()
    return cursor.rowcount > 0
