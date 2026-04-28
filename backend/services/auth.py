"""
JWT authentication + Google ID token verification + API key encryption.
"""
import os
import base64
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import Depends, HTTPException, Request
from jose import JWTError, jwt
from cryptography.fernet import Fernet, InvalidToken

from services.db import get_user_by_id

# ── Secrets ──────────────────────────────────────────────────────────────────

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-in-production-32ch")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = 30

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
APPLE_CLIENT_ID = os.environ.get("APPLE_CLIENT_ID", "")

# Fernet key must be 32 url-safe base64-encoded bytes.
# In dev we derive one from the JWT_SECRET; in prod set ENCRYPTION_KEY explicitly.
def _fernet() -> Fernet:
    raw = os.environ.get("ENCRYPTION_KEY")
    if raw:
        return Fernet(raw.encode())
    # Derive a deterministic key from JWT_SECRET (dev only)
    padded = (JWT_SECRET * 3)[:32].encode()
    key = base64.urlsafe_b64encode(padded)
    return Fernet(key)


def encrypt_api_key(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_api_key(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        raise HTTPException(status_code=500, detail="Could not decrypt API key")


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_jwt(user_id: int, email: str) -> str:
    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRE_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_jwt(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ── GitHub access token verification ─────────────────────────────────────────

async def verify_github_access_token(access_token: str) -> dict:
    """Verify a GitHub OAuth access token and return verified profile data.

    Calls https://api.github.com/user with the token.  Raises 401 on failure.
    Returns dict with keys: id (str), email, name, picture.
    """
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github+json",
            },
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid GitHub access token")
    data = resp.json()
    github_id = data.get("id")
    if not github_id:
        raise HTTPException(status_code=401, detail="GitHub token missing user id")
    return {
        "id": str(github_id),
        "email": data.get("email") or "",
        "name": data.get("name") or data.get("login") or "",
        "picture": data.get("avatar_url") or "",
    }


# ── Google ID token verification ──────────────────────────────────────────────

async def verify_google_id_token(id_token: str) -> dict:
    """
    Verify a Google ID token using Google's tokeninfo endpoint.
    Returns the token payload (sub, email, name, picture, ...).
    """
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": id_token},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google ID token")
    data = resp.json()
    if GOOGLE_CLIENT_ID and data.get("aud") != GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=401, detail="Token audience mismatch")
    return data


# ── Apple ID token verification ──────────────────────────────────────────────

APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"
_apple_jwks_cache: dict | None = None


async def _get_apple_jwks() -> dict:
    global _apple_jwks_cache
    if _apple_jwks_cache is not None:
        return _apple_jwks_cache
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(APPLE_JWKS_URL)
    if resp.status_code != 200:
        raise HTTPException(status_code=503, detail="Could not fetch Apple public keys")
    _apple_jwks_cache = resp.json()
    return _apple_jwks_cache


async def verify_apple_id_token(id_token: str) -> dict:
    """
    Verify an Apple ID token using Apple's JWKS public keys.
    Returns the decoded payload (sub, email, ...).
    """
    from jose import jwk as jose_jwk
    from jose.utils import base64url_decode
    import json as _json

    jwks = await _get_apple_jwks()

    # Decode header to find the right key
    header_segment = id_token.split(".")[0]
    try:
        header = _json.loads(base64url_decode(header_segment.encode()))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Apple ID token format")

    kid = header.get("kid")
    key_data = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
    if key_data is None:
        # Key not in cache — try refreshing once
        global _apple_jwks_cache
        _apple_jwks_cache = None
        jwks = await _get_apple_jwks()
        key_data = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
    if key_data is None:
        raise HTTPException(status_code=401, detail="Apple signing key not found")

    public_key = jose_jwk.construct(key_data)
    try:
        payload = jwt.decode(
            id_token,
            public_key,
            algorithms=["RS256"],
            audience=APPLE_CLIENT_ID if APPLE_CLIENT_ID else None,
            issuer="https://appleid.apple.com",
            options={"verify_aud": bool(APPLE_CLIENT_ID)},
        )
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid Apple ID token")
    return payload


# ── FastAPI dependency ────────────────────────────────────────────────────────

async def get_current_user(request: Request) -> dict:
    """Dependency: extract and validate Bearer JWT, return user dict from DB.

    Blocks unapproved users with 403 on all endpoints except /api/user/me
    (which the frontend needs to check approval status and show the pending page).
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = auth_header.removeprefix("Bearer ").strip()
    payload = decode_jwt(token)
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Invalid token: missing sub claim")
    try:
        user_id = int(sub)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid token: sub is not a valid user id")
    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    # Block unapproved users — except on /user/me so the frontend can
    # detect pending status and redirect to the approval-pending page.
    if not user.get("approved") and not request.url.path.endswith("/user/me"):
        raise HTTPException(status_code=403, detail="Account pending approval")
    return user


async def get_optional_user(request: Request) -> dict | None:
    """Like get_current_user but returns None instead of raising 401 when no token is present.

    Use on endpoints that are publicly accessible but behave differently for
    authenticated users (e.g. free-classics import-stream).
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    try:
        token = auth_header.removeprefix("Bearer ").strip()
        payload = decode_jwt(token)
        user_id = int(payload["sub"])
        user = await get_user_by_id(user_id)
        if not user or not user.get("approved"):
            return None
        return user
    except Exception:
        return None


def check_book_access(book: dict | None, user: dict | None) -> None:
    """Raise 403 if book is an uploaded private book and user is not the owner or admin."""
    if not book or book.get("source") != "upload":
        return
    owner_id = book.get("owner_user_id")
    if owner_id is None:
        return
    if user is None or (user["id"] != owner_id and user.get("role") != "admin"):
        raise HTTPException(status_code=403, detail="Not your book")


# ── Tier-based authorization ────────────────────────────────────────────────
# See docs/design/pricing-plans.md §"Authorization layer". Free is the
# default for every user; Pro / Premium are reached via Stripe checkout
# (PR C) which writes the tier column on webhook receipt.

TIER_RANK = {"free": 0, "pro": 1, "premium": 2}


def require_tier(min_tier: str):
    """Dependency factory: caller passes the minimum tier the route needs.

    Returns 402 Payment Required (not 403) for under-tier users — the
    HTTP semantic for "your auth is fine, you just need to pay". The
    structured `detail` lets the frontend pick the right paywall
    variant without parsing the message string.
    """
    if min_tier not in TIER_RANK:
        raise ValueError(f"Unknown tier: {min_tier!r}")

    async def _dep(user: dict = Depends(get_current_user)) -> dict:
        current = user.get("tier") or "free"
        if TIER_RANK.get(current, 0) < TIER_RANK[min_tier]:
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "tier_required",
                    "current_tier": current,
                    "required_tier": min_tier,
                },
            )
        return user

    return _dep


# Free tier reading-quota: distinct book_ids in `reading_history` for the
# current calendar month. PR B of pricing-plans series (#1790).
# See docs/design/pricing-plans.md §"Reading-quota enforcement".
FREE_TIER_MONTHLY_BOOK_QUOTA = 3


async def require_book_quota(user: dict | None, book_id: int) -> None:
    """Enforce the free-tier 3-distinct-books-per-calendar-month rule.

    No-op for anonymous users (None) and for paid tiers. For free users:
    if they've already opened FREE_TIER_MONTHLY_BOOK_QUOTA distinct
    book_ids this month AND book_id is NOT one of those, raise 402.
    The 4th, 5th, ... chapter of an already-opened book stays accessible
    because that book_id is already "spent" against the quota.
    """
    if user is None:
        return
    if (user.get("tier") or "free") != "free":
        return

    # Aggregate cheap query — index on (user_id, read_at) covers it.
    import aiosqlite
    from services import db as _db

    async with aiosqlite.connect(_db.DB_PATH) as conn:
        # Calendar-month bound. SQLite's `start of month` modifier returns
        # the first instant of the current month in the local tz of the
        # connection — we treat reading_history.read_at as UTC-naive
        # (matches DEFAULT CURRENT_TIMESTAMP), so this comparison is
        # consistent without explicit tz coercion.
        rows = await (await conn.execute(
            """SELECT DISTINCT book_id FROM reading_history
                WHERE user_id = ? AND read_at >= datetime('now', 'start of month')""",
            (user["id"],),
        )).fetchall()

    distinct_books = {row[0] for row in rows}
    if book_id in distinct_books:
        return  # already counted this month — keep reading
    if len(distinct_books) >= FREE_TIER_MONTHLY_BOOK_QUOTA:
        raise HTTPException(
            status_code=402,
            detail={
                "error": "book_quota_reached",
                "current_tier": "free",
                "required_tier": "pro",
                "books_used": len(distinct_books),
                "books_quota": FREE_TIER_MONTHLY_BOOK_QUOTA,
            },
        )
