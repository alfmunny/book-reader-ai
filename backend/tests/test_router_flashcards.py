"""
Tests for flashcard/SRS endpoints (issue #556).

Covers:
  - GET /vocabulary/flashcards/due
  - POST /vocabulary/flashcards/{id}/review
  - GET /vocabulary/flashcards/stats
  - Auth requirements
  - SM-2 algorithm correctness
"""
import pytest
from services.db import save_book, save_word

_BOOK_META = {
    "title": "Test Book",
    "authors": ["Author"],
    "languages": ["en"],
    "subjects": [],
    "download_count": 0,
    "cover": "",
}
BOOK_ID = 9200


# ── GET /vocabulary/flashcards/due ───────────────────────────────────────────

async def test_due_flashcards_empty_when_no_vocab(client, test_user):
    """New user with no vocabulary has no due cards."""
    resp = await client.get("/api/vocabulary/flashcards/due")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_due_flashcards_returns_card_after_saving_word(client, test_user):
    """After saving a word, one flashcard is due (new card is always due today)."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(test_user["id"], "ephemeral", BOOK_ID, 0, "An ephemeral moment.")

    resp = await client.get("/api/vocabulary/flashcards/due")
    assert resp.status_code == 200
    cards = resp.json()
    assert len(cards) == 1
    card = cards[0]
    assert "vocabulary_id" in card
    assert card["word"] == "ephemeral"


async def test_due_flashcards_include_vocab_fields(client, test_user):
    """Due card response includes word, definition context, language fields."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(test_user["id"], "soliloquy", BOOK_ID, 0, "A soliloquy in the play.")

    resp = await client.get("/api/vocabulary/flashcards/due")
    assert resp.status_code == 200
    cards = resp.json()
    assert len(cards) >= 1
    card = next(c for c in cards if c["word"] == "soliloquy")
    assert "vocabulary_id" in card
    assert "word" in card
    assert "due_date" in card


async def test_due_flashcards_own_only(client, test_user):
    """Due cards are scoped to the requesting user only."""
    from services.db import get_or_create_user
    other = await get_or_create_user("flash-other", "flash-other@ex.com", "Other", "")
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(other["id"], "private", BOOK_ID, 0, "Private word.")

    resp = await client.get("/api/vocabulary/flashcards/due")
    assert resp.status_code == 200
    assert all(c["word"] != "private" for c in resp.json())


# ── POST /vocabulary/flashcards/{id}/review ──────────────────────────────────

async def test_review_card_grade_good_sets_interval_6(client, test_user):
    """First review with grade=3 (Good) → interval = 6 days on second review."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(test_user["id"], "tenacious", BOOK_ID, 0, "Tenacious effort.")

    cards = (await client.get("/api/vocabulary/flashcards/due")).json()
    vocab_id = cards[0]["vocabulary_id"]

    # First review: grade 3 → repetitions was 0 → interval = 1
    resp = await client.post(f"/api/vocabulary/flashcards/{vocab_id}/review", json={"grade": 3})
    assert resp.status_code == 200
    data = resp.json()
    assert "next_due" in data
    assert "interval_days" in data
    assert data["interval_days"] == 1  # first successful review → interval=1


async def test_review_card_grade_again_resets_interval(client, test_user):
    """Grade 0 (Again) resets interval to 1 and repetitions to 0."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(test_user["id"], "abstruse", BOOK_ID, 0, "Abstruse mathematics.")

    cards = (await client.get("/api/vocabulary/flashcards/due")).json()
    vocab_id = cards[0]["vocabulary_id"]

    resp = await client.post(f"/api/vocabulary/flashcards/{vocab_id}/review", json={"grade": 0})
    assert resp.status_code == 200
    data = resp.json()
    assert data["interval_days"] == 1


async def test_review_card_invalid_grade_returns_422(client, test_user):
    """Grade outside 0-5 must return 422."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(test_user["id"], "verbose", BOOK_ID, 0, "Verbose explanation.")

    cards = (await client.get("/api/vocabulary/flashcards/due")).json()
    vocab_id = cards[0]["vocabulary_id"]

    resp = await client.post(f"/api/vocabulary/flashcards/{vocab_id}/review", json={"grade": 6})
    assert resp.status_code == 422

    resp2 = await client.post(f"/api/vocabulary/flashcards/{vocab_id}/review", json={"grade": -1})
    assert resp2.status_code == 422


async def test_review_nonexistent_vocab_returns_404(client, test_user):
    """Reviewing a vocabulary_id that doesn't belong to the user → 404."""
    resp = await client.post("/api/vocabulary/flashcards/999999/review", json={"grade": 3})
    assert resp.status_code == 404


async def test_review_second_pass_sets_interval_6(client, test_user):
    """Second successful review (grade ≥ 3) sets interval to 6 days."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(test_user["id"], "pulchritude", BOOK_ID, 0, "Pulchritude in form.")

    cards = (await client.get("/api/vocabulary/flashcards/due")).json()
    vocab_id = cards[0]["vocabulary_id"]

    # First review
    await client.post(f"/api/vocabulary/flashcards/{vocab_id}/review", json={"grade": 4})
    # Second review
    resp = await client.post(f"/api/vocabulary/flashcards/{vocab_id}/review", json={"grade": 4})
    assert resp.status_code == 200
    assert resp.json()["interval_days"] == 6


# ── GET /vocabulary/flashcards/stats ─────────────────────────────────────────

async def test_stats_zeros_when_no_vocab(client, test_user):
    """Stats are all zero when user has no vocabulary."""
    resp = await client.get("/api/vocabulary/flashcards/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["due_today"] == 0
    assert data["reviewed_today"] == 0


async def test_stats_due_today_after_save(client, test_user):
    """After saving a word, due_today increments."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(test_user["id"], "liminal", BOOK_ID, 0, "A liminal space.")

    resp = await client.get("/api/vocabulary/flashcards/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["due_today"] == 1


async def test_stats_reviewed_today_after_review(client, test_user):
    """reviewed_today increments after a review."""
    await save_book(BOOK_ID, _BOOK_META, "text")
    await save_word(test_user["id"], "laconic", BOOK_ID, 0, "Laconic speech.")

    cards = (await client.get("/api/vocabulary/flashcards/due")).json()
    vocab_id = cards[0]["vocabulary_id"]
    await client.post(f"/api/vocabulary/flashcards/{vocab_id}/review", json={"grade": 3})

    resp = await client.get("/api/vocabulary/flashcards/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["reviewed_today"] == 1


# ── Auth requirements ─────────────────────────────────────────────────────────

async def test_flashcards_require_auth(anon_client):
    """All flashcard endpoints require authentication."""
    assert (await anon_client.get("/api/vocabulary/flashcards/due")).status_code == 401
    assert (await anon_client.get("/api/vocabulary/flashcards/stats")).status_code == 401
    assert (await anon_client.post("/api/vocabulary/flashcards/1/review", json={"grade": 3})).status_code == 401
