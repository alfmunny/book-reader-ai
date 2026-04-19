# Book Reader AI — Claude Code Rules

## Session startup

At the start of every session, read all files listed in
`/Users/alfmunny/.claude/projects/-Users-alfmunny-Projects-AI/memory/MEMORY.md`
before doing any work.

## Testing policy

**Every feature and bug fix must include tests.**

- New behaviour → write a test that would have failed before the change
- Bug fix → write a test that reproduces the bug, then fix it
- Never mark a task done until the relevant tests pass
- After completing a feature or bug fix, run the **full** test suite and confirm it passes before committing:
  ```
  npm --prefix frontend test -- --no-coverage --ci
  /Users/alfmunny/Projects/AI/book-reader-ai/backend/venv/bin/pytest --tb=short -q
  ```

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

Branch naming: `feat/`, `fix/`, `chore/`, `test/`

**Exact sequence every time:**
1. `git -C <repo> fetch origin main && git -C <repo> rebase origin/main`
2. `git -C <repo> checkout -b feat/description`
3. Make commits; run full test suite before pushing
4. Before push: verify the branch's PR is still OPEN — `gh pr list --head <branch> --json state`
5. `git -C <repo> push -u origin <branch>`
6. Write PR body to `/tmp/pr-body.md`, then `gh pr create --body-file /tmp/pr-body.md`
7. `gh pr merge <N> --auto --squash`
8. Launch background watcher: poll `gh pr view <N> --json state` every 20s until MERGED; report result

**Never use `cd && git`** — use `git -C <path>` instead (bare-repo security check cannot be bypassed).
**Never use `git` binaries directly** — always `git -C /Users/alfmunny/Projects/AI/book-reader-ai`.

## Code style

- No speculative abstractions — only add complexity the task actually requires
- No docstrings or comments on unchanged code
- No error handling for scenarios that cannot happen
