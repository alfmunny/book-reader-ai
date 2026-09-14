

# ── Admin sees every book, uploads included (owner, 2026-08-31) ──────────────

async def test_admin_books_include_uploads_with_owner(client, test_user):
    """The public listing hides uploads — their privacy is from other readers.
    The admin panel is moderation: an upload nobody can see cannot be deleted
    or blocked."""
    import aiosqlite
    import services.db as db_module

    async with aiosqlite.connect(db_module.DB_PATH) as db:
        await db.execute(
            """INSERT INTO books (id, title, authors, languages, subjects,
                                  download_count, cover, text, source, owner_user_id, cached_at)
               VALUES (1000042, '不夜城', '[]', '[]', '[]', 0, '', '', 'upload', ?,
                       '2099-01-01T00:00:00')""",
            (test_user["id"],),
        )
        await db.commit()

    resp = await client.get("/api/admin/books")
    assert resp.status_code == 200
    books = resp.json()
    mine = next((b for b in books if b["id"] == 1000042), None)
    assert mine is not None, "the upload must appear in the admin listing"
    assert mine["source"] == "upload"
    assert mine["owner_email"] == test_user["email"]
    # newest first, by added date — the fake future date must lead the list
    assert books[0]["id"] == 1000042

    # …and the public browse still hides it
    from services.db import list_cached_books
    assert all(b["id"] != 1000042 for b in await list_cached_books())
