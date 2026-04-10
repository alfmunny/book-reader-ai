from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from routers.books import router as books_router
from routers.ai import router as ai_router
from services.db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Book Reader AI", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "tauri://localhost",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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

app.include_router(books_router, prefix="/api")
app.include_router(ai_router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
