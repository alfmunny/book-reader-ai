# Multi-role workflow

Book Reader AI is built by four roles collaborating across independent Claude Code sessions. This page is a living summary; the source of truth is [`CLAUDE.md`](https://github.com/alfmunny/book-reader-ai/blob/main/CLAUDE.md) in the repo root.

## The roles

| Role | Label scope | Primary output |
|---|---|---|
| **PM** (Product Manager) | Triage, review, labels | `product/`, `docs/`, `CLAUDE.md` — never source code |
| **Dev** | `bug`, `feat` | Bug fixes, small features |
| **UI/UX Dev** | `ux`, `ui` | Frontend interaction + visual fixes |
| **Architect** | `architecture` | Design docs, schema changes, complex features |

Every GitHub issue carries a role label (`bug` / `feat` / `ux` / `ui` / `architecture`). PM triages unlabeled issues.

## Worktree isolation

Code-editing sessions (Dev, UI/UX, Architect) **must** run in a dedicated git worktree under `/Users/<you>/Projects/AI/book-reader-ai-<role>/`. PM may use the main checkout but only writes to `product/` + `docs/`.

Check at session start:

```bash
git -C /Users/alfmunny/Projects/AI/book-reader-ai worktree list
```

Each session claims an issue with the `in-progress` label + a comment, then works in its worktree until merge.

## Issue claiming

```bash
gh issue edit <N> --add-label "in-progress"
gh issue comment <N> --body "Claimed by [Role] — starting work now."
```

Skip an issue already labelled `in-progress`. After the fixing PR merges:

```bash
gh issue edit <N> --remove-label "in-progress"
```

## Per-cycle priority (all code roles)

1. Check own open PRs: rebase `BEHIND`, fix failing CI, remove `in-progress` labels on merged PRs.
2. **3-PR cap**: if you already have 3 open PRs authored by you, don't submit a new PR this cycle. Work locally, wait for one to merge.
3. Otherwise: pick the highest-priority unclaimed issue matching your role label.
4. If no unclaimed issues: enter role-specific idle mode (bug hunt / UX audit / architecture gap analysis).

## Priority tiers

| Tier | When |
|---|---|
| **P0** | Security vulnerabilities, data loss, production outages |
| **P1** | Bugs affecting core flows, regressions, broken features |
| **P2** | UX issues, enhancements that unblock users |
| **P3** | Nice-to-haves, minor polish, refactors |

---

For the full ruleset, including role-specific responsibilities and invariants, read [`CLAUDE.md`](https://github.com/alfmunny/book-reader-ai/blob/main/CLAUDE.md).
