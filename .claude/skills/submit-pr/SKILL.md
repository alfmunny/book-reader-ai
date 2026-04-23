---
name: submit-pr
description: Full PR submission workflow for book-reader-ai — rebase, commit staged changes, push, create PR with auto-merge, watch until merged. Use when the user says "submit", "open a PR", "push this", or "ship it".
---

Follow this exact sequence. Never skip steps.

## 1. Verify branch state
```
git -C /Users/alfmunny/Projects/AI/book-reader-ai status
git -C /Users/alfmunny/Projects/AI/book-reader-ai log --oneline -3
```
Confirm the branch is NOT `main` and there are staged/committed changes to push.

## 2. Check if a PR already exists for this branch
```
gh pr list --head $(git -C /Users/alfmunny/Projects/AI/book-reader-ai branch --show-current) --json number,state -q '.[0]'
```
- If state is `MERGED` or `CLOSED`: stop, tell the user, create a new branch instead.
- If state is `OPEN`: skip PR creation, go to step 7 (auto-merge).

## 3. Check in-flight PR cap (3 per session)
```
gh pr list --author @me --state open --json number -q '. | length'
```
If the count is ≥ 3, stop. Tell the user: "3 or more of your PRs are already open; per CLAUDE.md the per-session cap blocks new submits until one merges." Do not push, do not create.

## 4. Rebase onto latest main
```
git -C /Users/alfmunny/Projects/AI/book-reader-ai fetch origin main
git -C /Users/alfmunny/Projects/AI/book-reader-ai rebase origin/main
```

## 5. Run full test suite — must pass before pushing
```
npm --prefix /Users/alfmunny/Projects/AI/book-reader-ai/frontend test -- --no-coverage --ci
/Users/alfmunny/Projects/AI/book-reader-ai/backend/venv/bin/pytest --tb=short -q --no-cov
```
If tests fail: stop, fix, re-run.

## 6. Push
```
git -C /Users/alfmunny/Projects/AI/book-reader-ai push -u origin <branch>
```
Use `--force-with-lease` if already pushed and rebased.

## 7. Create PR (write body to file first)
Write a concise PR body to `/tmp/pr-body.md` covering: what changed, why, test plan.
```
gh pr create --title "<title>" --body-file /tmp/pr-body.md --base main
```

## 8. Enable auto-merge
```
gh pr merge <N> --auto --squash
```

## 9. Watch CI checks + merge state + review status (background)
Launch in background with `run_in_background: true`. This loop catches CI failures, BEHIND branches, and review requests — not just merge events:
```bash
while true; do
  STATE=$(gh pr view <N> --json state -q '.state')
  MERGE=$(gh pr view <N> --json mergeStateStatus -q '.mergeStateStatus')
  [ "$STATE" = "MERGED" ] && echo "PR #<N> merged" && break
  [ "$STATE" = "CLOSED" ] && echo "PR #<N> closed without merge" && break

  # Stop watching when PM/user requests changes — author needs to take over.
  NEEDS_REV=$(gh pr view <N> --json labels -q '.labels[].name' | grep -c '^needs-revision$')
  if [ "$NEEDS_REV" -gt 0 ]; then
    echo "PR #<N>: needs-revision label applied — author must address review comments"
    gh pr view <N> --comments | tail -40
    break
  fi

  # Rebase when BEHIND so auto-merge can proceed.
  if [ "$MERGE" = "BEHIND" ]; then
    echo "PR #<N>: BEHIND — rebasing"
    git -C /Users/alfmunny/Projects/AI/book-reader-ai fetch origin main --quiet
    git -C /Users/alfmunny/Projects/AI/book-reader-ai rebase origin/main
    git -C /Users/alfmunny/Projects/AI/book-reader-ai push --force-with-lease
  fi

  FAILED=$(gh pr checks <N> --json name,conclusion 2>/dev/null \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(sum(1 for c in d if c['conclusion'] in ('FAILURE','ERROR','CANCELLED')))" 2>/dev/null)
  if [ "$FAILED" != "" ] && [ "$FAILED" -gt 0 ]; then
    echo "PR #<N>: $FAILED CI check(s) failed — investigate before merge"
    gh pr checks <N>
    break
  fi

  sleep 30
done
```

The background watcher exits cleanly on: MERGED, CLOSED, `needs-revision` label applied, or a CI failure. The session receives a task-notification in each case and must act on it:
- MERGED → continue (PR done).
- CLOSED → report to user, investigate why.
- `needs-revision` → read the review comments, revise on the branch, remove the label, re-run `/submit-pr` to restart the watcher.
- CI failure → investigate the failing check, fix, push, re-run `/submit-pr`.

Report the result to the user when the background task completes.
