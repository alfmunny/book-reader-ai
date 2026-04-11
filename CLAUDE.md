# Book Reader AI — Claude Code Rules

## Testing policy

**Every feature and bug fix must include tests.**

- New behaviour → write a test that would have failed before the change
- Bug fix → write a test that reproduces the bug, then fix it
- Never mark a task done until the relevant tests pass
- After completing a feature or bug fix, run the **full** test suite and confirm it passes before committing:
  ```
  cd frontend && npm test -- --no-coverage --ci
  cd backend && pytest --tb=short -q
  ```

### Frontend (Jest + React Testing Library)
- Test files live in `frontend/src/__tests__/`
- Run with: `cd frontend && npm test -- --no-coverage`
- Mock external API calls (`@/lib/api`) with `jest.mock`
- Mock ESM-only packages (e.g. `react-markdown`) in `frontend/src/__mocks__/`
- Use `@testing-library/user-event` for user interactions, not `fireEvent` for complex flows
- Use `flushPromises = () => new Promise(r => setTimeout(r, 0))` to drain async chains

### Backend (pytest)
- Test files live in `backend/tests/`
- Run with: `cd backend && pytest`
- Use `pytest-asyncio` for async route/service tests
- Mock external HTTP calls (Anthropic, Gemini, Google) — never hit real APIs in tests

### E2E (Playwright)
- Test files live in `frontend/e2e/`
- Run with: `cd frontend && npm run test:e2e` (or `:ui` for interactive mode)
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

1. Create a feature branch: `git checkout -b feat/description` (or `fix/`, `chore/`)
2. Make commits on the branch
3. Run the full test suite before pushing
4. Push the branch and open a PR: `gh pr create`
5. CI must pass before merging

Branch naming convention:
- `feat/` — new feature
- `fix/` — bug fix
- `chore/` — tooling, CI, deps
- `test/` — tests only

## Code style

- No speculative abstractions — only add complexity the task actually requires
- No docstrings or comments on unchanged code
- No error handling for scenarios that cannot happen
