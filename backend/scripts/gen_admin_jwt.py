#!/usr/bin/env python3
"""
Generate a long-lived admin JWT for use with ADMIN_JWT env var.

Usage:
  # Option A: use prod JWT_SECRET from Railway
  JWT_SECRET=<paste from Railway> python scripts/gen_admin_jwt.py --email alfmunny@gmail.com

  # Option B: point at local DB (dev)
  python scripts/gen_admin_jwt.py --email alfmunny@gmail.com

The token is printed to stdout so you can export it:
  export ADMIN_JWT=$(JWT_SECRET=... python scripts/gen_admin_jwt.py --email you@example.com)
"""
import argparse
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

from jose import jwt

JWT_ALGORITHM = "HS256"


async def find_user_id(email: str) -> int | None:
    import aiosqlite

    db_path = os.environ.get("DB_PATH", "books.db")
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT id, role, approved FROM users WHERE email = ?", (email,)) as cur:
            row = await cur.fetchone()
    if row is None:
        return None
    if row["role"] != "admin":
        print(f"Warning: user {email} has role={row['role']!r} (not admin) in this DB", file=sys.stderr)
    if not row["approved"]:
        print(f"Warning: user {email} is not approved in this DB", file=sys.stderr)
    return row["id"]


def make_token(user_id: int, email: str, days: int = 365) -> str:
    secret = os.environ.get("JWT_SECRET", "dev-secret-change-in-production-32ch")
    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=days),
    }
    return jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True, help="Admin user email")
    parser.add_argument("--user-id", type=int, help="Override user ID (skip DB lookup)")
    parser.add_argument("--days", type=int, default=365, help="Token validity in days (default 365)")
    args = parser.parse_args()

    user_id = args.user_id
    if user_id is None:
        user_id = await find_user_id(args.email)
        if user_id is None:
            print(f"ERROR: no user with email {args.email!r} found in DB", file=sys.stderr)
            print("Tip: use --user-id <id> to bypass DB lookup (need prod user ID)", file=sys.stderr)
            sys.exit(1)

    token = make_token(user_id, args.email, args.days)
    print(token)


if __name__ == "__main__":
    asyncio.run(main())
