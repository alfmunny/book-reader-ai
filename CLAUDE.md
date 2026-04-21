# Book Reader AI — Claude Code Rules

## Session startup

At the start of every session, read all files listed in
`/Users/alfmunny/.claude/projects/-Users-alfmunny-Projects-AI/memory/MEMORY.md`
before doing any work.

## Testing policy

**Every feature and bug fix must include tests. Always aim to increase or maintain test coverage.**

- New behaviour → write a test that would have failed before the change
- Bug fix → write a test that reproduces the bug, then fix it
- Never mark a task done until the relevant tests pass
- After completing a feature or bug fix, run the **full** test suite and confirm it passes before committing:
  ```
  npm --prefix frontend test -- --no-coverage --ci
  /Users/alfmunny/Projects/AI/book-reader-ai/backend/venv/bin/pytest --tb=short -q
  ```

**Coverage rule:** Every new function, route, or component must have at least one automated test (unit or integration). Do not rely on manual test steps in commit messages — if the test does not exist in code, it does not count. If adding tests would require more than trivial effort, write them anyway; coverage is non-negotiable. Run the backend suite from the `backend/` directory so `pytest.ini` is found and all 517+ tests run (not just 121 sync tests).

### Frontend (Jest + React Testing Library)
- Test files live in `frontend/src/__tests__/`
- Run with: `npm --prefix frontend test -- --no-coverage`
- Mock external API calls (`@/lib/api`) with `jest.mock`
- Mock ESM-only packages (e.g. `react-markdown`) in `frontend/src/__mocks__/`
- Use `@testing-library/user-event` for user interactions, not `fireEvent` for complex flows
- Use `flushPromises = () => new Promise(r => setTimeout(r, 0))` to drain async chains

### Backend (pytest)
- Test files live in `backend/tests/`
- Run with: `/Users/alfmunny/Projects/AI/book-reader-ai/backend/venv/bin/pytest`
- Use `pytest-asyncio` for async route/service tests
- Mock external HTTP calls (Anthropic, Gemini, Google) — never hit real APIs in tests

### E2E (Playwright)
- Test files live in `frontend/e2e/`
- Run with: `npm --prefix frontend run test:e2e` (or `:ui` for interactive mode)
- Dev server is started automatically by Playwright with `PLAYWRIGHT_TEST=1` to bypass auth middleware
- Backend is mocked via `page.route()` — see `frontend/e2e/fixtures.ts` for shared API stubs
- Use E2E for full user flows (navigation, persistence across reloads) where unit tests fall short

### What to test
- Happy path: the feature works as intended
- Edge cases that caused or could cause bugs (empty input, missing data, race conditions)
- Error paths: API failures, invalid input

### What NOT to test
- Implementation details (private functions, internal state)
- Third-party library behaviour
- Things already covered by existing tests

## Branching and PR workflow

**Never commit directly to `main`.** All changes must go through a PR.

**Always create a PR when a feature or bug fix is complete** — do not leave changes uncommitted or unpushed. If the work spans multiple sessions, push a PR at the end of each session so progress is never lost.

Branch naming: `feat/`, `fix/`, `chore/`, `test/`

**Exact sequence every time:**
1. `git -C <repo> fetch origin main && git -C <repo> rebase origin/main`
2. `git -C <repo> checkout -b feat/description`
3. Make commits; run full test suite before pushing
4. Before push: verify the branch's PR is still OPEN — `gh pr list --head <branch> --json state`
5. `git -C <repo> push -u origin <branch>`
6. Write PR body to `/tmp/pr-body.md`, then `gh pr create --body-file /tmp/pr-body.md`
7. `gh pr merge <N> --auto --squash`
8. Launch a background watcher that polls until MERGED — use this exact loop:
   ```bash
   BRANCH=<branch-name>
   while true; do
     INFO=$(gh pr view <N> --json state,mergeStateStatus -q '"state=\(.state) merge=\(.mergeStateStatus)"')
     echo "$INFO"
     echo "$INFO" | grep -q "state=MERGED" && echo "PR #<N> merged" && break
     echo "$INFO" | grep -q "state=CLOSED" && echo "PR #<N> closed" && break
     if echo "$INFO" | grep -q "merge=BEHIND"; then
       git -C /Users/alfmunny/Projects/AI/book-reader-ai fetch origin main
       git -C /Users/alfmunny/Projects/AI/book-reader-ai rebase origin/main
       git -C /Users/alfmunny/Projects/AI/book-reader-ai push origin "$BRANCH" --force-with-lease
     fi
     FAILED=$(gh pr checks <N> --json name,conclusion 2>/dev/null \
       | python3 -c "import json,sys; d=json.load(sys.stdin); print(sum(1 for c in d if c['conclusion'] in ('FAILURE','ERROR','CANCELLED')))" 2>/dev/null)
     [ "$FAILED" != "" ] && [ "$FAILED" -gt 0 ] && echo "$FAILED check(s) failed" && gh pr checks <N> && break
     sleep 20
   done
   ```
   **Why the BEHIND check matters:** multiple PRs can merge concurrently. A branch that was up-to-date at push time can go BEHIND seconds later when another PR lands. The loop must rebase and force-push whenever it sees `mergeStateStatus=BEHIND`, not just once before the initial push.

**A PR is NOT done until it is MERGED.** Never report a PR as done while it is still OPEN, BEHIND, or BLOCKED.

**Never use `cd && git`** — use `git -C <path>` instead (bare-repo security check cannot be bypassed).
**Never use `git` binaries directly** — always `git -C /Users/alfmunny/Projects/AI/book-reader-ai`.

## Code style

- No speculative abstractions — only add complexity the task actually requires
- No docstrings or comments on unchanged code
- No error handling for scenarios that cannot happen
