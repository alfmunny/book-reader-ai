from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.claude import (
    generate_insight,
    answer_question,
    check_pronunciation,
    suggest_youtube_query,
    translate_text,
)
from services.youtube import search_videos

router = APIRouter(prefix="/ai", tags=["ai"])


class InsightRequest(BaseModel):
    chapter_text: str
    book_title: str
    author: str
    response_language: str = "en"


class QARequest(BaseModel):
    question: str
    passage: str
    book_title: str
    author: str
    response_language: str = "en"


class PronunciationRequest(BaseModel):
    original_text: str
    spoken_text: str
    language: str = "en"


class VideoRequest(BaseModel):
    passage: str
    book_title: str
    author: str


class TranslateRequest(BaseModel):
    text: str
    source_language: str = "de"
    target_language: str = "en"


@router.post("/insight")
async def insight(req: InsightRequest):
    try:
        result = await generate_insight(
            req.chapter_text, req.book_title, req.author, req.response_language
        )
        return {"insight": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/qa")
async def qa(req: QARequest):
    try:
        result = await answer_question(
            req.question, req.passage, req.book_title, req.author, req.response_language
        )
        return {"answer": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/pronunciation")
async def pronunciation(req: PronunciationRequest):
    try:
        result = await check_pronunciation(
            req.original_text, req.spoken_text, req.language
        )
        return {"feedback": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/videos")
async def videos(req: VideoRequest):
    try:
        query = await suggest_youtube_query(req.passage, req.book_title, req.author)
        results = await search_videos(query)
        return {"query": query, "videos": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/translate")
async def translate(req: TranslateRequest):
    try:
        paragraphs = await translate_text(
            req.text, req.source_language, req.target_language
        )
        return {"paragraphs": paragraphs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
