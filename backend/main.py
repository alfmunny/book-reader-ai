from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from routers.books import router as books_router
from routers.ai import router as ai_router
from routers.auth import router as auth_router
from routers.user import router as user_router
from routers.admin import router as admin_router
from routers.annotations import router as annotations_router
from routers.vocabulary import router as vocabulary_router
from routers.insights import router as insights_router
from services.db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await _resume_bulk_translation_if_needed()
    await _start_translation_queue_worker()
    try:
        yield
    finally:
        await _stop_translation_queue_worker()


async def _start_translation_queue_worker() -> None:
    """Launch the always-on queue worker. It immediately idles if no API key
    or languages are configured — admins can flip it on from the UI without
    restarting the backend."""
    import logging
    try:
        from services.translation_queue import worker
        await worker().start()
    except Exception:
        logging.getLogger(__name__).exception("Failed to start translation queue worker")


async def _stop_translation_queue_worker() -> None:
    import logging
    try:
        from services.translation_queue import worker
        await worker().stop()
    except Exception:
        logging.getLogger(__name__).exception("Failed to stop translation queue worker")


async def _resume_bulk_translation_if_needed() -> None:
    """If a bulk translation job was `running` when the server stopped, it
    was interrupted by a restart (e.g. Railway redeploy). Mark it as
    `interrupted` and let the admin manually kick it off again (we can't
    auto-restart without the admin's decrypted Gemini key in memory)."""
    import logging
    log = logging.getLogger(__name__)
    try:
        from services.bulk_translate import load_latest_job, update_job
        state = await load_latest_job()
        if state and state.status == "running":
            log.info("Marking interrupted bulk job #%d as paused for resume by admin", state.id)
            await update_job(state.id, status="paused",
                             last_error="Interrupted by server restart")
    except Exception as e:
        log.warning("Bulk job resume check failed: %s", e)


app = FastAPI(title="Book Reader AI", version="1.0.0", lifespan=lifespan)

import os

FRONTEND_URL = os.environ.get("FRONTEND_URL", "")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "tauri://localhost",
        *([FRONTEND_URL] if FRONTEND_URL else []),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-TTS-Timings"],
)

# Chrome Private Network Access: allow localhost-to-localhost requests
from fastapi import Request
from fastapi.responses import Response
from starlette.middleware.base import BaseHTTPMiddleware

class PrivateNetworkMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if request.headers.get("Access-Control-Request-Private-Network"):
            response.headers["Access-Control-Allow-Private-Network"] = "true"
        return response

app.add_middleware(PrivateNetworkMiddleware)

app.include_router(auth_router, prefix="/api")
app.include_router(user_router, prefix="/api")
app.include_router(books_router, prefix="/api")
app.include_router(ai_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(annotations_router, prefix="/api")
app.include_router(vocabulary_router, prefix="/api")
app.include_router(insights_router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
