# PR workflow

Never commit directly to `main`. All changes go through a PR. Push a PR at the end of each session so in-flight work is never lost.

## Branch naming

| Prefix | When |
|---|---|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `chore/` | Config, tooling, non-code hygiene |
| `test/` | Test-only additions |
| `design/` | Design doc PRs (Path B) |

## The `/submit-pr` skill

All PRs submit via the `/submit-pr` skill, not by running `gh pr create` + `gh pr merge` directly. The skill rebases onto main, runs tests, pushes, creates the PR with `Closes #N`, enables auto-merge (squash), and launches a background watcher that catches `BEHIND` / check failures until the PR reaches `MERGED`.

## Label taxonomy

Applied at PR creation time via `gh api .../issues/<N>/labels` (the REST API — `gh pr edit --add-label` has a known GraphQL deprecation error).

| Label | Meaning |
|---|---|
| `bug` / `feat` / `ux` / `ui` / `architecture` | Role routing (match the owning role) |
| `documentation` | Docs-only PR |
| `enhancement` | Adds a new feature or capability |
| `in-progress` | Issue is currently claimed |
| `blocked` | PM has flagged a concern; CI will skip auto-merge |
| `pm-approved` | PM has signed off on a design doc |
| `user-approved` | User has signed off for high-impact architecture changes |
| `needs-user-approval` | Architect has asked for user approval; not yet applied |
| `P0` / `P1` / `P2` / `P3` | Priority tier |

## 3-PR session cap

If you already have 3 open PRs authored by you (as that role), **don't submit a new PR** this cycle. Claim and work locally instead; submit once one of your existing PRs merges.

Prevents backlog rot and CI-queue jam (observed on 2026-04-23).

## Auto-merge rules

- Every non-design PR enables auto-merge (squash) at creation time.
- **Design-doc PRs do not** enable auto-merge — they wait for `pm-approved` then `user-approved`.
- PRs tagged `blocked` have auto-merge disabled by the `auto-merge.yml` workflow.

## Watcher behaviour

Every background watcher polls the PR state until `MERGED` or `CLOSED`:

- On `BEHIND` → `git fetch origin main && git rebase origin/main && git push --force-with-lease`.
- On `FAILURE` / `ERROR` / `CANCELLED` check conclusion → report the failing check and stop (investigate before merging).
- Otherwise → sleep and loop.

## "A PR is NOT done until it is MERGED"

Never report a PR as done while it is still `OPEN`, `BEHIND`, or `BLOCKED`. The watcher's exit message is the authoritative signal.

## Exact command cheat sheet

```bash
# Rebase + push (what /submit-pr does under the hood)
git -C <worktree> fetch origin main
git -C <worktree> rebase origin/main
git -C <worktree> push -u origin <branch>

# Create PR with label applied
gh pr create --title "feat: ..." --body-file /tmp/pr-body.md
gh api repos/alfmunny/book-reader-ai/issues/<N>/labels -X POST \
    -f 'labels[]=enhancement' -f 'labels[]=architecture'

# Enable auto-merge
gh pr merge <N> --auto --squash

# On `BEHIND`
git -C <worktree> fetch origin main
git -C <worktree> rebase origin/main
git -C <worktree> push origin <branch> --force-with-lease
```

Never use `cd && git` — use `git -C <path>` instead. Bare-repo security checks can't be bypassed via `cd`.
