import base64
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from services.auth import get_current_user, encrypt_api_key, decrypt_api_key
from services.db import (
    save_word,
    get_vocabulary,
    delete_word,
    get_obsidian_settings,
    get_cached_book,
)

router = APIRouter(prefix="/vocabulary", tags=["vocabulary"])


class WordSave(BaseModel):
    word: str
    book_id: int
    chapter_index: int
    sentence_text: str


class ExportRequest(BaseModel):
    book_id: int | None = None


@router.post("")
async def save(req: WordSave, user: dict = Depends(get_current_user)):
    return await save_word(
        user["id"],
        req.word,
        req.book_id,
        req.chapter_index,
        req.sentence_text,
    )


@router.get("")
async def list_vocabulary(user: dict = Depends(get_current_user)):
    return await get_vocabulary(user["id"])


@router.delete("/{word}")
async def remove_word(word: str, user: dict = Depends(get_current_user)):
    deleted = await delete_word(user["id"], word)
    if not deleted:
        raise HTTPException(status_code=404, detail="Word not found")
    return {"ok": True}


# ── Obsidian export ───────────────────────────────────────────────────────────

async def _github_put(
    token: str,
    repo: str,
    path: str,
    filename: str,
    content_md: str,
    message: str,
) -> str:
    """PUT a file to GitHub, fetching existing sha first if needed. Returns the file URL."""
    api_url = f"https://api.github.com/repos/{repo}/contents/{path}/{filename}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        # Try to get current sha (for updates)
        get_resp = await client.get(api_url, headers=headers)
        sha = get_resp.json().get("sha") if get_resp.status_code == 200 else None

        body: dict = {
            "message": message,
            "content": base64.b64encode(content_md.encode()).decode(),
        }
        if sha:
            body["sha"] = sha

        put_resp = await client.put(api_url, headers=headers, json=body)

    if put_resp.status_code not in (200, 201):
        raise HTTPException(
            status_code=502,
            detail=f"GitHub API error {put_resp.status_code}: {put_resp.text[:200]}",
        )
    return put_resp.json()["content"]["html_url"]


def _build_book_markdown(
    book: dict,
    words_for_book: list[dict],
    annotations: list[dict],
    connected: list[dict],
    book_id: int,
    export_date: str,
) -> str:
    authors = ", ".join(book.get("authors", [])) if book else "Unknown"
    title = book.get("title", f"Book {book_id}") if book else f"Book {book_id}"

    lines = [
        "---",
        f"Author: {authors}",
        "Language: English",
        f"Source: gutenberg.org/ebooks/{book_id}",
        f"Export-Date: {export_date}",
        "---",
        "#reading #books",
        "",
        "## Vocabulary",
    ]

    for entry in words_for_book:
        word = entry["word"]
        for occ in entry["occurrences"]:
            if occ["book_id"] == book_id:
                lines.append(
                    f"- [[{word}]] — Ch.{occ['chapter_index']}: \"{occ['sentence_text']}\""
                )

    lines += ["", "## Connected Books (shared vocabulary)"]
    for conn in connected:
        shared_words = ", ".join(f"[[{w}]]" for w in conn["shared_words"])
        lines.append(f"- [[{conn['title']}]] — shared: {shared_words}")

    lines += ["", "## Annotations"]
    # Group by chapter
    chapters: dict[int, list] = {}
    for ann in annotations:
        chapters.setdefault(ann["chapter_index"], []).append(ann)
    for ch_idx in sorted(chapters):
        lines.append(f"### Chapter {ch_idx}")
        for ann in chapters[ch_idx]:
            lines.append(f"> \"{ann['sentence_text']}\"")
            if ann.get("note_text"):
                lines.append(ann["note_text"])

    return "\n".join(lines) + "\n"


def _build_word_markdown(word: str, occurrences: list[dict]) -> str:
    lines = [f"# {word}", "", "## In your books"]
    for occ in occurrences:
        book_title = occ.get("book_title") or f"Book {occ['book_id']}"
        lines.append(f"- [[{book_title}]] Ch.{occ['chapter_index']} — \"{occ['sentence_text']}\"")

    unique_titles = list(dict.fromkeys(
        occ.get("book_title") or f"Book {occ['book_id']}" for occ in occurrences
    ))
    lines += ["", "## Books"]
    for t in unique_titles:
        lines.append(f"- [[{t}]]")

    return "\n".join(lines) + "\n"


def _find_connected_books(
    book_id: int,
    all_vocab: list[dict],
    min_shared: int = 2,
) -> list[dict]:
    """Return books sharing ≥ min_shared vocabulary words with book_id."""
    # words used in target book
    words_in_book: dict[str, str] = {}
    for entry in all_vocab:
        for occ in entry["occurrences"]:
            if occ["book_id"] == book_id:
                words_in_book[entry["word"]] = entry["word"]

    # count shared words per other book
    book_words: dict[int, dict] = {}
    for entry in all_vocab:
        word = entry["word"]
        if word not in words_in_book:
            continue
        for occ in entry["occurrences"]:
            if occ["book_id"] != book_id:
                bid = occ["book_id"]
                btitle = occ.get("book_title") or f"Book {bid}"
                if bid not in book_words:
                    book_words[bid] = {"title": btitle, "shared_words": []}
                if word not in book_words[bid]["shared_words"]:
                    book_words[bid]["shared_words"].append(word)

    return [
        {"title": v["title"], "shared_words": v["shared_words"]}
        for v in book_words.values()
        if len(v["shared_words"]) >= min_shared
    ]


@router.post("/export/obsidian")
async def export_obsidian(
    req: ExportRequest,
    user: dict = Depends(get_current_user),
):
    settings = await get_obsidian_settings(user["id"])
    github_token_enc = settings.get("github_token")
    repo = settings.get("obsidian_repo")
    obs_path = settings.get("obsidian_path") or "All Notes/002 Literature Notes/000 Books"

    if not github_token_enc or not repo:
        raise HTTPException(
            status_code=400,
            detail="Obsidian settings (GitHub token and repo) not configured",
        )

    github_token = decrypt_api_key(github_token_enc)
    export_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    all_vocab = await get_vocabulary(user["id"])

    from services.db import get_annotations as db_get_annotations

    try:
        if req.book_id is not None:
            # Export single book
            book = await get_cached_book(req.book_id)
            annotations = await db_get_annotations(user["id"], req.book_id)
            words_for_book = [
                v for v in all_vocab
                if any(occ["book_id"] == req.book_id for occ in v["occurrences"])
            ]
            connected = _find_connected_books(req.book_id, all_vocab)
            title = book.get("title", f"Book {req.book_id}") if book else f"Book {req.book_id}"
            filename = f"{title}.md"
            content = _build_book_markdown(
                book, words_for_book, annotations, connected, req.book_id, export_date
            )
            url = await _github_put(
                github_token, repo, obs_path, filename, content, f"Update {filename}"
            )
            return {"url": url}
        else:
            # Export all — one file per book + one per word
            book_ids = list({
                occ["book_id"]
                for entry in all_vocab
                for occ in entry["occurrences"]
            })

            urls = []
            for bid in book_ids:
                book = await get_cached_book(bid)
                annotations = await db_get_annotations(user["id"], bid)
                words_for_book = [
                    v for v in all_vocab
                    if any(occ["book_id"] == bid for occ in v["occurrences"])
                ]
                connected = _find_connected_books(bid, all_vocab)
                title = book.get("title", f"Book {bid}") if book else f"Book {bid}"
                filename = f"{title}.md"
                content = _build_book_markdown(
                    book, words_for_book, annotations, connected, bid, export_date
                )
                url = await _github_put(
                    github_token, repo, obs_path, filename, content, f"Update {filename}"
                )
                urls.append(url)

            # Export individual word notes
            vocab_path = f"{obs_path}/vocabulary"
            for entry in all_vocab:
                word = entry["word"]
                word_md = _build_word_markdown(word, entry["occurrences"])
                filename = f"{word}.md"
                url = await _github_put(
                    github_token, repo, vocab_path, filename, word_md, f"Update {filename}"
                )
                urls.append(url)

            return {"urls": urls}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
