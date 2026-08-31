"""Uploaded .txt files are decoded by detecting their encoding (#2789).

The route decoded every upload as UTF-8 with errors="replace", so a Japanese
file — commonly Shift_JIS, EUC-JP or ISO-2022-JP — had every non-ASCII
sequence turned into U+FFFD before it reached the database. The upload then
"succeeded" with unreadable content that cannot be repaired by re-decoding,
because the original bytes are gone.
"""
import io
import os

import aiosqlite
import pytest

import services.db as db_module
from services.book_parser import decode_text_bytes

JA = "吾輩は猫である。名前はまだ無い。\n\n第一章\n\nどこで生れたかとんと見当がつかぬ。"
ZH = "第一章\n\n天地玄黄，宇宙洪荒。日月盈昃，辰宿列张。"
RU = "Глава первая\n\nВсе счастливые семьи похожи друг на друга."
FR = "Chapitre premier\n\nOù est la bibliothèque? Le café est très bon."


@pytest.mark.parametrize(
    "encoding,text",
    [
        ("utf-8", JA),
        ("utf-8-sig", JA),
        ("shift_jis", JA),
        ("euc-jp", JA),
        ("iso-2022-jp", JA),
        ("gb18030", ZH),
        ("cp1251", RU),
        ("latin-1", FR),
    ],
)
def test_round_trips(encoding, text):
    assert decode_text_bytes(text.encode(encoding)) == text


def test_iso_2022_jp_is_not_mistaken_for_ascii():
    """ISO-2022-JP is 7-bit: it decodes 'successfully' as UTF-8, into escape
    gibberish rather than Japanese. The escape sequence has to be spotted first."""
    decoded = decode_text_bytes(JA.encode("iso-2022-jp"))

    assert decoded == JA
    assert "\x1b" not in decoded


def test_a_bom_is_stripped():
    assert decode_text_bytes(b"\xef\xbb\xbfHello") == "Hello"


def test_nothing_is_replaced_silently():
    """The old behaviour: every non-ASCII sequence became U+FFFD."""
    assert "�" not in decode_text_bytes(JA.encode("shift_jis"))


def test_binary_is_rejected():
    with pytest.raises(ValueError):
        decode_text_bytes(bytes(4000))


def test_random_bytes_are_rejected():
    with pytest.raises(ValueError):
        decode_text_bytes(os.urandom(4000))


def test_empty_input_is_rejected():
    with pytest.raises(ValueError):
        decode_text_bytes(b"")


# ── Through the upload route ─────────────────────────────────────────────────

def _upload(content: bytes, filename: str = "book.txt"):
    return {"file": (filename, io.BytesIO(content), "text/plain")}


async def _book_count(db_path: str) -> int:
    async with aiosqlite.connect(db_path) as db:
        async with db.execute("SELECT COUNT(*) FROM books WHERE source='upload'") as cur:
            return (await cur.fetchone())[0]


async def test_a_shift_jis_upload_reads_correctly(client, test_user):
    body = "吾輩は猫である\n\n第一章\n\n名前はまだ無い。どこで生れたかとんと見当がつかぬ。"
    resp = await client.post("/api/books/upload", files=_upload(body.encode("shift_jis")))

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "�" not in data["title"], "the title used to be all replacement characters"
    previews = " ".join(c["preview"] for c in data["detected_chapters"])
    assert "�" not in previews
    assert "名前" in previews or "吾輩" in data["title"]


async def test_a_gb18030_upload_reads_correctly(client, test_user):
    body = "天地玄黄\n\n第一章\n\n宇宙洪荒。日月盈昃，辰宿列张。"
    resp = await client.post("/api/books/upload", files=_upload(body.encode("gb18030")))

    assert resp.status_code == 200, resp.text
    assert "�" not in resp.json()["title"]


async def test_an_undecodable_upload_is_rejected_and_leaves_no_book(client, test_user):
    before = await _book_count(db_module.DB_PATH)

    resp = await client.post("/api/books/upload", files=_upload(os.urandom(5000)))

    assert resp.status_code == 422
    assert "encoding" in resp.json()["detail"].lower()
    assert await _book_count(db_module.DB_PATH) == before, "no half-made book row"


async def test_utf8_uploads_are_unaffected(client, test_user):
    body = "The Big Sleep\n\nChapter 1\n\nIt was about eleven o'clock in the morning."
    resp = await client.post("/api/books/upload", files=_upload(body.encode("utf-8")))

    assert resp.status_code == 200, resp.text
    assert resp.json()["title"] == "The Big Sleep"
