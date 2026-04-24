# Testing policy

**Every feature and bug fix must include tests. Always aim to increase or maintain test coverage.**

- New behaviour → write a test that would have failed before the change.
- Bug fix → write a test that reproduces the bug, then fix it.
- Never mark a task done until the relevant tests pass.
- After completing a feature or bug fix, run the **full** test suite and confirm it passes before committing.

## Running the suites

**Frontend (Jest + React Testing Library)**

```bash
npm --prefix frontend test -- --no-coverage --ci
```

**Backend (pytest)**

```bash
cd backend
/path/to/venv/bin/pytest --tb=short -q
```

Run backend tests from the `backend/` directory so `pytest.ini` is picked up and all 1400+ tests run (not just the 121-test sync subset).

**End-to-end (Playwright)**

```bash
npm --prefix frontend run test:e2e        # headless
npm --prefix frontend run test:e2e:ui     # interactive
```

Dev server is started automatically by Playwright with `PLAYWRIGHT_TEST=1` so auth middleware is bypassed. Backend is mocked via `page.route()` (see `frontend/e2e/fixtures.ts`).

## Coverage rule

Every new function, route, or component must have **at least one** automated test — unit or integration. Manual test steps in commit messages do not count. If adding tests would require more than trivial effort, write them anyway.

## What to test

- Happy path — the feature works as intended.
- Edge cases that caused or could cause bugs (empty input, missing data, race conditions).
- Error paths — API failures, invalid input.

## What not to test

- Implementation details (private functions, internal state).
- Third-party library behaviour.
- Things already covered by existing tests.

## Conventions

**Frontend**

- Test files live in `frontend/src/__tests__/`.
- Mock external API calls (`@/lib/api`) with `jest.mock`.
- Mock ESM-only packages (e.g. `react-markdown`) in `frontend/src/__mocks__/`.
- Use `@testing-library/user-event` for user interactions, not `fireEvent` for complex flows.
- Use `flushPromises = () => new Promise(r => setTimeout(r, 0))` to drain async chains.

**Backend**

- Test files live in `backend/tests/`.
- Use `pytest-asyncio` for async route/service tests.
- Mock external HTTP calls (Anthropic, Gemini, Google) — never hit real APIs in tests.

**E2E**

- Test files live in `frontend/e2e/`.
- Use E2E for full user flows (navigation, persistence across reloads) where unit tests fall short.
