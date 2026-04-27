# Multi-Provider AI — User-Configurable Priority + Per-Provider Enable/Disable

**Status:** Draft
**Author:** Architect
**Date:** 2026-04-28
**Priority:** P1
**Prior work:** #1759 (issue), `services/gemini.py` + `services/claude.py` + `services/translate.py` (existing single-provider call sites), `users.gemini_key` (migration 001 — the existing single-provider key column), `docs/design/pricing-plans.md` (PR #1779 — interlocks at the BYOK boundary, see §"Interlock with pricing plans" below)

## Problem

Every LLM call in the codebase is hard-coded to Gemini today. `services/gemini.py` is the catch-all — translation, summaries, chapter insights, vocabulary lookups, reference resolution all funnel through one provider, one set of rate limits, one billing surface, one model family. `services/claude.py` is partially wired but not user-selectable. `services/translate.py` falls back to Google Translate (free) when Gemini fails — useful but dramatically lower quality for literary text, which is most of what this app does.

Three concrete costs:

1. **No price diversity.** Users who already pay Anthropic, OpenAI, DeepSeek, or MiniMax can't bring those keys. They have to either set up a Gemini account they don't otherwise use, or fall to Google Translate quality.
2. **No failover beyond Google Translate.** Gemini hits its free-tier quota → the only fallback is a different model family of dramatically lower quality. Should be one of the user's other configured providers.
3. **No protocol for adding a provider.** Every new model family requires touching the same 5+ call sites, with no shared interface to validate against. The next time someone wants to plug in a budget provider, it's a fresh refactor.

## Why Path B

- New schema: `user_provider_keys` table, plus a backfill from `users.gemini_key`.
- Cross-cutting refactor: every existing Gemini call site (`generate_translation`, `generate_summary`, `generate_insight`, `generate_vocabulary_definition`, `generate_references`, plus the queue worker) routes through a new abstraction.
- New external services: Anthropic, OpenAI, DeepSeek, MiniMax — each with adapter, error mapping, and key-validation logic.
- Interlocks with pricing-plans BYOK (PR F of #1790) — the two designs touch the same column / table; whichever ships first determines where BYOK reads from.

## Scope (per issue #1759)

In scope at v1:

- **Five providers** at v1: Anthropic Claude, OpenAI, DeepSeek, MiniMax, Gemini. Provider-agnostic interface so adding a sixth is just a new adapter file.
- **Per-user API key storage** for each enabled provider. Encrypted at rest using the existing Fernet pattern from `services/auth.py`.
- **Per-user priority list** — ordered list of provider IDs.
- **Per-provider enable toggle** — key configured but disabled = doesn't try, doesn't fall through.
- **Failover** at the service layer: provider raises (rate limit, network, 5xx, malformed) → next enabled provider in priority. Returns provider ID + model used so cost tracking works.
- **Cost tracking per provider** — extend the existing `gemini_cost` denormalisation to a per-provider scheme.
- **API key validation** when adding a key — ping a cheap endpoint, fail-fast with a clear error.

Out of scope at v1 (file follow-ups when there's demand):

- **Per-feature provider override** ("use Claude for summaries, DeepSeek for translation"). One global priority list in v1.
- **Routing rules** (cheapest provider supporting language X, etc.).
- **Bring-your-own-LLM URL** (custom OpenAI-compatible endpoint) — adds attack surface; skip until requested.
- **TTS provider abstraction** — separate concern; Google TTS is deeply baked.
- **OAuth / auto-discovery** for provider keys.

## Proposed solution

### 1. Provider protocol

A small Protocol class in `backend/services/ai/provider.py`:

```python
from typing import Protocol, runtime_checkable

@runtime_checkable
class AIProvider(Protocol):
    """One provider = one bound API key. Implementations are stateless
    aside from the key; the routing layer instantiates one per (user,
    provider) pair on demand and caches it for a request."""

    provider_id: str  # 'anthropic' | 'openai' | 'deepseek' | 'minimax' | 'gemini'

    async def generate_translation(
        self, text: str, source: str, target: str, *, paragraph_aware: bool = True,
    ) -> "ProviderResult[str]": ...

    async def generate_summary(self, text: str, *, language: str) -> "ProviderResult[str]": ...

    async def generate_insight(
        self, prompt: str, *, history: list[ChatTurn] | None = None,
    ) -> "ProviderResult[str]": ...

    async def generate_vocabulary_definition(
        self, word: str, *, context: str, target_language: str,
    ) -> "ProviderResult[VocabDefinition]": ...

    async def generate_references(self, prompt: str, *, max_chunks: int) -> "ProviderResult[list[Reference]]": ...

    async def validate_key(self) -> "ValidationResult": ...
```

`ProviderResult[T]` carries the answer + the model name actually used + token counts (for cost):

```python
@dataclass
class ProviderResult(Generic[T]):
    value: T
    provider_id: str
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float | None  # None when provider doesn't expose pricing yet
```

Adapters that don't support a method **raise `ProviderUnsupported`**; the routing layer treats this as a fall-through (skip, try next), distinct from a runtime failure (also fall-through but logged as an error). This lets a provider that's only good at translation opt out of insights cleanly.

Adapter files: `backend/services/ai/adapters/{anthropic,openai,deepseek,minimax,gemini}.py`. Each one exports a class implementing `AIProvider`.

### 2. Routing layer

`backend/services/ai/router.py`:

```python
async def with_failover(
    user_id: int, method: str, *args, **kwargs,
) -> ProviderResult:
    """Walk the user's enabled providers in priority order; call `method`
    on each; fall through on ProviderUnsupported / RateLimitError /
    ProviderNetworkError / Provider5xxError / MalformedResponseError;
    raise on caller-bug exceptions (ValidationError, KeyError, ...).

    Returns the first successful ProviderResult, or raises NoProviderAvailable
    if every provider in the list raised a fall-through error.
    """
```

Every existing Gemini call site changes from `await gemini.generate_translation(...)` to `await router.with_failover(user_id, "generate_translation", ...)`. The router fetches the user's priority list, instantiates each provider with the right key, and calls the method.

The instantiation cache is keyed `(user_id, provider_id, request_id)` so a single request that needs to retry doesn't hammer the provider's auth flow. Cleared on response complete.

### 3. Schema — `user_provider_keys`

Migration `040_user_provider_keys.sql`:

```sql
CREATE TABLE IF NOT EXISTS user_provider_keys (
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id    TEXT    NOT NULL CHECK (provider_id IN
                       ('anthropic', 'openai', 'deepseek', 'minimax', 'gemini')),
    api_key        TEXT    NOT NULL,  -- Fernet-encrypted at rest
    enabled        INTEGER NOT NULL DEFAULT 1,
    priority       INTEGER NOT NULL,  -- 0 = highest, no uniqueness on priority
    configured_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_validated TIMESTAMP,
    last_error     TEXT,  -- last failure message, NULL if last call succeeded
    PRIMARY KEY (user_id, provider_id)
);

CREATE INDEX IF NOT EXISTS user_provider_keys_priority
    ON user_provider_keys (user_id, enabled, priority);
```

- Primary key `(user_id, provider_id)`: a user has at most one row per provider.
- `priority` is an integer. Ties are broken by `provider_id` alphabetical order (deterministic). The frontend reorders by drag-and-drop and writes the new priorities atomically.
- `enabled = 0` means "key is configured but skip this provider on calls". The user can keep their key around without using it — useful for testing / emergency failover.
- `last_validated` + `last_error`: filled after each call. The UI shows a green/red dot per provider plus the last error.

### 4. Migration from `users.gemini_key`

Migration `041_backfill_gemini_provider_keys.sql`:

```sql
INSERT INTO user_provider_keys (user_id, provider_id, api_key, enabled, priority, configured_at)
SELECT id, 'gemini', gemini_key, 1, 0, datetime('now')
  FROM users
 WHERE gemini_key IS NOT NULL AND gemini_key != ''
   AND id NOT IN (SELECT user_id FROM user_provider_keys WHERE provider_id = 'gemini');
```

Existing single-provider users are stamped at priority 0 with Gemini enabled. Behaviour is unchanged for them. The legacy `users.gemini_key` column **stays for one release** as a read-only fallback so the queue worker can keep functioning while the routing layer rolls out. Removed in a follow-up migration once every code path reads from `user_provider_keys`.

### 5. Queue-worker integration

The translation queue (`services/translation_queue.py`) currently reads `users.gemini_key` directly. After this design, the queue worker calls `router.with_failover(user_id, "generate_translation", ...)` and the router walks the priority list internally.

Failover at the **service** layer rather than queue layer:

- Queue stays simple: enqueue once, callable returns success or terminal failure.
- Within a single queue iteration, the router walks priorities and tries each.
- On terminal failure (every provider in the list raised), queue increments `attempts`, schedules retry per existing backoff. Retry walks the same priority list — if all five providers are 429ing, the queue gives up after the configured retry count (existing behaviour).

### 6. Cost tracking

Today: `translations.gemini_cost FLOAT` (denormalised on the row).

After this design: rename to `translations.cost_usd FLOAT` (provider-agnostic) + add `translations.provider_id TEXT` + `translations.model TEXT`. Migration `042_translations_provider_columns.sql`:

```sql
ALTER TABLE translations ADD COLUMN provider_id TEXT;
ALTER TABLE translations ADD COLUMN model TEXT;
ALTER TABLE translations ADD COLUMN cost_usd REAL;

-- Backfill existing Gemini-translated rows:
UPDATE translations
   SET provider_id = 'gemini',
       cost_usd = gemini_cost
 WHERE gemini_cost IS NOT NULL;
```

Keep `gemini_cost` for one release as a read-only fallback (admin reports). Remove in a follow-up.

Aggregating per-provider spend for admin UI is `SELECT provider_id, SUM(cost_usd) FROM translations GROUP BY provider_id`. Same query against the existing `audio_cache.cost_usd` if/when we extend.

### 7. Default model per provider per task

Sane defaults for v1; per-feature model selection is out-of-scope. Each adapter's class defines:

```python
DEFAULT_MODELS: dict[str, str] = {
    "translation": "claude-sonnet-4-6",   # or per-provider equivalent
    "summary":     "claude-haiku-4-5",
    "insight":     "claude-sonnet-4-6",
    "vocabulary":  "claude-haiku-4-5",
    "references":  "claude-sonnet-4-6",
}
```

The matrix lives in code, not config — overriding is a code change. Rationale: the matrix changes when we want to *recalibrate* speed/cost/quality, and the right default per task differs per provider (DeepSeek's "translation" model is different from Claude's). Centralising in code keeps the per-provider tradeoffs visible together.

### 8. API key validation

Each adapter implements `validate_key()` that hits a cheap, real endpoint (typically a single-token completion or an account-info call). Returns `ValidationResult(ok: bool, error: str | None, model_count: int)`.

UI flow: user enters key → "Test" button → hits `POST /user/providers/{provider_id}/validate` → returns the result → on success, key is saved + enabled by default.

Rate limit on validate endpoint: 1 call per (user, provider) per 10 seconds (prevents brute-force testing if the key field also accepts garbage).

### 9. Frontend — Settings

New section in profile/settings: **"AI Providers"**. Card per provider with:

- Provider name + logo
- API key input (masked) + "Test" + "Save" buttons
- Enable/disable toggle
- Drag-handle for priority reorder
- Status row: "Last verified ✓ 2m ago" / "Last error: invalid_api_key (5m ago)"
- "Remove" button (deletes the row)

The list is rendered in priority order. Drag-to-reorder writes the new priority via `PUT /user/providers/order`. All other writes go through `POST /user/providers/{provider_id}` (upsert).

## Interlock with pricing plans

The pricing-plans design (PR #1779, merged) introduced BYOK using today's `users.gemini_key` column as the single per-user key column. PR F of the pricing-plans series (BYOK toggle UI + bypass logic) is the call-site that reads it.

This design replaces `users.gemini_key` with `user_provider_keys`. The two designs touch the same data; the sequencing matters:

| Order | Outcome |
|---|---|
| Multi-provider ships first | Pricing PR F reads from `user_provider_keys WHERE user_id=? AND enabled=1 ORDER BY priority` and uses the first row's key. The "BYOK" concept stays one-per-user in the pricing UI but draws from the multi-provider table. |
| Pricing PR F ships first | Pricing PR F reads from `users.gemini_key` as today. Multi-provider's migration 041 backfills those into `user_provider_keys` later, transparently. The BYOK UI in pricing's `/account/billing` page will need a follow-up redesign once multi-provider's "AI Providers" section ships, since two separate UIs would compete for the same data. |

**Recommendation:** ship multi-provider first (this design's impl) — the cleaner data model wins, and pricing PR F's UI becomes simpler. If pricing PR F ships first, file a small follow-up issue to migrate its UI into multi-provider's "AI Providers" section once that lands.

This recommendation is independent of which design *merges* first; it's about implementation-PR ordering. Architect to coordinate at impl-PR-time.

## Migration & rollout

1. **Migration 040** — `user_provider_keys` table + index. New, empty.
2. **Migration 041** — backfill from `users.gemini_key`. Existing single-provider users stamped at priority 0.
3. **Migration 042** — `translations` provider columns + backfill from `gemini_cost`.
4. **Adapter files** ship one per provider. Anthropic and Gemini have full implementations (we have credentials and existing code). OpenAI / DeepSeek / MiniMax ship as adapter shells initially — each needs a small follow-up PR to wire the actual API once we have a test key.
5. **Routing layer + with_failover()** ships in the same PR as the protocol + Anthropic + Gemini adapters. Tests cover the failover semantics with a mock provider stack.
6. **Queue worker** route-through happens in a follow-up PR (separate test surface; risk-isolated). Queue keeps reading `users.gemini_key` until that PR.
7. **Cost-tracking migration** ships separately. Read-side changes to admin reports go in the same PR as migration 042.
8. **Frontend settings UI** ships last. Existing per-user gemini-key UI stays in place until "AI Providers" section is live, then deleted in the same PR.

Feature flag: `NEXT_PUBLIC_MULTI_PROVIDER_ENABLED`. Wraps the new settings section + the `router.with_failover` indirection. Off by default during rollout; flip on once every adapter is verified end-to-end against test keys.

## Test plan

| Test | Asserts |
|---|---|
| `test_provider_protocol_method_signatures` | All five adapters implement the protocol with the right return types. |
| `test_router_walks_priority_order` | With three mock providers at priorities 2, 0, 1: router calls priority-0 first, then 1, then 2. |
| `test_router_falls_through_on_rate_limit` | First provider raises `RateLimitError`; router calls the second; if second succeeds, returns its result with second's `provider_id`. |
| `test_router_falls_through_on_provider_unsupported` | First provider raises `ProviderUnsupported`; router skips silently (no error log) and tries next. |
| `test_router_does_not_fall_through_on_validation_error` | First provider raises `ValueError` (caller bug); router re-raises immediately. |
| `test_router_no_provider_available_when_all_fail` | All providers raise; router raises `NoProviderAvailable`. |
| `test_router_skips_disabled_providers` | A disabled provider isn't tried even if at priority 0. |
| `test_migration_040_user_provider_keys_table` | Table created with PK, CHECK constraint, default `enabled=1`. |
| `test_migration_041_backfills_gemini_to_user_provider_keys` | A user with `gemini_key='abc'` ends up with one row `(user_id, 'gemini', 'abc', 1, 0)`. |
| `test_migration_041_idempotent_on_replay` | Replay does not duplicate rows (the `NOT IN` guard). |
| `test_migration_042_backfills_provider_id_and_cost` | Existing translation rows with `gemini_cost` get `provider_id='gemini'` + `cost_usd=gemini_cost`. |
| `test_anthropic_adapter_translates` | Live-call test (skipped without `ANTHROPIC_API_KEY` env) verifies translation works end-to-end. |
| `test_validate_key_endpoint_rate_limit` | Second call to `/validate` within 10s → 429. |
| `test_user_providers_upsert_endpoint` | POST creates a new row; second POST with same provider_id updates. |
| `test_user_providers_order_endpoint` | PUT with `[{provider_id, priority}]` rewrites priorities atomically. |

Frontend: 5–6 tests covering the AI-Providers section render, drag-reorder, save-key flow, status indicator.

## Risks / open questions

1. **Per-provider adapter quality**. Anthropic and Gemini have battle-tested code already. OpenAI / DeepSeek / MiniMax adapters will need someone to set up test keys + verify each call site behaves. Recommend shipping the protocol + Anthropic + Gemini in v1, then OpenAI / DeepSeek / MiniMax as discrete PRs with the user supplying test keys for each.

2. **API surface compatibility.** OpenAI and DeepSeek use OpenAI's HTTP shape. MiniMax has its own. Anthropic has Messages. Gemini has its own. The adapters insulate the differences but each adapter's failure-mode mapping is bespoke (which 4xx codes to treat as auth failures vs validation errors).

3. **Cost surfacing per provider.** Each provider exposes pricing differently. Some return token counts in the response (Anthropic does), some require a separate billing API (OpenAI). For v1, fall back to `cost_usd = None` if the provider doesn't expose pricing inline. Admin spend report tolerates nulls.

4. **Rate-limit semantics.** Different providers signal rate limits in different ways (HTTP 429 with `Retry-After`, custom error codes, response body details). Adapters normalise to a common `RateLimitError` with optional `retry_after_seconds`. Router uses this to defer the failed provider for the rest of the request (don't retry priority-0 within the same call after it 429'd 2ms ago).

5. **Encrypted-at-rest scope.** The existing Fernet pattern in `services/auth.py` covers `users.gemini_key`. Reusing it for `user_provider_keys.api_key` is the obvious choice. The encryption key is derived from `JWT_SECRET` in dev; production sets `ENCRYPTION_KEY` explicitly. **Decision: same convention.**

6. **Queue-worker key choice.** Today's queue reads `users.gemini_key`. After this design, the queue-worker call-site changes from a direct Gemini call to `router.with_failover(user_id, "generate_translation", ...)`. The user's priority list is the source of truth — there's no "queue-default-provider". A user with no providers configured (legacy account that never set a key) gets the same "provide a key" 403 as today, just routed through the router which raises `NoProviderAvailable`.

7. **Free-tier behaviour.** The pricing design says free users can't create new translations. With multi-provider, a free user with a configured provider key still can't create translations (the tier gate fires before the provider router). Multi-provider's BYOK doesn't bypass the tier gate; the BYOK-bypass-of-Pro-cap (PR F of pricing) is a separate concept that operates on the cap, not on the gate.

8. **Per-user model selection vs default.** Recommended: ship sane defaults in v1, no per-user model picker. If users push back ("I want Claude Opus for translation, not Sonnet") add a per-provider model dropdown in a follow-up. This keeps v1 small.

9. **Per-feature provider override.** Out of scope per the issue. The v1 priority list is one ordered list per user. Adding `(user_id, feature, provider_id)` overrides is a future schema change — would need either a new column on `user_provider_keys` (composite key gets ugly) or a separate `user_feature_overrides` table. Defer.

10. **Provider deprecations.** When we drop a provider (e.g. Gemini after migration to four-provider world), what happens to a user with that provider in their priority list? Recommend: the adapter file stays in the repo with a deprecation notice; the router skips deprecated providers silently and the UI surfaces a one-time "this provider was removed; please pick a new priority order" banner.

11. **Cross-provider response shape consistency.** A vocabulary definition from Anthropic and one from DeepSeek may have slightly different shapes (richer / sparser). The protocol's `VocabDefinition` dataclass forces a normalised shape — adapters lossy-coerce. Acceptable; users see consistent UI.

12. **Cost cap for safety.** Bug-class concern: a runaway loop calls `with_failover` 10000 times. Per-user per-day spending cap (e.g. \$5) would be a useful belt-and-suspenders; out of scope here, file as a follow-up if there's a real incident. The pricing design's chapter cap covers most of the same surface for paid users.

## Acceptance

- Migrations 040 + 041 + 042 ship with backfill tests.
- `services/ai/provider.py` (protocol) + `services/ai/router.py` (with_failover) + Anthropic + Gemini adapters.
- 15 backend tests (router behaviour, migrations, mock-provider failover).
- Existing call sites in `services/gemini.py` (translation, summary, insight) replaced with `router.with_failover` calls.
- Queue worker switched to the router (in the SAME PR as the call-site replacements, so the queue is consistent with the rest of the codebase).
- Admin spend report renders `SUM(cost_usd) GROUP BY provider_id`.
- Frontend "AI Providers" section + drag-reorder + test-key flow.
- One representative end-to-end test against Anthropic test key + Gemini test key, verifying failover from one to the other on a deliberate rate-limit response.
- `user-only` follow-up: user provides test keys for each of the five providers + verifies the per-adapter live-call test passes.

## Path B gate

This PR will be created with `gh pr create --label needs-user-approval --label architecture --label feat --label enhancement` to seed the gate label at PR-open time, avoiding the auto-merge race noted in #1744. PM reviews for readiness and applies `pm-approved`; user is the sole approver and removes `needs-user-approval` + applies `user-approved` to release the merge. Implementation is filed as a follow-up issue (or via conversion of #1759) once this design is merged.

## Open questions for review

(Listed for the user / PM review pass — flag the ones you want settled before impl begins.)

1. Confirm the **priority + enable + per-provider-key** model (vs alternatives like "tier-and-let-server-decide" or "per-feature dropdown"). The simple priority list is the baseline.
2. Confirm the **default-model matrix** (sane defaults in code, no per-user override in v1). Alternative: ship a "default model" column on `user_provider_keys` so users can pick GPT-4 vs GPT-3.5 from day one.
3. Confirm the **pricing-plans BYOK interlock** preference. The recommendation is multi-provider ships first; pricing PR F reads from `user_provider_keys`. If you'd rather ship pricing F first, the migration story is laid out in §"Interlock with pricing plans".
4. Confirm the **provider list at v1**. Anthropic + Gemini guaranteed (we have keys + code). OpenAI / DeepSeek / MiniMax need test keys before each adapter's live-call test can pass — file each as a follow-up if you can't supply all five at v1 time.
5. Confirm the **failover scope**. Today's design falls through on rate-limit / network / 5xx / malformed. Should it also fall through on 4xx (auth invalid)? Recommendation: yes — invalid key still gets the user a result, plus the UI surfaces "key X failed validation" so they know to fix it. Alternative: surface immediately without falling through, reducing one perceived speed slowdown.
