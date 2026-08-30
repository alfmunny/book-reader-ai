"""Seed demo story shares so the sharing surfaces can be tested locally.

What it does: creates two demo users (Mira, Jonas), gives Mira a Chinese
translation version on the target book with the first three paragraphs of
chapter 0 "translated" (clearly-marked demo renderings), shares one of them
as a translation story with a caption, shares annotations as note stories
(chapter 0, and three sentence-anchored notes on chapter 4 for the WeRead
shared-notes surface), and has the demo users comment on each other's
shares. Idempotent — rerunning updates the same demo rows instead of
duplicating them.

When to use it: local testing of phase 2 (#2752) — the "Show others'
shares" toggle, paragraph markers, inline story panel, and the Discover
feed — without needing a second real account.

Example:
    venv/bin/python scripts/seed_demo_stories.py            # finds a book titled like %Faust%
    venv/bin/python scripts/seed_demo_stories.py --book-id 2229
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import aiosqlite

import services.db as db_module
from services.book_chapters import get_chapters

DEMO_USERS = [
    ("demo-mira", "Mira", "mira@example.invalid", "https://api.dicebear.com/9.x/thumbs/svg?seed=Mira"),
    ("demo-jonas", "Jonas", "jonas@example.invalid", "https://api.dicebear.com/9.x/thumbs/svg?seed=Jonas"),
]

RENDERINGS = [
    "【演示译文】太阳依着古老的方式，在星辰的合唱中轰鸣前行。",
    "【演示译文】它以雷霆般的步伐，完成既定的旅程。",
    "【演示译文】天使们从它的容光中汲取力量，虽然无人能测其深浅。",
]


async def _find_book(db, book_id: int | None) -> tuple[int, str]:
    if book_id is not None:
        async with db.execute("SELECT id, title FROM books WHERE id = ?", (book_id,)) as c:
            row = await c.fetchone()
        if not row:
            raise SystemExit(f"No book with id {book_id}")
        return row[0], row[1]
    async with db.execute(
        "SELECT id, title FROM books WHERE title LIKE '%Faust%' ORDER BY id LIMIT 1"
    ) as c:
        row = await c.fetchone()
    if not row:
        raise SystemExit("No book titled like %Faust% — pass --book-id")
    return row[0], row[1]


def _first_sentence(paragraph: str, max_len: int = 80) -> str:
    """A single-sentence anchor: sentence markers keep it inside one reader
    segment, so the dashed underline matches by containment."""
    text = paragraph.strip()
    cut = len(text)
    for mark in (". ", "! ", "? ", ".\n"):
        i = text.find(mark)
        if 0 < i < cut:
            cut = i + 1
    return text[: min(cut, max_len)].strip()


async def _upsert_annotation(db, user_id: int, book_id: int, chapter_index: int,
                             sentence: str, note: str, color: str) -> int:
    async with db.execute(
        "SELECT id FROM annotations WHERE user_id = ? AND book_id = ? AND sentence_text = ?",
        (user_id, book_id, sentence),
    ) as c:
        row = await c.fetchone()
    if row:
        return row[0]
    cur = await db.execute(
        "INSERT INTO annotations (user_id, book_id, chapter_index, sentence_text, note_text, color) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, book_id, chapter_index, sentence, note, color),
    )
    return cur.lastrowid


async def _upsert_user(db, google_id: str, name: str, email: str, picture: str) -> int:
    await db.execute(
        """INSERT INTO users (google_id, name, email, picture) VALUES (?, ?, ?, ?)
           ON CONFLICT(google_id) DO UPDATE SET name = excluded.name, picture = excluded.picture""",
        (google_id, name, email, picture),
    )
    async with db.execute("SELECT id FROM users WHERE google_id = ?", (google_id,)) as c:
        return (await c.fetchone())[0]


async def main() -> None:
    full_paras = 0
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--book-id", type=int, default=None)
    args = parser.parse_args()

    async with aiosqlite.connect(db_module.DB_PATH) as db:
        book_id, title = await _find_book(db, args.book_id)
        chapters = await get_chapters(book_id)
        paragraphs = [p for p in chapters[0].text.split("\n\n") if p.strip()]
        n = min(3, len(paragraphs))
        if n == 0:
            raise SystemExit("Chapter 0 has no paragraphs to anchor demo data on")

        mira_id = await _upsert_user(db, *DEMO_USERS[0])
        jonas_id = await _upsert_user(db, *DEMO_USERS[1])

        # Mira's demo version with the first paragraphs "translated"
        await db.execute(
            """INSERT INTO translation_sessions
               (user_id, book_id, name, target_language, provider)
               VALUES (?, ?, '诗意版 (demo)', 'zh', 'deepseek')
               ON CONFLICT(user_id, book_id, name) DO NOTHING""",
            (mira_id, book_id),
        )
        async with db.execute(
            "SELECT id FROM translation_sessions WHERE user_id = ? AND book_id = ? AND name = '诗意版 (demo)'",
            (mira_id, book_id),
        ) as c:
            session_id = (await c.fetchone())[0]
        for i in range(n):
            await db.execute(
                """INSERT INTO translation_session_paragraphs
                   (session_id, chapter_index, paragraph_index, text, provider, model)
                   VALUES (?, 0, ?, ?, 'deepseek', 'deepseek-v4-flash')
                   ON CONFLICT(session_id, chapter_index, paragraph_index)
                   DO UPDATE SET text = excluded.text""",
                (session_id, i, RENDERINGS[i % len(RENDERINGS)]),
            )

        # Mira's annotation on a snippet of paragraph 0 (anchor = substring)
        snippet = paragraphs[0].strip()[:80]
        async with db.execute(
            "SELECT id FROM annotations WHERE user_id = ? AND book_id = ? AND sentence_text = ?",
            (mira_id, book_id, snippet),
        ) as c:
            row = await c.fetchone()
        if row:
            annotation_id = row[0]
        else:
            cur = await db.execute(
                """INSERT INTO annotations (user_id, book_id, chapter_index, sentence_text, note_text, color)
                   VALUES (?, ?, 0, ?, '经典的开篇 — 值得反复读。(demo)', 'yellow')""",
                (mira_id, book_id, snippet),
            )
            annotation_id = cur.lastrowid

        # Wipe previous demo stories (rerun-safe), then share one of each kind
        await db.execute(
            "DELETE FROM stories WHERE user_id IN (?, ?)", (mira_id, jonas_id)
        )
        cur = await db.execute(
            """INSERT INTO stories (user_id, kind, book_id, chapter_index, session_id,
                                    paragraph_start, paragraph_end, caption)
               VALUES (?, 'translation', ?, 0, ?, 0, 0, '试着译得有诗意一点 — 欢迎讨论。(demo)')""",
            (mira_id, book_id, session_id),
        )
        translation_story_id = cur.lastrowid
        cur = await db.execute(
            """INSERT INTO stories (user_id, kind, book_id, chapter_index, annotation_id, caption)
               VALUES (?, 'note', ?, 0, ?, '分享一个读书想法。(demo)')""",
            (mira_id, book_id, annotation_id),
        )
        note_story_id = cur.lastrowid

        for story_id, body in (
            (translation_story_id, "这个译法很妙，「轰鸣」比直译有力量。(demo)"),
            (note_story_id, "同感 — 这段每次读都有新的感受。(demo)"),
        ):
            await db.execute(
                "INSERT INTO story_comments (story_id, user_id, body) VALUES (?, ?, ?)",
                (story_id, jonas_id, body),
            )

        # Chapter-4 sentence-anchored shared notes (WeRead surface)
        if len(chapters) > 4:
            ch4_paras = [p for p in chapters[4].text.split("\n\n") if p.strip()]
            notes = [
                (mira_id, "这一句读得人心里一颤 — 停下来抄在了本子上。(demo)", "yellow"),
                (jonas_id, "Hier wird der Ton plötzlich dunkler — großartiger Übergang. (demo)", "blue"),
                (mira_id, "反复读了三遍，还是觉得妙。(demo)", "green"),
            ]
            for para, (uid, note, color) in zip(ch4_paras, notes):
                sentence = _first_sentence(para)
                if not sentence:
                    continue
                ann_id = await _upsert_annotation(db, uid, book_id, 4, sentence, note, color)
                cur = await db.execute(
                    "INSERT INTO stories (user_id, kind, book_id, chapter_index, annotation_id, caption) "
                    "VALUES (?, 'note', ?, 4, ?, NULL)",
                    (uid, book_id, ann_id),
                )
                other = jonas_id if uid == mira_id else mira_id
                await db.execute(
                    "INSERT INTO story_comments (story_id, user_id, body) VALUES (?, ?, ?)",
                    (cur.lastrowid, other, "说到点子上了。(demo)" if other == mira_id else "完全同意！(demo)"),
                )

        # Mirror the OWNER's chapter-4 annotations with demo notes on the very
        # same sentences, so the beside-your-note row has something to show
        # (owner request, 2026-08-27).
        async with db.execute(
            """SELECT DISTINCT sentence_text FROM annotations
               WHERE book_id = ? AND chapter_index = 4
                 AND user_id NOT IN (?, ?) LIMIT 5""",
            (book_id, mira_id, jonas_id),
        ) as c:
            owner_sentences = [r[0] for r in await c.fetchall()]
        echo_notes = [
            (mira_id, "我也在这句停住了 — 你怎么理解它？(demo)", "blue"),
            (jonas_id, "Genau diese Stelle habe ich auch markiert! (demo)", "green"),
        ]
        mirrored = 0
        for i, sentence in enumerate(owner_sentences):
            uid, note, color = echo_notes[i % len(echo_notes)]
            ann_id = await _upsert_annotation(db, uid, book_id, 4, sentence, note, color)
            cur = await db.execute(
                "INSERT INTO stories (user_id, kind, book_id, chapter_index, annotation_id, caption) "
                "VALUES (?, 'note', ?, 4, ?, NULL)",
                (uid, book_id, ann_id),
            )
            await db.execute(
                "INSERT INTO story_comments (story_id, user_id, body) VALUES (?, ?, ?)",
                (cur.lastrowid, jonas_id if uid == mira_id else mira_id, "有意思的角度。(demo)"),
            )
            mirrored += 1
        if mirrored:
            print(f"  (mirroring {mirrored} of the owner's chapter-5 sentences with demo notes)")

        # Chapter-4 translation POSTS (~11, owner request 2026-08-29): Mira's
        # poetic version and Jonas's literal version publish overlapping
        # paragraphs so the dashed underline + posts dialog show comparison.
        posts_made = 0
        if len(chapters) > 4:
            ch4_paras = [p for p in chapters[4].text.split("\n\n") if p.strip()]
            n = min(6, len(ch4_paras))
            await db.execute(
                """INSERT INTO translation_sessions
                   (user_id, book_id, name, target_language, provider)
                   VALUES (?, ?, '直译版 (demo)', 'zh', 'deepseek')
                   ON CONFLICT(user_id, book_id, name) DO NOTHING""",
                (jonas_id, book_id),
            )
            async with db.execute(
                "SELECT id FROM translation_sessions WHERE user_id = ? AND book_id = ? AND name = '直译版 (demo)'",
                (jonas_id, book_id),
            ) as c:
                jonas_session = (await c.fetchone())[0]
            for i in range(n):
                await db.execute(
                    """INSERT INTO translation_session_paragraphs
                       (session_id, chapter_index, paragraph_index, text, provider, model)
                       VALUES (?, 4, ?, ?, 'deepseek', 'deepseek-v4-flash')
                       ON CONFLICT(session_id, chapter_index, paragraph_index)
                       DO UPDATE SET text = excluded.text""",
                    (session_id, i, f"【诗意版·演示】第{i + 1}段，以诗意笔法重译——此为本地测试用的示例译文。"),
                )
                await db.execute(
                    """INSERT INTO translation_session_paragraphs
                       (session_id, chapter_index, paragraph_index, text, provider, model)
                       VALUES (?, 4, ?, ?, 'deepseek', 'deepseek-v4-flash')
                       ON CONFLICT(session_id, chapter_index, paragraph_index)
                       DO UPDATE SET text = excluded.text""",
                    (jonas_session, i, f"【直译版·演示】第{i + 1}段，逐句直译不加修饰——此为本地测试用的示例译文。"),
                )
            mira_captions = [
                "这一段试着押了韵，读读看。(demo)",
                "意象比字面更重要——我的取舍。(demo)",
                None,
                "犹豫了很久的一句。(demo)",
                None,
                "欢迎拍砖。(demo)",
            ]
            jonas_captions = [
                "Wörtlich, ohne Schmuck. (demo)",
                None,
                "对照原文逐行看最有意思。(demo)",
                None,
                "第三行我不确定。(demo)",
            ]
            first_post_id = None
            for i in range(n):
                cur = await db.execute(
                    """INSERT INTO stories (user_id, kind, book_id, chapter_index, session_id,
                                            paragraph_start, paragraph_end, caption)
                       VALUES (?, 'translation', ?, 4, ?, ?, ?, ?)""",
                    (mira_id, book_id, session_id, i, i, mira_captions[i % len(mira_captions)]),
                )
                if first_post_id is None:
                    first_post_id = cur.lastrowid
                posts_made += 1
            for i in range(min(5, n)):
                await db.execute(
                    """INSERT INTO stories (user_id, kind, book_id, chapter_index, session_id,
                                            paragraph_start, paragraph_end, caption)
                       VALUES (?, 'translation', ?, 4, ?, ?, ?, ?)""",
                    (jonas_id, book_id, jonas_session, i, i, jonas_captions[i % len(jonas_captions)]),
                )
                posts_made += 1
            # ~16 comments spread over the chapter-4 posts (owner request,
            # 2026-08-30) so threads have something to read.
            async with db.execute(
                "SELECT id, user_id FROM stories WHERE book_id = ? AND chapter_index = 4 AND kind = 'translation' ORDER BY id",
                (book_id,),
            ) as c:
                ch4_posts = await c.fetchall()
            banter = [
                "比我的直译有味道多了。(demo)",
                "这里的节奏感处理得真好。(demo)",
                "Ich hätte das nüchterner übersetzt — aber es funktioniert. (demo)",
                "「纷纷」这个叠词用得妙。(demo)",
                "读起来像原文的呼吸。(demo)",
                "Der Reim ist geschmuggelt, aber charmant. (demo)",
                "我投这个版本一票。(demo)",
                "第二行稍微有点过译？(demo)",
                "对照原文看，取舍很大胆。(demo)",
                "学到了，回头改我自己的版本。(demo)",
                "Präzise. Vielleicht zu präzise. (demo)",
                "这个「演示」也太谦虚了。(demo)",
                "能不能把这句的处理讲讲思路？(demo)",
                "同一段两种性格，有意思。(demo)",
                "直译派与诗意派之争，永恒话题。(demo)",
                "下一段也求更新！(demo)",
            ]
            bi = 0
            for pi, (post_id, author_id) in enumerate(ch4_posts):
                other = jonas_id if author_id == mira_id else mira_id
                # 1-2 comments per post, alternating commenter first
                for k in range((pi % 2) + 1):
                    await db.execute(
                        "INSERT INTO story_comments (story_id, user_id, body) VALUES (?, ?, ?)",
                        (post_id, other if k == 0 else author_id, banter[bi % len(banter)]),
                    )
                    bi += 1
        # Paragraph-anchored translation NOTES (owner design, 2026-08-30):
        # these render in the Current-translation tab for any reader of the
        # same language — demo users AND the owner, so the panel is
        # populated for local testing.
        await db.execute(
            "DELETE FROM story_comments WHERE book_id = ? AND user_id IN (?, ?)",
            (book_id, mira_id, jonas_id),
        )
        async with db.execute(
            "SELECT id FROM users WHERE google_id NOT IN ('demo-mira', 'demo-jonas') ORDER BY id LIMIT 1"
        ) as c:
            owner_row = await c.fetchone()
        owner_id = owner_row[0] if owner_row else None
        if owner_id:
            await db.execute(
                "DELETE FROM story_comments WHERE book_id = ? AND user_id = ? AND body LIKE '%(demo)'",
                (book_id, owner_id),
            )

        notes_made = 0
        # Per-version notes (owner, 2026-08-30): each version's rendering
        # carries its own discussion — switching versions must switch notes.
        version_notes = [
            (session_id, 0, mira_id, "诗意版：这一句的节奏我斟酌了很久，最后选择了短句。(demo)",
                [(jonas_id, "短句确实更接近原文的顿挫。(demo)")]),
            (session_id, 0, owner_id, "记一笔：诗意版这里的「轰鸣」很关键。(demo)", []),
            (session_id, 1, mira_id, "诗意版：意象比字面更重要 — 我做了取舍。(demo)",
                [(owner_id, "学到了。(demo)")]),
            (session_id, 2, mira_id, "诗意版：第三行押了个内韵，读出来才明显。(demo)", []),
            (jonas_session, 0, jonas_id, "直译版：保留了原文语序，可以和诗意版对照。(demo)",
                [(mira_id, "对照着读最有意思。(demo)")]),
            (jonas_session, 0, owner_id, "直译版这里更清楚，但少了点味道。(demo)", []),
            (jonas_session, 1, jonas_id, "直译版：Zwei Lesarten möglich — ich blieb wörtlich. (demo)", []),
            (jonas_session, 2, owner_id, "这一段直译版几乎无可挑剔。(demo)",
                [(jonas_id, "谢谢！(demo)")]),
        ]
        for sess, para_idx, uid, body, replies in version_notes:
            if uid is None:
                continue
            cur = await db.execute(
                """INSERT INTO story_comments
                   (session_id, chapter_index, paragraph_index, user_id, body)
                   VALUES (?, 4, ?, ?, ?)""",
                (sess, para_idx, uid, body),
            )
            parent = cur.lastrowid
            notes_made += 1
            for r_uid, r_body in replies:
                if r_uid is None:
                    continue
                await db.execute(
                    """INSERT INTO story_comments
                       (session_id, chapter_index, paragraph_index, user_id, body, parent_comment_id)
                       VALUES (?, 4, ?, ?, ?, ?)""",
                    (sess, para_idx, r_uid, r_body, parent),
                )

        note_threads = [
            (0, mira_id, "编辑版：这句很稳，但我总觉得少了点韵律。(demo)",
                [(jonas_id, "稳就是编辑版的职责所在。(demo)")]),
            (0, owner_id, "编辑版记一笔：这段读来最顺。(demo)", []),
            (1, jonas_id, "编辑版：信息一点没丢。(demo)", []),
            (2, mira_id, "编辑版这里的处理比我预想的好。(demo)",
                [(owner_id, "同感。(demo)")]),
        ]
        for para_idx, uid, body, replies in note_threads:
            if uid is None:
                continue
            cur = await db.execute(
                """INSERT INTO story_comments
                   (book_id, target_language, chapter_index, paragraph_index, user_id, body)
                   VALUES (?, 'zh', 4, ?, ?, ?)""",
                (book_id, para_idx, uid, body),
            )
            parent = cur.lastrowid
            notes_made += 1
            for r_uid, r_body in replies:
                if r_uid is None:
                    continue
                await db.execute(
                    """INSERT INTO story_comments
                       (book_id, target_language, chapter_index, paragraph_index, user_id, body, parent_comment_id)
                       VALUES (?, 'zh', 4, ?, ?, ?, ?)""",
                    (book_id, para_idx, r_uid, r_body, parent),
                )
        # A COMPLETE, published version by a demo user so the Community
        # group in the switcher has something to select (owner, 2026-08-30).
        await db.execute(
            """INSERT INTO translation_sessions
               (user_id, book_id, name, target_language, provider, style_prompt, status)
               VALUES (?, ?, '诗意全译 (demo)', 'zh', 'deepseek', '优雅的书面语', 'published')
               ON CONFLICT(user_id, book_id, name) DO UPDATE SET status = 'published'""",
            (mira_id, book_id),
        )
        async with db.execute(
            "SELECT id FROM translation_sessions WHERE user_id = ? AND book_id = ? AND name = '诗意全译 (demo)'",
            (mira_id, book_id),
        ) as c:
            full_session = (await c.fetchone())[0]
        full_paras = 0
        for ci, ch in enumerate(chapters):
            for pi, para in enumerate(p for p in ch.text.split("\n\n") if p.strip()):
                await db.execute(
                    """INSERT INTO translation_session_paragraphs
                       (session_id, chapter_index, paragraph_index, text, provider, model)
                       VALUES (?, ?, ?, ?, 'deepseek', 'deepseek-v4-flash')
                       ON CONFLICT(session_id, chapter_index, paragraph_index)
                       DO UPDATE SET text = excluded.text""",
                    (full_session, ci, pi,
                     f"【诗意全译·演示】第{ci + 1}章 第{pi + 1}段 —— 这是用于本地测试的完整译文示例。"),
                )
                full_paras += 1
        await db.execute(
            "UPDATE translation_sessions SET published_at = CURRENT_TIMESTAMP WHERE id = ?",
            (full_session,),
        )
        await db.commit()

    print(f"Seeded demo stories on book {book_id} ({title}):")
    print(f"  - Mira's translation story #{translation_story_id} (paragraph 1, session '诗意版 (demo)')")
    print(f"  - Mira's note story #{note_story_id}")
    print("  - Jonas commented on both")
    print("  - 3 sentence-anchored shared notes on chapter 5 (index 4) with cross-comments")
    print(f"  - {posts_made} translation posts on chapter 5 (index 4): Mira 诗意版 + Jonas 直译版")
    print(f"  - {notes_made} translation notes (zh) on chapter-5 paragraphs 1-5, with replies — demo users + you")
    print(f"  - Mira's PUBLISHED whole-book version '诗意全译 (demo)' — {full_paras} paragraphs across {len(chapters)} chapters (Community group)")
    print("Open the book, enable translation, and tick 'Show others' shares' — or visit /discover.")


if __name__ == "__main__":
    asyncio.run(main())
