import asyncio
import base64
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field

from services.auth import get_current_user, encrypt_api_key, decrypt_api_key, check_book_access
from services.db import (
    save_word,
    get_vocabulary,
    delete_word,
    get_obsidian_settings,
    get_cached_book,
    get_insights,
    get_flashcards_due,
    review_flashcard,
    get_flashcard_stats,
)
from services import decks as decks_service
from services import vocab_tags
from services.translate import translate_text

router = APIRouter(prefix="/vocabulary", tags=["vocabulary"])


class WordSave(BaseModel):
    word: str = Field(..., max_length=200)
    book_id: int = Field(..., ge=1)
    chapter_index: int = Field(..., ge=0)
    sentence_text: str = Field(..., max_length=5000)


class ExportRequest(BaseModel):
    book_id: int | None = Field(default=None, ge=1)
    target_language: str = Field(default="zh", min_length=1, max_length=20)


@router.post("")
async def save(req: WordSave, user: dict = Depends(get_current_user)):
    if not req.word or not req.word.strip():
        raise HTTPException(status_code=400, detail="Word cannot be empty")
    if not req.sentence_text or not req.sentence_text.strip():
        raise HTTPException(status_code=400, detail="sentence_text cannot be empty")
    book = await get_cached_book(req.book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    check_book_access(book, user)
    from services.book_chapters import split_with_html_preference as _split
    _chapters = await _split(req.book_id, book.get("text") or "")
    if req.chapter_index < 0 or req.chapter_index >= len(_chapters):
        raise HTTPException(
            status_code=400,
            detail=f"Chapter index out of range (book has {len(_chapters)} chapter(s)).",
        )
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


@router.get("/definition/{word}")
async def get_definition(
    word: str = Path(..., max_length=200),
    lang: str = Query(default="en", min_length=1, max_length=20),
    user: dict = Depends(get_current_user),
):
    from services import wiktionary
    result = await wiktionary.lookup(word, lang)
    if not result["definitions"]:
        raw_key = user.get("gemini_key")
        if raw_key:
            try:
                api_key = decrypt_api_key(raw_key)
            except HTTPException:
                api_key = None
            if api_key:
                result = await wiktionary.ai_lookup(word, lang, api_key)
    return result


@router.delete("/{word}")
async def remove_word(word: str = Path(..., max_length=200), user: dict = Depends(get_current_user)):
    deleted = await delete_word(user["id"], word)
    if not deleted:
        raise HTTPException(status_code=404, detail="Word not found")
    return {"ok": True}


# ── Flashcards / SRS (issue #556) ────────────────────────────────────────────

class ReviewRequest(BaseModel):
    grade: int = Field(..., ge=0, le=5)


@router.get("/flashcards/due")
async def get_due_flashcards(
    deck_id: int | None = Query(default=None, ge=1),
    user: dict = Depends(get_current_user),
):
    if deck_id is not None:
        vocab_ids = await decks_service.resolve_deck_vocab_ids(user["id"], deck_id)
        if vocab_ids is None:
            raise HTTPException(status_code=404, detail="Deck not found")
        return await get_flashcards_due(user["id"], vocabulary_ids=vocab_ids)
    return await get_flashcards_due(user["id"])


@router.post("/flashcards/{vocabulary_id}/review")
async def submit_flashcard_review(
    req: ReviewRequest,
    vocabulary_id: int = Path(..., ge=1),
    user: dict = Depends(get_current_user),
):
    result = await review_flashcard(user["id"], vocabulary_id, req.grade)
    if result is None:
        raise HTTPException(status_code=404, detail="Flashcard not found")
    return result


@router.get("/flashcards/stats")
async def flashcard_stats(
    deck_id: int | None = Query(default=None, ge=1),
    user: dict = Depends(get_current_user),
):
    if deck_id is not None:
        vocab_ids = await decks_service.resolve_deck_vocab_ids(user["id"], deck_id)
        if vocab_ids is None:
            raise HTTPException(status_code=404, detail="Deck not found")
        return await get_flashcard_stats(user["id"], vocabulary_ids=vocab_ids)
    return await get_flashcard_stats(user["id"])


# ── Tags on vocabulary (issue #645) ─────────────────────────────────────────

class TagAdd(BaseModel):
    tag: str = Field(..., min_length=1, max_length=50)


@router.get("/tags")
async def list_tags(user: dict = Depends(get_current_user)):
    return await vocab_tags.list_user_tags(user["id"])


@router.get("/{vocabulary_id}/tags")
async def get_tags(
    vocabulary_id: int = Path(..., ge=1),
    user: dict = Depends(get_current_user),
):
    return await vocab_tags.get_vocab_tags(user["id"], vocabulary_id)


@router.post("/{vocabulary_id}/tags", status_code=201)
async def add_tag(
    req: TagAdd,
    vocabulary_id: int = Path(..., ge=1),
    user: dict = Depends(get_current_user),
):
    try:
        normalized = await vocab_tags.add_vocab_tag(user["id"], vocabulary_id, req.tag)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if normalized is None:
        raise HTTPException(status_code=404, detail="Vocabulary word not found")
    return {"tag": normalized}


@router.delete("/{vocabulary_id}/tags/{tag}", status_code=204)
async def delete_tag(
    vocabulary_id: int = Path(..., ge=1),
    tag: str = Path(..., min_length=1, max_length=50),
    user: dict = Depends(get_current_user),
):
    try:
        removed = await vocab_tags.remove_vocab_tag(user["id"], vocabulary_id, tag)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not removed:
        raise HTTPException(status_code=404, detail="Tag not found on this word")
    return None


# ── Obsidian export ───────────────────────────────────────────────────────────

def _sanitize_filename(name: str) -> str:
    """Replace characters that are invalid in GitHub filenames or URL paths."""
    for ch in r'/\:*?"<>|':
        name = name.replace(ch, "_")
    return name.strip("_ ") or "untitled"


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


_LANG_NAMES: dict[str, str] = {
    "en": "English", "de": "German", "fr": "French", "es": "Spanish",
    "it": "Italian", "pt": "Portuguese", "ru": "Russian", "ja": "Japanese",
    "zh": "Chinese", "nl": "Dutch", "pl": "Polish", "sv": "Swedish",
    "fi": "Finnish", "da": "Danish", "no": "Norwegian", "la": "Latin",
}


def _build_book_markdown(
    book: dict,
    words_for_book: list[dict],
    annotations: list[dict],
    connected: list[dict],
    insights: list[dict],
    book_id: int,
    export_date: str,
    ann_translations: dict[int, str] | None = None,
) -> str:
    authors_list: list[str] = book.get("authors", []) if book else []
    authors = ", ".join(authors_list) if authors_list else "Unknown"
    title = book.get("title", f"Book {book_id}") if book else f"Book {book_id}"
    langs: list[str] = book.get("languages", ["en"]) if book else ["en"]
    language = ", ".join(_LANG_NAMES.get(l, l) for l in langs) if langs else "English"
    safe_title = title.replace('"', '\\"')

    lines = [
        "---",
        f'title: "{safe_title}"',
        f"author: {authors}",
        f"language: {language}",
        f"source: https://www.gutenberg.org/ebooks/{book_id}",
        "tags:",
        "  - reading",
        "  - books",
        f"export_date: {export_date}",
        "---",
        "",
    ]

    if words_for_book:
        lines.append("## Vocabulary")
        lines.append("")
        for entry in words_for_book:
            word = entry["word"]
            for occ in entry["occurrences"]:
                if occ["book_id"] == book_id:
                    lines.append(
                        f"- [[{word}]] — Ch.{occ['chapter_index'] + 1}: \"{occ['sentence_text']}\""
                    )
        lines.append("")

    if connected:
        lines.append("## Connected Books")
        lines.append("")
        for conn in connected:
            shared_words = ", ".join(f"[[{w}]]" for w in conn["shared_words"])
            lines.append(f"- [[{conn['title']}]] — shared: {shared_words}")
        lines.append("")

    if annotations:
        lines.append("## Annotations")
        chapters: dict[int, list] = {}
        for ann in annotations:
            chapters.setdefault(ann["chapter_index"], []).append(ann)
        for ch_idx in sorted(chapters):
            lines.append(f"\n### Chapter {ch_idx + 1}")
            for ann in chapters[ch_idx]:
                lines.append(f"\n> [!quote] Ch.{ch_idx + 1}")
                lines.append(f"> {ann['sentence_text']}")
                if ann_translations and ann["id"] in ann_translations:
                    lines.append(f"> ")
                    lines.append(f"> *{ann_translations[ann['id']]}*")
                if ann.get("note_text"):
                    lines.append(f"\n{ann['note_text']}")
        lines.append("")

    if insights:
        lines.append("## Reading Insights")
        lines.append("")
        for ins in insights:
            ch_label = f" (Ch.{ins['chapter_index'] + 1})" if ins.get("chapter_index") is not None else ""
            if ins.get("context_text"):
                lines.append(f"> [!quote]{ch_label}")
                lines.append(f"> {ins['context_text']}")
                lines.append("")
            lines.append(f"**Q{ch_label}:** {ins['question']}")
            lines.append("")
            lines.append(ins["answer"])
            lines.append("")

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

    try:
        github_token = decrypt_api_key(github_token_enc)
    except HTTPException:
        raise HTTPException(
            status_code=400,
            detail="Your GitHub token could not be decrypted. Please remove it and add it again in your profile.",
        )
    export_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    all_vocab = await get_vocabulary(user["id"])

    from services.db import get_annotations as db_get_annotations

    async def _build_and_push_book(bid: int) -> str:
        book = await get_cached_book(bid)
        if book:
            check_book_access(book, user)
        annotations = await db_get_annotations(user["id"], bid)
        book_insights = await get_insights(user["id"], bid)
        words_for_book = [
            v for v in all_vocab
            if any(occ["book_id"] == bid for occ in v["occurrences"])
        ]
        connected = _find_connected_books(bid, all_vocab)
        title = book.get("title", f"Book {bid}") if book else f"Book {bid}"
        book_lang = (book.get("languages") or ["en"])[0] if book else "en"

        # Translate annotation quotes (capped at 10, parallelized with semaphore)
        ann_translations: dict[int, str] = {}
        sem = asyncio.Semaphore(3)
        async def _translate_one(ann: dict) -> tuple[int, str]:
            async with sem:
                translated = await translate_text(
                    ann["sentence_text"], book_lang, req.target_language or "zh"
                )
                return ann["id"], translated[0] if translated else ""
        results = await asyncio.gather(
            *[_translate_one(a) for a in annotations[:10]],
            return_exceptions=True,
        )
        for res in results:
            if isinstance(res, tuple):
                ann_id, text = res
                if text:
                    ann_translations[ann_id] = text

        content = _build_book_markdown(
            book, words_for_book, annotations, connected, book_insights,
            bid, export_date, ann_translations,
        )
        filename = f"{_sanitize_filename(title)}.md"
        return await _github_put(
            github_token, repo, obs_path, filename, content, f"Update {filename}"
        )

    try:
        if req.book_id is not None:
            url = await _build_and_push_book(req.book_id)
            return {"urls": [url]}
        else:
            # Export all — one file per book + one per word
            book_ids = list({
                occ["book_id"]
                for entry in all_vocab
                for occ in entry["occurrences"]
            })

            urls = []
            for bid in book_ids:
                url = await _build_and_push_book(bid)
                urls.append(url)

            # Export individual word notes
            vocab_path = f"{obs_path}/vocabulary"
            for entry in all_vocab:
                word = entry["word"]
                word_md = _build_word_markdown(word, entry["occurrences"])
                filename = f"{_sanitize_filename(word)}.md"
                url = await _github_put(
                    github_token, repo, vocab_path, filename, word_md, f"Update {filename}"
                )
                urls.append(url)

            return {"urls": urls}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Export to GitHub failed")
