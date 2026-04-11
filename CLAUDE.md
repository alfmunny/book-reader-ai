# Book Reader AI — Claude Code Rules

## Testing policy

**Every feature and bug fix must include tests.**

- New behaviour → write a test that would have failed before the change
- Bug fix → write a test that reproduces the bug, then fix it
- Never mark a task done until the relevant tests pass

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

### What to test
- Happy path: the feature works as intended
- Edge cases that caused or could cause bugs (empty input, missing data, race conditions)
- Error paths: API failures, invalid input

### What NOT to test
- Implementation details (private functions, internal state)
- Third-party library behaviour
- Things already covered by existing tests

## Code style

- No speculative abstractions — only add complexity the task actually requires
- No docstrings or comments on unchanged code
- No error handling for scenarios that cannot happen
