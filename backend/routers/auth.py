from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from services.auth import verify_google_id_token, verify_apple_id_token, verify_github_access_token, create_jwt
from services.db import get_or_create_user, get_or_create_user_github, get_or_create_user_apple

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_response(user: dict) -> dict:
    """Build the standard auth response from a user dict."""
    token = create_jwt(user["id"], user["email"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "picture": user["picture"],
            "hasGeminiKey": bool(user.get("gemini_key")),
        },
    }


class GoogleAuthRequest(BaseModel):
    id_token: str = Field(..., min_length=1, max_length=2000)


@router.post("/google")
async def google_login(req: GoogleAuthRequest):
    """Exchange a Google ID token for our own backend JWT."""
    try:
        info = await verify_google_id_token(req.id_token)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Authentication failed")

    user = await get_or_create_user(
        google_id=info["sub"],
        email=info.get("email", ""),
        name=info.get("name", ""),
        picture=info.get("picture", ""),
    )
    return _user_response(user)


class GitHubAuthRequest(BaseModel):
    access_token: str = Field(..., min_length=1, max_length=500)


@router.post("/github")
async def github_login(req: GitHubAuthRequest):
    """Verify a GitHub OAuth access token server-side and issue our own JWT."""

    try:
        profile = await verify_github_access_token(req.access_token)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Authentication failed")

    user = await get_or_create_user_github(
        github_id=profile["id"],
        email=profile["email"],
        name=profile["name"],
        picture=profile["picture"],
    )
    return _user_response(user)


class AppleAuthRequest(BaseModel):
    id_token: str = Field(..., min_length=1, max_length=2000)
    name: str = Field(default="", max_length=500)


@router.post("/apple")
async def apple_login(req: AppleAuthRequest):
    """Exchange an Apple ID token for our own backend JWT."""
    try:
        payload = await verify_apple_id_token(req.id_token)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Authentication failed")

    apple_id = payload.get("sub", "")
    if not apple_id:
        raise HTTPException(status_code=401, detail="Apple ID token missing sub claim")

    user = await get_or_create_user_apple(
        apple_id=apple_id,
        email=payload.get("email", ""),
        name=req.name.strip(),
    )
    return _user_response(user)
