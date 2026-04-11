# Build context: REPO ROOT (not backend/). Railway uses the repo root as
# the build context by default, so all COPY paths must be prefixed with
# `backend/`. To build locally, also run from the repo root:
#   docker build -f backend/Dockerfile -t book-reader-backend .
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for lxml / edge-tts
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libxml2-dev \
    libxslt-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

# Railway injects PORT at runtime; default to 8000 for local Docker runs
ENV PORT=8000

EXPOSE $PORT

CMD uvicorn main:app --host 0.0.0.0 --port $PORT
