from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.auth import verify_google_id_token, create_jwt
from services.db import get_or_create_user

router = APIRouter(prefix="/auth", tags=["auth"])


class GoogleAuthRequest(BaseModel):
    id_token: str


@router.post("/google")
async def google_login(req: GoogleAuthRequest):
    """
    Exchange a Google ID token for our own backend JWT.
    Called by NextAuth during the OAuth flow.
    """
    try:
        info = await verify_google_id_token(req.id_token)
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

    user = await get_or_create_user(
        google_id=info["sub"],
        email=info.get("email", ""),
        name=info.get("name", ""),
        picture=info.get("picture", ""),
    )

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
