# Architect Session Report — 2026-04-27

Scope: 10-min cron Architect loop, cycles 1–5 (~50 min wall time). Worktree: `/Users/alfmunny/Projects/AI/book-reader-ai-arch`. Main checkout reference: `/Users/alfmunny/Projects/AI/book-reader-ai`.

## TL;DR

- **Two design docs filed.** PR #1741 (splitter-version cache invalidation) and PR #1747 (multi-level table of contents). Both Path B.
- **One race-merge incident, one workflow-bug fix demonstrated, one bug filed.** PR #1741 race-merged at `2026-04-27 20:22:58Z` without user approval — the auto-merge.yml workflow ran on the `opened` event when the PR had no labels yet, enabled auto-merge; CI passed instantly on a docs-only diff (path-scoping skipped every check); merge fired 1s before my `needs-user-approval` label call landed. Filed **#1744** (P1, bug) for PM with the recommended fix (Option A: seed the gate label via `gh pr create --label`). Verified the fix one cycle later on PR #1747 — gate held cleanly.
- **One docs-drift issue filed.** Filed #1753 (P3, documentation) for PM after running `python -m scripts.generate_docs` and finding 11+ shipped designs still showing stale `Draft` status in `docs/architecture/design-index.md`, plus 4 untracked report artifacts from prior architect sessions waiting to be committed.
- **Architecture queue is the bottleneck, not the work.** P0 #1393 was actively conflicted by another session in cycles 1–3, then re-roled under a dedicated Translator role in cycle 5. P2 #1696 and #1661 still missing PM gate-1 (`needs-user-approval`) application and are non-claimable to Architect until applied.

## What shipped

### PR #1741 — Splitter-version cache invalidation + `resplit_book.py` CLI (closes #1221)

Design doc at `docs/design/splitter-version-cache-invalidation.md` (226 lines). The required prerequisite before re-splitting any book in the catalog (called out in #964 design doc as a follow-up).

Highlights:

- **`books.splitter_version INTEGER NOT NULL DEFAULT 0`** — `0` = legacy, `1` = post-#1055, future bumps monotonic.
- **Per-table cache-invalidation policy** documented in a single table covering `translations`, `audio_cache`, `chapter_summaries`, `book_insights`, `translation_queue`, `chat_messages`, `reading_history`, `user_reading_progress`, `annotations`, `word_occurrences`, `user_book_chapters`. DELETE-per-book for the chapter-indexed expensive caches; CLAMP for `user_reading_progress.current_chapter`; KEEP for book-level / chat / analytics.
- **`backend/scripts/resplit_book.py`** with `--dry-run` (default), `--confirm`, `--bump-version-only` modes. Diff-then-confirm semantics. Single-transaction cascade.
- **No automatic resplit on read.** Operator-in-the-loop only.
- 11-row test plan + 8 risk/open-question entries.

**Gate failure noted in §"Race-merge incident" below.** The implementation issue is on hold pending user confirmation that the design as-merged is acceptable (or to be revised).

### PR #1747 — Multi-level table of contents (closes #1742, in-flight)

Design doc at `docs/design/multi-level-toc.md` (244 lines). Filed in cycle 3 after the user bumped #1742 from P2→P1 and added `user-approved`.

Highlights:

- **Augment-don't-replace data model.** `chapter_index` stays canonical; chapters gain a parallel `group_path: list[str]`. Cache contract for every chapter-indexed table is invariant under this change — no migration of `translations` / `audio_cache` / `annotations` / etc.
- **Schema** (uploads only): `ALTER TABLE user_book_chapters ADD COLUMN group_path TEXT NOT NULL DEFAULT '[]'`. Gutenberg books are in-memory (`_chapter_cache`), no schema change.
- **EPUB ingestion**: surfaces what `_walk_toc_with_path` (`splitter.py:921`) already collects — the ancestor stack. The composed parent-leaf title from `epub-nested-ncx-titles.md` returns to bare leaf + `group_path = ["Parent"]`.
- **Plain-text splitter**: rank-based group detection (Volume → Book → Part → Act → Chapter → Scene → Letter); falls back to flat behaviour when ranks aren't monotonic.
- **Frontend**: native `<details>`/`<summary>` collapsible tree + breadcrumb above the chapter title. CLAUDE.md graphic-design rules (44×44 px touch, parchment/amber/ink palette, Icons.tsx) carried through.
- **Backfill via the resplit pipeline** from PR #1741 — splitter_version bumps `1 → 2`; hierarchical books resplit via `--bump-version-only` (cleanest case: `chapter_index` unchanged, only `group_path` added).

Status: PR is OPEN, **CLEAN**, gated by `needs-user-approval`, **PM has applied `pm-approved`**. Awaiting only user gate-clearance.

## Race-merge incident — PR #1741

**Timeline (UTC):**

| t | actor | event |
|---|---|---|
| 20:22:50 | github-actions[bot] | `auto-merge.yml` runs on `opened`, sees zero gate labels, enables auto-merge |
| 20:22:57 | architect (me) | `gh api …/labels -X POST 'needs-user-approval'` lands |
| 20:22:58 | github-actions[bot] | merge fires (CI green: docs-only diff, path-scoping skipped every check) |
| 20:22:58 | github-actions[bot] | `disable-auto-merge` job tries to fire on `labeled` event — fails: PR already merged |

**Why #897 didn't catch this.** #897 made `auto-merge.yml` re-run on `labeled` / `unlabeled` events and check all three gate labels. That part works — the `disable-auto-merge-if-gated` job DID run. But it ran *after* the merge had completed, so it could only return `Can't disable auto-merge for this pull request`. The workflow-level fix from #897 protects against label-clearing while a PR is open. It does NOT protect against label-application after a PR opens unlabeled.

**The race window is bounded by CI duration.** For docs-only diffs (path-scoping skips everything long) the window is **seconds**. For code diffs the window is minutes. Design-doc PRs are the worst case: they're exactly the PRs the gate is meant to protect, AND they have the smallest window.

**Fix verified one cycle later on PR #1747.** `gh pr create --title "…" --label needs-user-approval --label architecture --label enhancement` — labels attach as part of the same API call that opens the PR, so the `opened` webhook fires after the PR is fully constructed (labels included), `auto-merge.yml`'s `if:` sees the gate label, and the `auto-merge` job is filtered out from the start. Confirmed live: PR #1747 is OPEN, gated, has stayed unmerged across two `synchronize` events (force-push rebase) and a `labeled` event (PM applying `pm-approved`). The race window does not exist when the gate label is seeded at creation.

Filed **#1744** (P1, `bug`) with the full reproduction + Option A (skill-level fix) and Option B (defensive workflow change) writeups. PM scope.

## Issues I filed

| # | Kind | State | Notes |
|---|---|---|---|
| #1744 | `bug` P1 | Open | auto-merge race; PM scope (workflow YAML + `submit-pr` skill) |
| #1753 | `documentation` P3 | Open | docs-site auto-generated pages drift after recent design merges; PM chore |

Plus the two design-doc PRs (#1741, #1747) which themselves count as architecture issue closures (#1221 closed; #1742 still open pending merge).

## Idle-mode work

- **Cycle 4**: Ran `python -m scripts.generate_docs` from `backend/` and found 5-file drift in the docs site. Reverted the unstaged regenerator output (PM scope per CLAUDE.md `docs/`); filed #1753 for PM to ship the chore PR.
- **Cycle 5**: This report.

## Process notes

1. **Seed Path B gate labels at PR-create.** `gh pr create --label needs-user-approval --label architecture --label enhancement` in one call. Do not split the labels into a follow-up REST API call — that's the race window. CLAUDE.md should probably encode this rule in the Architect §Workflow section once #1744 is fixed.

2. **`/submit-pr` skill is wrong for Path B design docs.** The skill enables auto-merge unconditionally and watches until merge. For a design-doc PR that's gated, you don't *want* auto-merge enabled, and the watcher's "until merged" exit criterion would block until the user clears the gate (could be days). Did the gate-attach + label-seed manually in cycles 2 and 3, by-passing the skill's auto-merge step. #1744's recommended fix updates the skill to do the right thing.

3. **`@me` matches every session under the same GitHub login.** Gave me three "open PRs" in cycle 4 — only one was mine; the other two were Dev and UI/UX from their own worktrees. Practical filter: a PR is "mine" iff its branch is checked out in *this* worktree (`git -C <my-worktree> branch --list <branch>`). Otherwise leave it alone — rebasing another session's branch from this worktree could clobber their unpushed local commits.

4. **Architecture-issue queue this session is exhausted.** P0 #1393 was Architect's, then handed off to a dedicated Translator role mid-session — labels still say `architecture` but the work is content production, not design. P2 #1696 / #1661 are missing PM gate-1 (`needs-user-approval`) application, blocking Architect from claiming. Filing more design docs while #1747 is awaiting approval would worsen the design-review backlog (per the 2026-04-25 architect report's bottleneck warning); deliberate non-action on cycles 4–5.

5. **The fallback-chain "every cycle ends with a claim" rule has limits.** If the architecture queue is genuinely empty, the right action is sometimes "no new claim, monitor the active claim". Filing throwaway issues just to satisfy the rule produces noise. The cycles 4–5 idle outcome was: monitor PR #1747, file two cleanup issues for PM (#1744, #1753), write this session report. That feels like the right calibration.

## Not done / follow-ups

1. **Implementation issue for #1221 (splitter-version cache invalidation)** — pending user confirmation that the race-merged design is acceptable (or revisable). If the user is happy with it, file `feat: implement splitter-version cache invalidation per docs/design/splitter-version-cache-invalidation.md` labeled `feat`+`architecture` and claim. If the user wants to revise, a small follow-up PR to edit the design doc lands first.

2. **Implementation issue for #1742 (multi-level TOC)** — pending PR #1747 merge.

3. **#1744 / #1753 follow-through** — PM picks up; Architect not blocked.

4. **`docs/architecture/` extension for the splitter-version contract** — called out in PR #1741's acceptance criteria. Properly belongs to the impl PR, not standalone. Bundled with item 1.

5. **Four untracked report files in this worktree** (`epub_parser_investigation_2026_04_24.md`, `architect_session_report_2026_04_25.md`, `faust_2229_investigation_2026_04_25.md`, `translation_audits_2026_04_25.md`) — left untracked deliberately; not mine to commit. Will be picked up by PM via #1753.

## Statistics

- 5 cycles, ~50 min wall time
- 2 Path B design docs filed (470 lines total)
- 1 PR merged (race-merged: PR #1741)
- 1 PR open and gated (PR #1747, mine)
- 2 issues filed for PM (#1744 bug, #1753 docs)
- 1 architecture issue closed (#1221)
- 0 implementation PRs yet
- 1 race-merge incident → workflow-fix path validated

## Cron job

- Job ID: `76e74455`
- Schedule: `*/10 * * * *` (every 10 minutes)
- Recurring, session-only, expires after 7 days from start
