# Multi-Role Workflow — Startup Guide

This project uses four Claude sessions running concurrently, each with a distinct role.
Each session works autonomously: it picks up the next task, works it to completion, and
loops — without waiting for you.

---

## Roles at a glance

| Role | What it does when active | What it does when idle |
|---|---|---|
| **PM** | Reviews PRs, triages issues, watches deploys | Runs the review loop continuously |
| **Dev** | Fixes bugs and implements features | Bug-hunts: scans routes for missing bounds/guards |
| **UI/UX Dev** | Fixes UX/UI issues | UX-audits: scans components for design rule violations |
| **Architect** | Designs and implements complex features | Proposes new features; writes design docs |

Full rules for each role are in `CLAUDE.md`.

---

## Prerequisites

1. **`gh` authenticated:** `gh auth status` — must show a logged-in account
2. **`claude` authenticated:** run `claude` once manually to confirm it starts
3. **`tmux` installed:** `brew install tmux` if missing
4. **Worktrees:** each code role needs its own worktree (the startup script checks):
   ```bash
   git -C /Users/alfmunny/Projects/AI/book-reader-ai worktree list
   ```
   Expected worktrees (created automatically by each role on first run):
   - `book-reader-ai-dev`   — Dev sessions
   - `book-reader-ai-uiux`  — UI/UX Dev session
   - `book-reader-ai-arch`  — Architect session

---

## Option A — Fully automated (tmux)

```bash
bash /Users/alfmunny/Projects/AI/book-reader-ai/scripts/start-roles.sh
```

This opens a tmux session named `book-ai` with four windows and starts each role immediately.

Attach to the session:
```bash
tmux attach -t book-ai
```

Navigate between roles:
```
Ctrl+b  0   PM
Ctrl+b  1   Dev
Ctrl+b  2   UI/UX Dev
Ctrl+b  3   Architect
```

To add a second Dev session (for parallel bug fixing):
```bash
tmux new-window -t book-ai: -n dev2
tmux send-keys -t book-ai:dev2 "$(cat /tmp/book-ai-dev-prompt.txt | head -1 | xargs -I{} echo 'claude \"{}\"')" Enter
# Or simpler:
bash /Users/alfmunny/Projects/AI/book-reader-ai/scripts/start-dev.sh book-ai dev2
```

---

## Option B — Manual (one terminal per role)

Open four terminal windows/tabs. In each, run the command for that role:

### PM
```bash
cd /Users/alfmunny/Projects/AI/book-reader-ai
claude "/loop Act as product manager for book-reader-ai. Every cycle: (1) check for new open PRs and recently merged PRs since the last review state saved in product/review-state.md, (2) check for new or updated files in docs/, (3) review anything new — read the diff/doc, comment on open PRs if there are concerns or questions, create GitHub issues for follow-ups after merges, update product/backlog.md with findings. Save the latest reviewed PR number and latest main commit SHA to product/review-state.md after each cycle so the next cycle knows where to pick up. If nothing is new, say so briefly and wait."
```

### Dev
```bash
cd /Users/alfmunny/Projects/AI/book-reader-ai
claude "You are a Dev session for book-reader-ai. Read CLAUDE.md at /Users/alfmunny/Projects/AI/book-reader-ai/CLAUDE.md and follow the Dev role rules exactly. Read all memory files listed in /Users/alfmunny/.claude/projects/-Users-alfmunny-Projects-AI/memory/MEMORY.md. Then start immediately: verify your worktree exists, pick the highest-priority unclaimed bug or feat issue (no in-progress label), claim it, and work it to completion (regression test first, fix, full test suite, PR with auto-merge). After each PR merges, pick the next issue without waiting. If no unclaimed issues exist, enter bug-hunt mode as defined in CLAUDE.md: scan backend/routers/ for missing bounds checks and missing .exists() guards, file and fix one bug at a time."
```

### UI/UX Dev
```bash
cd /Users/alfmunny/Projects/AI/book-reader-ai
claude "You are the UI/UX Dev for book-reader-ai. Read CLAUDE.md at /Users/alfmunny/Projects/AI/book-reader-ai/CLAUDE.md and follow the UI/UX Dev role rules. Read all memory files listed in /Users/alfmunny/.claude/projects/-Users-alfmunny-Projects-AI/memory/MEMORY.md. Then start immediately: verify your worktree exists, pick the highest-priority unclaimed ux or ui issue (no in-progress label), claim it, and work it to completion (test first, implement, PR). After each PR merges, pick the next issue without waiting. If no unclaimed ux/ui issues exist, run a UX audit as defined in CLAUDE.md: scan frontend components for emoji icons, missing aria-labels, touch targets under 44px, hardcoded hex colors — file and fix one violation at a time."
```

### Architect
```bash
cd /Users/alfmunny/Projects/AI/book-reader-ai
claude "You are the Architect for book-reader-ai. Read CLAUDE.md at /Users/alfmunny/Projects/AI/book-reader-ai/CLAUDE.md and follow the Architect role rules. Read all memory files listed in /Users/alfmunny/.claude/projects/-Users-alfmunny-Projects-AI/memory/MEMORY.md. Then start immediately: verify your worktree exists, pick the highest-priority unclaimed architecture issue (no in-progress label), claim it, and work it following the appropriate path (design doc PR first for Path B). After each task completes, pick the next without waiting. If no architecture issues exist, identify the highest-value unimplemented feature, file an architecture issue for it, claim it, and begin a design doc — but do not implement without PM sign-off."
```

---

## Adding a second Dev session

Two Dev sessions can run simultaneously — each in its own branch, each claiming different
issues via the `in-progress` label. To start a second Dev session:

```bash
# In a new terminal tab or tmux window:
cd /Users/alfmunny/Projects/AI/book-reader-ai
claude "You are a second Dev session for book-reader-ai. Same role rules as Dev in CLAUDE.md. Read /Users/alfmunny/Projects/AI/book-reader-ai/CLAUDE.md and all memory files. Your worktree is book-reader-ai-dev (shared with the first Dev session — always branch off the worktree's main, never commit to another session's branch). Pick the highest-priority unclaimed issue, work it, loop."
```

PM will naturally assign issues from different subsystems to avoid file-level conflicts.
If you notice two Dev sessions about to touch the same file, one should yield and pick a
different issue.

---

## What each role does without you

Once started, you should not need to intervene. Here is what each role does:

**PM** runs every ~15 minutes:
- Reads new commits and PRs
- Reviews diffs, comments on concerns, applies `blocked` label for hard blockers
- Files follow-up issues for anything incomplete in merged PRs
- Removes `in-progress` from stale claims (no linked PR after 1 hour)
- Updates `product/review-state.md` and `product/backlog.md`

**Dev** runs continuously:
- Claims the next highest-priority `bug` or `feat` issue
- Writes a failing regression test, then fixes, then full suite
- Creates PR with auto-merge; waits for CI and merge
- Loops immediately; if no issues, files+fixes bugs it discovers itself

**UI/UX Dev** runs continuously:
- Claims the next highest-priority `ux` or `ui` issue
- Writes Jest/RTL test, implements fix, creates PR
- Loops; if no issues, runs UX audit and files+fixes violations itself

**Architect** runs continuously:
- Claims the next `architecture` issue
- For Path B: writes design doc PR, waits for PM approval, then implements
- Loops; if no issues, proposes the next most valuable feature as a new issue

---

## Intervention points (when you might need to step in)

- **PM blocks a PR** (`blocked` label) — PM leaves a comment explaining what's needed; the
  relevant role session needs to address the comment and push a fix
- **Architect posts a design doc PR** — PM reviews it, but if PM hasn't responded in a
  reasonable time, you can manually approve via `gh pr review <N> --approve`
- **Merge conflict (DIRTY)** — no role resolves another role's conflict; the owning session
  must rebase its own branch. If a session has crashed, you'll need to rebase manually
- **CI failures** — the background poll loop in each session reports failures; the owning
  session will investigate. If the session is gone, check `gh pr checks <N>` to diagnose
- **Two Dev sessions pick the same issue** — unlikely (claiming via `in-progress` prevents
  it), but if it happens, close the duplicate PR and have one session pick a new issue

---

## Stopping

To stop all roles gracefully:
```bash
tmux kill-session -t book-ai
```

Or stop individual windows:
```bash
tmux kill-window -t book-ai:dev2
```

Worktrees persist between sessions — they are not deleted automatically:
```bash
# List worktrees
git -C /Users/alfmunny/Projects/AI/book-reader-ai worktree list

# Remove a specific worktree (only after all branches are merged or abandoned)
git -C /Users/alfmunny/Projects/AI/book-reader-ai worktree remove book-reader-ai-dev
```
