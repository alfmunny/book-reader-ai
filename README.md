# Book Reader AI

An AI-powered reader for [Project Gutenberg](https://www.gutenberg.org/) books. Read in the original language, get instant translations, ask questions about the text, hear it read aloud, and find related videos — all in one place.

![CI](https://github.com/alfmunny/book-reader-ai/actions/workflows/ci.yml/badge.svg)

---

## Features

| Feature | Description |
|---|---|
| **Library** | Search 70 000+ free Gutenberg books by title, author, or language |
| **Side-by-side translation** | Translate any chapter into your language; results are cached in the DB and shared across all users |
| **AI insights** | One fascinating insight per chapter — hidden symbols, historical context, literary devices |
| **Chat / Q&A** | Ask anything about the passage; full conversation history per book |
| **Text-to-speech** | Neural TTS (Microsoft Edge MultilingualNeural voices) with speed control |
| **Audiobooks** | Link a LibriVox audiobook; syncs section to current chapter |
| **Pronunciation practice** | Record yourself reading aloud; AI gives specific feedback |
| **Related videos** | AI suggests a YouTube query for theatrical or film performances |
| **Illustrations** | Inline images extracted from the Gutenberg HTML source |
| **Continue reading** | Remembers the last chapter for every book |
| **Bring your own Gemini key** | Paste a free [Google AI Studio](https://aistudio.google.com/app/apikey) key in your profile to use your own quota instead of the shared Claude key |

---

## Tech stack

**Frontend** — Next.js 14 (App Router), NextAuth v5 (Google OAuth), Tailwind CSS, React Testing Library  
**Backend** — FastAPI, SQLite (aiosqlite), Anthropic Claude / Google Gemini, Microsoft Edge TTS, LibriVox API  
**Deployment** — Vercel (frontend) + Railway (backend)

---

## Local development

### Prerequisites

- Node.js 20+
- Python 3.11+
- A Google OAuth 2.0 client ID ([create one here](https://console.cloud.google.com/apis/credentials))
- An Anthropic API key (optional if you use a personal Gemini key)

### 1. Clone

```bash
git clone https://github.com/alfmunny/book-reader-ai.git
cd book-reader-ai
```

### 2. Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env`:

```env
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_CLIENT_ID=<your-oauth-client-id>
JWT_SECRET=<any-32+-char-random-string>
# ENCRYPTION_KEY is derived from JWT_SECRET in dev — not needed locally
```

Start the server:

```bash
uvicorn main:app --reload
# API available at http://localhost:8000
```

### 3. Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api

# Google OAuth
AUTH_GOOGLE_ID=<your-oauth-client-id>
AUTH_GOOGLE_SECRET=<your-oauth-client-secret>

# NextAuth secret — any random string
AUTH_SECRET=<any-random-string>
```

In your Google OAuth app, add:
- **Authorised JavaScript origins**: `http://localhost:3000`
- **Authorised redirect URIs**: `http://localhost:3000/api/auth/callback/google`

Start the dev server:

```bash
npm run dev
# App available at http://localhost:3000
```

---

## Running tests

```bash
# Frontend (Jest + React Testing Library)
cd frontend && npm test

# Backend (pytest)
cd backend && pytest
```

Tests run automatically on every push and pull request via GitHub Actions.

---

## Deployment

The app is deployed on **Vercel** (frontend) + **Railway** (backend). Every push to `main` triggers an auto-deploy on both platforms — no GitHub Actions wiring required, both connect natively to the GitHub repo.

See `backend/.env.example` and `frontend/.env.example` for the full list of environment variables and how to generate each one.

### Backend — Railway

1. **New Project → Deploy from GitHub → select this repo**
2. Railway reads `railway.json` automatically (Dockerfile build, health check at `/api/health`).
3. **Attach a persistent volume** so the SQLite file survives redeploys. In the Railway service settings:
   - Click **Volumes → Add Volume**
   - **Mount path:** `/app/data`
   - Size: 1 GB is plenty for this app
4. **Add environment variables** from `backend/.env.example`:
   - `DB_PATH` — `/app/data/books.db` ← **must be inside the volume mount path** from step 3
   - `JWT_SECRET` — `openssl rand -hex 32`
   - `GOOGLE_CLIENT_ID` — from Google Cloud Console OAuth credentials
   - `FRONTEND_URL` — `https://<your-vercel-url>` (after the frontend is deployed)
   - `ENCRYPTION_KEY` — optional, derived from `JWT_SECRET` if unset
   - `YOUTUBE_API_KEY` — optional, only for the "find related videos" feature

### Frontend — Vercel

1. **New Project → Import from GitHub → select this repo**
2. Set **Root Directory** to `frontend`
3. **Add environment variables** from `frontend/.env.example`:
   - `NEXT_PUBLIC_API_URL` — `https://<your-railway-url>/api`
   - `AUTH_SECRET` — `openssl rand -base64 32`
   - `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` — same OAuth credentials as the backend
4. **Google OAuth setup**: in Google Cloud Console, add the Vercel domain to **Authorized JavaScript origins** and add `https://<your-vercel-url>/api/auth/callback/google` to **Authorized redirect URIs**.

### Notes on data persistence

The backend reads `DB_PATH` from the environment and falls back to `backend/books.db` for local development. **In production you must point this at a path inside a persistent volume** — Railway containers have an ephemeral filesystem, and any file outside a mounted volume gets wiped on every redeploy.

The Railway setup steps above (volume at `/app/data` + `DB_PATH=/app/data/books.db`) are the minimum viable fix. The longer-term option is to migrate to managed Postgres (Railway Postgres, Neon, Supabase), which removes the volume entirely.

### Post-deploy smoke test

`.github/workflows/smoke-test.yml` polls the live backend health endpoint and the live frontend `/login` page after every push to `main` (and every 6 hours on a schedule). It catches the class of bug that only fails inside the real container — port expansion, missing env vars, volume mount problems — that unit tests and the Docker build CI cannot reach.

Add the deployment URLs as **repository variables** (Settings → Secrets and variables → Actions → **Variables** tab — these are public URLs, not secrets):

| Variable | Example value |
|---|---|
| `BACKEND_URL` | `https://book-reader-ai-backend.up.railway.app` |
| `FRONTEND_URL` | `https://book-reader-ai.vercel.app` |

The workflow gracefully skips each check if its variable is unset, so the workflow won't break `main` if you haven't wired the URLs up yet.

---

## Project structure

```
book-reader-ai/
├── backend/
│   ├── main.py               # FastAPI app + CORS
│   ├── routers/
│   │   ├── ai.py             # /ai/* — translation, insights, TTS, Q&A
│   │   ├── books.py          # /books/* — search, cache, chapters
│   │   ├── audiobooks.py     # /audiobooks/* — LibriVox integration
│   │   ├── auth.py           # /auth/google — Google token exchange
│   │   └── user.py           # /user/* — profile, Gemini key management
│   ├── services/
│   │   ├── claude.py         # Anthropic Claude calls
│   │   ├── gemini.py         # Google Gemini calls (user's own key)
│   │   ├── db.py             # SQLite helpers
│   │   ├── gutenberg.py      # Gutenberg fetch + HTML image extraction
│   │   ├── tts.py            # Edge TTS (MultilingualNeural voices)
│   │   ├── auth.py           # JWT + Google token verification + Fernet encryption
│   │   └── librivox.py       # LibriVox API
│   └── Dockerfile
├── frontend/
│   └── src/
│       ├── app/              # Next.js App Router pages
│       ├── components/       # React components
│       ├── lib/              # API client, settings, recent books
│       └── __tests__/        # Jest test suite
├── .github/workflows/
│   └── ci.yml                # CI: Jest + pytest + Docker build
└── railway.json              # Railway deployment config
```

---

## Environment variables reference

### Backend

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | Yes | Secret for signing backend JWTs (32+ chars). Generate with `openssl rand -hex 32`. |
| `GOOGLE_CLIENT_ID` | Yes | OAuth client ID for verifying Google ID tokens |
| `FRONTEND_URL` | Prod only | Frontend origin added to CORS allow-list |
| `DB_PATH` | Prod | SQLite file path. **On Railway must point inside a mounted volume** (e.g. `/app/data/books.db`), otherwise data is lost on every redeploy. |
| `ENCRYPTION_KEY` | Prod recommended | Fernet key for encrypting stored Gemini keys (derived from JWT_SECRET if unset) |
| `YOUTUBE_API_KEY` | Optional | Enables the "find related videos" feature |

### Frontend

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | Backend API base URL (include `/api` suffix) |
| `AUTH_SECRET` | Yes | NextAuth signing secret. Generate with `openssl rand -base64 32`. |
| `AUTH_GOOGLE_ID` | Yes | Google OAuth client ID (same as backend) |
| `AUTH_GOOGLE_SECRET` | Yes | Google OAuth client secret |

---

## License

Books are sourced from [Project Gutenberg](https://www.gutenberg.org/) and are in the public domain.
