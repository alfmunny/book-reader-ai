# Starting a development session

This is the entry point for developing Book Reader AI with Claude Code. It covers the
folder layout, how to launch the role sessions, and how a piece of work travels from
issue to merged PR.

If you only read one thing: **`bash scripts/start-roles.sh` starts every role in manual
mode, where they wait for your instructions.** Autonomous cycles are opt-in via `--auto`.

---

## Prerequisites

```bash
gh auth status      # must show a logged-in account
tmux -V             # brew install tmux if missing
claude --version    # run `claude` once manually to confirm it starts
```

---

## Folder layout

Four directories, one per role. The base checkout doubles as PM's workspace.

```
~/Projects/AI/
├── book-reader-ai/        base / main checkout   ← PM works here
├── book-reader-ai-dev/    Dev
├── book-reader-ai-uiux/   UI/UX Dev
└── book-reader-ai-arch/   Architect
```

They are git worktrees of the same repository, so they share branches and history but
each has its own working tree and checked-out branch. That is what lets several roles
edit code at once without stepping on each other.

`start-roles.sh` creates any missing role worktree automatically on launch. You should
never need more than these four — if you see `book-reader-ai-2`, `-arch7`, `-pm-docs`
and friends, those are leftovers from sessions that made a fresh worktree per issue.
Audit them before deleting (see [Cleaning up worktrees](#cleaning-up-worktrees)).

---

## Launching the roles

The script resolves the repository from its own location, and it understands worktrees:
running the copy inside `book-reader-ai-dev` still targets the base checkout and reuses
the real role worktrees. **You can launch from any of the four folders.**

```bash
cd ~/Projects/AI/book-reader-ai-dev
bash scripts/start-roles.sh
```

Startup prints the mode it chose:

```
Repo:    /Users/alfmunny/Projects/AI/book-reader-ai
Session: book-reader-ai
Mode:    manual — roles wait for your commands  [default (pass --auto for /loop cycles)]
```

Four tmux windows open — `pm`, `dev`, `uiux`, `arch`. Each role declares itself, reads
`CLAUDE.md` and the memory files, reports a short read-only status, and then **stops**.

| Command | What you get |
|---|---|
| `bash scripts/start-roles.sh` | Manual mode — roles start and wait (**default**) |
| `bash scripts/start-roles.sh --auto` | Autonomous mode — roles run `/loop` cycles |
| `bash scripts/start-roles.sh stop` | Stop the whole tmux session |
| `bash scripts/start-roles.sh restart` | Stop, then start fresh |
| `bash scripts/start-roles.sh overview` | Collapse all four into a 2×2 grid |
| `bash scripts/start-roles.sh restore` | Spread the grid back to separate windows |
| `bash scripts/start-roles.sh dev2` | Add a second Dev window |
| `bash scripts/start-roles.sh --help` | Full flag reference |

Useful tmux keys: `Ctrl-b w` opens a visual window picker, `Ctrl-b n` / `Ctrl-b p` step
between windows, `Ctrl-b d` detaches (roles keep running). Re-attach with
`tmux attach -t book-reader-ai`.

---

## Manual mode (the default)

In manual mode a role will not act on its own. Specifically it will **not**:

- schedule a `/loop`, `/schedule`, or any cron or wakeup
- claim an issue, file an issue, apply a label, or comment on GitHub
- create branches, commits, or PRs, or run `/submit-pr`
- rebase or force-push a `BEHIND` PR, or fix failing CI
- commit, stash, or discard uncommitted changes in its worktree
- run its idle mode (bug hunt, UX audit, architecture gap analysis, PM triage)

It reports what it sees and waits. To start work, switch to that role's window and say
what you want:

```
Fix issue #2181 — the static-source tests use fragile fixed look-back windows.
```

From there the role follows the normal rules in `CLAUDE.md`: claim the issue, write a
failing regression test first, fix, run the full suite, then `/submit-pr`.

!!! note "Two independent switches"
    Manual mode is enforced in two places, and either one alone stops the machine.
    `scripts/start-roles.sh` decides whether a `/loop` cron is ever created; the
    **Autonomous mode switch** at the top of `CLAUDE.md` governs how a role behaves once
    running. Resuming autonomy needs both: flip the switch to `RUNNING` *and* relaunch
    with `--auto`. Passing `--auto` while the switch still reads `PAUSED` prints a
    warning, because the prompt and the rules would contradict each other.

---

## Autonomous mode

```bash
bash scripts/start-roles.sh --auto
```

Each role schedules a `/loop` cron and works the backlog continuously: check my open PRs
→ pick the highest-priority unclaimed issue matching my role label → claim → test → fix →
`/submit-pr` → repeat. Cadences are PM 3 min, Dev 5 min, UI/UX 5 min, Architect 10 min,
tunable via the `*_POLL_MINUTES` variables near the top of the script.

Use this when you want throughput and are happy to review merged PRs after the fact.
Use manual mode when you are changing the workflow itself, debugging the roles, or want
to direct the work yourself.

---

## The development loop

Whether you drive a role manually or let it cycle, the same rules apply. Full detail
lives in [PR workflow](pr-workflow.md) and [Testing](testing.md).

1. **Pick an issue.** Filter by your role label and take the highest priority
   (`P0` → `P1` → `P2` → `P3`).

    ```bash
    gh issue list --label bug --state open --search "-label:in-progress"
    ```

2. **Claim it** so no other session duplicates the work.

    ```bash
    gh issue edit <N> --add-label "in-progress"
    gh issue comment <N> --body "**Dev**: Claimed — starting work now."
    ```

3. **Branch off `origin/main`** in your role's worktree. Never branch from another open
   PR's branch — squash-merge will bundle the two and corrupt the history.

    ```bash
    git -C ~/Projects/AI/book-reader-ai-dev fetch origin main
    git -C ~/Projects/AI/book-reader-ai-dev checkout -b fix/short-description origin/main
    ```

4. **Write the failing test first.** It proves the bug is real and that your fix works.
   A change without a test does not ship.

5. **Fix it** with the minimal change. No unrelated cleanup in the same PR.

6. **Run the full suite** before committing.

    ```bash
    npm --prefix frontend test -- --no-coverage --ci
    backend/venv/bin/pytest --tb=short -q     # run from backend/ so pytest.ini is found
    ```

7. **Submit with `/submit-pr`.** The skill rebases, tests, pushes, creates the PR with
   `Closes #N`, enables auto-merge, and watches until merged. Do not run `gh pr create`
   or `gh pr merge` by hand.

8. **After merge**, drop the claim: `gh issue edit <N> --remove-label "in-progress"`.

A PR is not done until it is **MERGED** — not when it is open, not when CI is green.

---

## Cleaning up worktrees

Worktrees accumulate when sessions create one per issue. Before deleting any, check for
work that exists nowhere else:

```bash
# Uncommitted tracked changes?
git -C <worktree> status --porcelain --untracked-files=no

# Is the branch on the remote? (--verify matters: without it, rev-parse
# echoes the ref name on failure and a missing branch reads as present)
git -C <worktree> rev-parse --verify origin/<branch>

# Any commits not on origin/main?
git -C <worktree> log origin/main..HEAD --oneline
```

A branch that exists on the remote at the same SHA loses nothing when its directory is
removed — the commits live on GitHub. Once verified:

```bash
git -C ~/Projects/AI/book-reader-ai worktree remove <path>
git -C ~/Projects/AI/book-reader-ai worktree prune      # clear stale entries
```

`worktree remove` deletes the directory but keeps the branch ref, so the work stays
recoverable. Add `--force` only for a worktree whose remaining changes you have
confirmed are disposable.

---

## Troubleshooting

**Roles started cycling when I wanted them to wait.** You passed `--auto`, or you are
running an older copy of the script. Confirm the `Mode:` line at startup.

**Nested worktrees appeared (`book-reader-ai-dev-dev`).** An older script version derived
the repo from its own folder without resolving worktrees. Remove the nested directories
and re-run the current script, or pass `--repo ~/Projects/AI/book-reader-ai` explicitly.

**A role edits the wrong files.** Each role has a file scope: PM writes only `product/`,
`docs/`, `CLAUDE.md`; Dev and UI/UX write source; Architect owns `docs/design/`. See
[Roles](roles.md).

**A role won't stop asking for the next task.** That is autonomous mode. Stop the session
with `bash scripts/start-roles.sh stop` and relaunch without `--auto`.

---

## See also

- [Roles](roles.md) — what each role owns
- [Path A vs B](paths.md) — when a feature needs a design doc first
- [PR workflow](pr-workflow.md) — branching, review gates, merge rules
- [Testing](testing.md) — what to test and how to run the suites
- [`CLAUDE.md`](https://github.com/alfmunny/book-reader-ai/blob/main/CLAUDE.md) — the
  source of truth; this page is a summary
