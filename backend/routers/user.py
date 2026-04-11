from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from services.auth import get_current_user, encrypt_api_key, decrypt_api_key
from services.db import set_user_gemini_key, get_user_by_id

router = APIRouter(prefix="/user", tags=["user"])


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "picture": user["picture"],
        "hasGeminiKey": bool(user.get("gemini_key")),
    }


class GeminiKeyRequest(BaseModel):
    api_key: str


@router.post("/gemini-key")
async def save_gemini_key(
    req: GeminiKeyRequest,
    user: dict = Depends(get_current_user),
):
    if not req.api_key.strip():
        raise HTTPException(status_code=400, detail="API key cannot be empty")
    encrypted = encrypt_api_key(req.api_key.strip())
    await set_user_gemini_key(user["id"], encrypted)
    return {"ok": True}


@router.delete("/gemini-key")
async def delete_gemini_key(user: dict = Depends(get_current_user)):
    await set_user_gemini_key(user["id"], None)
    return {"ok": True}
