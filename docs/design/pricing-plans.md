# Pricing Plans — Free / Pro / Premium with translation-creation gating

**Status:** Draft
**Author:** Architect
**Date:** 2026-04-27
**Priority:** P1
**Prior work:** #1774 (issue), `users.gemini_key` (migration 001 — existing per-user API key), `reading_history` (migration 019 — existing per-chapter event log we'll reuse for monthly book-quota tracking)

## Problem

The product has no monetisation surface. Translations are the most expensive thing the system does — every paragraph chunk costs LLM tokens — and right now any signed-in user can spend the project's API quota arbitrarily. We need:

1. A monetisation path for the product.
2. A spending guard — a free-tier user reading 30 books should not bankrupt us on translation costs.
3. A way for power users who want to pay (BYOK) to do so independently.
4. Preservation of the network-effect cache: an existing translation, once paid for by anyone, stays free-to-read for everyone forever.

## Requirements (from user, 2026-04-27)

1. Three tiers: **Free**, **Pro**, **Premium**.
2. **Free**: 3 books / month. Read-only access to existing translations; cannot create new translations.
3. **Pro / Premium** (paid): unlimited books, can create new translations. Choice of using **our model** (we pay the LLM bill) OR **bringing their own API key** (BYOK; they pay).
4. **Read-side stays open for everyone.** Anyone can read any translation that already lives in the shared cache.

## Why Path B

- New schema: tier column on `users`, billing-event table, optional monthly-counter table.
- Cross-cutting: every translation-creation endpoint gets a `require_paid_tier` dependency; the chapters endpoint gets the 3-books/month enforcement; the entire frontend gains a paywall surface.
- New external service: Stripe (subscription, customer portal, webhooks). Out-of-tree configuration that the user has to do in Stripe Dashboard.
- Touches money. Failure modes are user-visible (over-charging, locking out paid users) and load-bearing for the business.

## Tier definitions

The split between Free and "paid" is defined by the user. The split between Pro and Premium needs a justification — these are the proposed differentiators; any of them is debatable and flagged below as open questions.

| Capability | Free | Pro | Premium |
|---|---|---|---|
| Books readable / month | **3** | unlimited | unlimited |
| Read existing translations from cache | ✓ | ✓ | ✓ |
| Create new translations using our LLM keys | ✗ | ✓ (capped — see below) | ✓ (uncapped) |
| Bring your own LLM API key (BYOK) | ✗ | ✓ | ✓ |
| Translation queue priority | normal | normal | high |
| Vocabulary, annotations, flashcards, reading stats | ✓ | ✓ | ✓ |
| Audio (TTS) generation | existing-cache only | ✓ (capped) | ✓ (uncapped) |

**Pro-cap proposal:** N chapters/month of new translations using our LLM keys (default `N = 50`, user-configurable in code). Hits the cap → "Upgrade to Premium for unlimited" paywall, OR "Switch to BYOK" — your own key bypasses the cap because you're paying the LLM bill directly.

**Premium-uncapped proposal:** no per-month chapter cap (other than per-tier abuse limits like "no more than 1000 chapters / day enforced rate-limit"). Other extras (priority queue, longer chapter chunks for batch translation, etc.) are leverage points to differentiate the tiers.

The whole "Pro vs Premium differentiator" question is the most volatile part of this design and is flagged in §"Open questions".

## Data model

### Migration 038 — add tier columns to `users`

```sql
ALTER TABLE users ADD COLUMN tier TEXT NOT NULL DEFAULT 'free'
    CHECK (tier IN ('free', 'pro', 'premium'));
ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE users ADD COLUMN tier_period_end TIMESTAMP;
```

- `tier`: the user's current entitlement. Drives every gate. Default `'free'` — no data movement on existing rows.
- `stripe_customer_id`: created on first checkout, reused for subsequent operations (portal session, plan change).
- `stripe_subscription_id`: tracks active subscription; null for free users.
- `tier_period_end`: when the current paid period ends (Stripe sends this in the subscription payload). After this date, the webhook handler downgrades to `free` if Stripe didn't renew. Defensive: even if Stripe webhooks miss for some reason, a daily cron job (`scripts/expire_subscriptions.py`) compares `tier_period_end < now()` and downgrades.

### Migration 039 — billing-event log

```sql
CREATE TABLE IF NOT EXISTS billing_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    stripe_event_id TEXT    NOT NULL UNIQUE,
    event_type      TEXT    NOT NULL,
    payload_json    TEXT    NOT NULL,
    received_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS billing_events_user ON billing_events(user_id, received_at);
```

- `stripe_event_id` UNIQUE — Stripe redelivers webhooks; the unique constraint makes the handler trivially idempotent.
- `payload_json` for forensics (no PII handling beyond what Stripe sends; Stripe stores card details, not us).
- ON DELETE SET NULL — the audit log survives user deletion (legally / forensically useful) but doesn't violate FK on cascade.

### No new monthly-counter table

The 3-books / month free-tier enforcement is computed from `reading_history` (migration 019, already present). The Pro chapter-cap is computed from `translations.created_at` filtered by author = user. Both queries are short and cached for 5 minutes per user.

If the on-the-fly queries become a hotspot, we can add `monthly_quota_usage(user_id, period, books_count, translations_count)` with a daily refresh, but that's a follow-up. v1 ships without it — measurement first.

## Authorization layer

A new dependency `require_tier(min_tier)` injected into every gated route:

```python
# backend/services/auth.py
TIER_RANK = {"free": 0, "pro": 1, "premium": 2}

async def require_tier(min_tier: str):
    async def _dep(user: dict = Depends(get_current_user)) -> dict:
        if TIER_RANK[user["tier"]] < TIER_RANK[min_tier]:
            raise HTTPException(
                status_code=402,  # 402 Payment Required — exactly this case
                detail={
                    "error": "tier_required",
                    "current_tier": user["tier"],
                    "required_tier": min_tier,
                },
            )
        return user
    return _dep
```

Routes apply it as `Depends(require_tier("pro"))` etc. The `402` status with structured detail lets the frontend decide between "show upgrade modal" and "show error toast".

Free-tier-specific quota (the 3-books rule) is a separate dependency `require_book_quota(book_id)` injected only into `GET /books/{id}/chapters` (the entry-point that establishes a user is reading a particular book). See §"Reading-quota enforcement" below.

## Translation-creation gating

The split is exactly **read vs. write** on the translation cache.

### Read side — open to everyone (no change)

| Route | Gate |
|---|---|
| `GET /books/{id}/chapters/{n}/translation` | none |
| `GET /books/{id}/chapters/{n}/queue-status` | none |

These continue to read the shared `translations` cache and return whatever's there. A free user reading a chapter that some Pro user previously translated gets the translation for free. This is the network-effect property the user explicitly wants to preserve.

### Write side — paid-only

| Route | Gate added |
|---|---|
| `POST /books/{id}/chapters/{n}/translation` | `Depends(require_tier("pro"))` |
| `POST /books/{id}/chapters/{n}/translation/retry` | `Depends(require_tier("pro"))` |
| `POST /books/{id}/translations/enqueue-all` | `Depends(require_tier("pro"))` |
| `POST /ai/translate` | `Depends(require_tier("pro"))` |

Pro tier's monthly chapter cap is enforced as a **separate dependency** layered on top — `require_translation_quota` — that counts `translations.created_at` rows for `user_id = me` in the current calendar month. Hitting the cap returns the same `402` shape with `error: "monthly_cap_reached"` and structured detail describing remaining-quota and the upgrade target.

**Premium has no chapter cap.** Premium users skip `require_translation_quota` entirely.

**BYOK bypasses Pro's cap.** If the user has a non-null `users.gemini_key` set AND the request would have used Gemini, the cap check is skipped — they're paying for their own LLM tokens.

### Existing admin routes are untouched

Admin routes (under `/admin/translations/...`) already require admin role, which is orthogonal to the user tier. No changes there.

## Reading-quota enforcement (the 3 books / month rule)

### Definition

A free-tier user can have at most **3 distinct `book_id` values** present in their `reading_history` rows for the **current calendar month** (UTC). Opening any chapter of a *new* book_id when they're already at 3 returns `402` from `GET /books/{id}/chapters` with paywall payload.

### Why calendar month and not rolling 30-day

- **Predictability for the user.** "I get 3 books this month, and on the 1st I get 3 more" is easier to reason about than a rolling window's continuous expiry.
- **Cheaper to compute.** `reading_history.read_at >= '<first-of-month>'` is one fixed bound, vs. the rolling case's `read_at >= now() - INTERVAL 30 DAYS` which has to be re-evaluated continuously.
- Industry standard (Spotify, Audible, NYT all use calendar months).

This decision is reversible — flag in §"Open questions".

### Enforcement point

```python
# backend/routers/books.py:492 — GET /books/{id}/chapters
@router.get("/{book_id}/chapters")
async def book_chapters(
    book_id: int = Path(..., ge=1),
    user: dict | None = Depends(get_optional_user),
):
    # NEW: free-tier monthly book quota.
    if user and user["tier"] == "free":
        await require_book_quota(user["id"], book_id)
    # ... existing implementation continues
```

`require_book_quota` SQL:

```sql
SELECT COUNT(DISTINCT book_id) FROM reading_history
 WHERE user_id = ? AND read_at >= ?  -- start of current month UTC
```

If count >= 3 AND `book_id NOT IN (already-read-this-month)`, raise `402`. Otherwise allow — including allowing the 4th, 5th, … chapter of a book they've already opened this month, since that book_id is already "spent".

### Edge cases

1. **Anonymous reader** — `user is None`. The 3-books gate is for signed-in free users; anonymous gets the same access as today. (We can lock anonymous further as a follow-up if needed; out of scope here.)
2. **Uploaded books** — books the user uploaded themselves count toward the quota by default. Flagged in §"Open questions" — could exempt uploads as "their content" but it complicates the model.
3. **Quota reset on the 1st** — the SQL bound flips to next-month-1st automatically; no cron job needed.
4. **Reading-history retention** — rows are append-only and never deleted today. Over years, this grows. The query is indexed on `(user_id, read_at)` so it stays fast, but a future `archive_reading_history` job is a separate concern.

## BYOK — bring your own API key

`users.gemini_key` already exists (migration 001) and is used by some queue paths. This design extends it:

- **UI:** Paid users see a "Use my own API key" panel in `/account/billing`. Stores the key in `users.gemini_key` (existing column; encrypted at rest is a separate hardening issue, out of scope).
- **Routing:** When a translation request hits the queue, the worker picks the requester's `gemini_key` if non-null, else falls back to the project's queue key. **Effective rule: any paid user with a key set uses that key for their requests.**
- **Pro chapter cap is bypassed when BYOK is in effect.** They're paying the LLM bill, so we don't gate quantity. Abuse-rate-limit (e.g. 100 chapters/hour) still applies for system protection.
- **Model coverage.** Today only Gemini has BYOK. Anthropic / OpenAI BYOK would each need their own column + UI + routing path. Flagged in §"Open questions"; v1 ships Gemini-only BYOK matching today's behaviour.

## Billing — Stripe

Use Stripe Checkout + Customer Portal. We do not handle card data.

### New backend routes

| Route | Description |
|---|---|
| `POST /billing/checkout` | Creates a Stripe Checkout Session for the requested tier (`pro` or `premium`). Returns `{url}` for the frontend to redirect to. |
| `POST /billing/portal` | Creates a Stripe Customer Portal session. Returns `{url}`. Requires existing `stripe_customer_id`. |
| `POST /billing/webhook` | Receives Stripe webhooks. Verifies signature. Routes by event type (described below). |
| `GET /billing/me` | Returns current tier, period_end, current usage (books-this-month, translations-this-month), Stripe customer-portal URL if applicable. Frontend uses this to render `/account/billing`. |

### Webhook events handled

- `checkout.session.completed` — first sub created → set `users.stripe_customer_id`, `stripe_subscription_id`, `tier`, `tier_period_end`.
- `customer.subscription.updated` — period renewed / plan changed → update `tier`, `tier_period_end`.
- `customer.subscription.deleted` — sub cancelled → schedule downgrade at `tier_period_end` (don't downgrade immediately; user paid through end of period).
- `invoice.payment_failed` — log `billing_events`; surface a banner in the UI; first failure is a warning, second is an actual downgrade.

Webhook signature verification uses Stripe's standard library helper. Webhook secret stored in env var (out-of-tree config, user sets in Railway / hosting).

### Stripe-side configuration (user-only)

- Create products `Pro` and `Premium` in Stripe Dashboard.
- Attach prices: monthly recurring (price strings end up in env vars `STRIPE_PRICE_PRO`, `STRIPE_PRICE_PREMIUM`).
- Configure webhook endpoint to point at production `/billing/webhook` with the `checkout.session.completed` + `customer.subscription.*` + `invoice.*` events selected.
- Place the webhook secret in env var `STRIPE_WEBHOOK_SECRET`.

This is `user-only` follow-up at impl time.

### Pricing values

**Out of scope for this design.** The user decides $/month. The code reads price IDs from env vars.

## API summary

### New routes

```
POST   /billing/checkout           — start subscription (creates Stripe Checkout)
POST   /billing/portal             — manage subscription (creates Stripe Portal)
POST   /billing/webhook            — Stripe webhook (signature-verified)
GET    /billing/me                 — current tier + usage
PUT    /user/byok                  — set/clear gemini_key (paid only)
```

### Modified routes (gating only — no body-shape change)

```
POST   /books/{id}/chapters/{n}/translation         — require_tier("pro") + require_translation_quota
POST   /books/{id}/chapters/{n}/translation/retry   — require_tier("pro") + require_translation_quota
POST   /books/{id}/translations/enqueue-all         — require_tier("pro") + require_translation_quota
POST   /ai/translate                                — require_tier("pro") + require_translation_quota
GET    /books/{id}/chapters                         — require_book_quota (free only)
```

The `402` response is the only new client-visible behaviour. Existing 200 / 422 / 404 paths are unchanged.

## Frontend changes

### New pages

1. **`/pricing`** — three-column tier comparison + "Get Started" / "Upgrade" CTAs. Public (anonymous-visitor accessible). Hits `POST /billing/checkout` for the chosen tier.
2. **`/account/billing`** — current tier, usage indicators, "Manage Subscription" button (→ `POST /billing/portal`), BYOK panel (paid users), recent billing events. Authenticated.

### New paywall surfaces

| Trigger | Component | CTA |
|---|---|---|
| Free user opens 4th book of the month | `<PaywallModal kind="book-quota">` | "Upgrade to Pro for unlimited reading" |
| Free user clicks "Translate" | `<PaywallModal kind="translation-create">` | "Upgrade to Pro to translate new chapters" |
| Pro user hits monthly translation cap | `<PaywallModal kind="translation-cap">` | "Upgrade to Premium" / "Use your own API key" |

The modal uses the `402` response's `detail` field to pick the right copy.

### Existing surfaces

Header / profile menu gains a "Plan: Free" / "Plan: Pro" badge linking to `/account/billing`. Existing `<TranslationButton>` / "Translate this chapter" CTAs check the local user-tier state and either render the action or render a paywall icon — saves a roundtrip when the gate is obvious client-side.

The reader sidebar's `Translation` tab renders unchanged for cached translations (read path is unchanged for everyone). Cached-but-not-yet-translated chapters render the paywall paywall in place of the "Generate translation" button for free users.

## Migration & rollout

1. **Migration 038** — add tier + Stripe columns to `users`. Default `'free'`, no data movement. Trivial; rollback-safe.
2. **Migration 039** — `billing_events` table. New, empty. Trivial.
3. **Backend ships** with the new routes inert (Stripe price IDs not yet set in env) — deploy in dark mode.
4. **User configures Stripe** in Dashboard (products, prices, webhook).
5. **User sets env vars** (price IDs, webhook secret, public key) in production.
6. **Frontend ships** the pricing page + paywall surfaces, gated behind a feature flag (`NEXT_PUBLIC_BILLING_ENABLED`) so the launch is reversible.
7. **First end-to-end test:** Architect runs through the full Pro-checkout flow against Stripe test mode (test cards), verifies tier flips on `checkout.session.completed`, verifies portal cancel flips tier on `subscription.deleted`. Documented in a follow-up ops report under `reports/`.
8. **Public switch flip** by user once tested.

Existing users stay on `tier = 'free'` until they actively upgrade. No silent migrations.

## Test plan

| Test | Asserts |
|---|---|
| `test_users_default_tier_free` | Migration 038 backfill: existing rows get `tier = 'free'`. |
| `test_require_tier_blocks_free` | `Depends(require_tier("pro"))` returns 402 for `tier=free`. |
| `test_require_tier_allows_paid` | Pro and Premium pass through; free is blocked. |
| `test_require_book_quota_under_3` | Free user with 2 books in `reading_history` this month opens a 3rd successfully. |
| `test_require_book_quota_at_3_blocks_new_book` | Free user with 3 distinct books this month is blocked from a 4th. |
| `test_require_book_quota_at_3_allows_already_read_book` | Free user with 3 books this month can keep reading those 3 books (no extra count). |
| `test_require_book_quota_does_not_block_paid` | Pro / Premium have no monthly book limit. |
| `test_translation_cap_pro_under_cap` | Pro at translations_this_month < 50 succeeds. |
| `test_translation_cap_pro_at_cap_returns_402` | Pro at exactly 50 returns 402 with `monthly_cap_reached`. |
| `test_translation_cap_premium_no_cap` | Premium succeeds at 1000+ translations / month. |
| `test_byok_bypasses_pro_cap` | Pro user with `gemini_key` set succeeds past the 50-cap. |
| `test_translation_read_path_open_for_all` | Free user can `GET …/translation` for a cached translation. |
| `test_translation_write_path_blocks_free` | Free user `POST …/translation` returns 402. |
| `test_billing_webhook_idempotent` | Replay of identical `stripe_event_id` is a no-op (UNIQUE constraint). |
| `test_billing_webhook_subscription_created_promotes` | `checkout.session.completed` flips user to the right tier. |
| `test_billing_webhook_subscription_deleted_schedules_downgrade` | `subscription.deleted` doesn't downgrade immediately; downgrade fires after `tier_period_end`. |
| `test_expire_subscriptions_cron_downgrades_lapsed` | Cron job downgrades users where `tier_period_end < now()` and Stripe sub was missed. |
| `test_get_billing_me_returns_usage` | `GET /billing/me` returns books_used / cap and translations_used / cap. |

Frontend tests:

- `<PaywallModal>` renders three variants based on `kind` prop.
- `/pricing` renders three columns and CTAs hit the right route.
- Plan badge in header reads from auth context.
- `useUserTier` hook returns the right tier + usage for free / pro / premium.

E2E:

- Anonymous → /pricing → free signup → opens 4 books → paywall surfaces.
- Free user → upgrade flow → Stripe test card → tier flips to Pro → 4th book opens.

## Risks / open questions

The most important things to settle before implementation begins.

1. **Pro vs Premium differentiator.** The proposed split is "Pro = capped, Premium = uncapped + priority queue + extras". Alternatives the user might prefer:
   - **Capacity split** — Pro = N books, Premium = unlimited (i.e. Free tier's quota is just a smaller version of Pro's, not a separate behaviour).
   - **Feature split** — Pro = standard, Premium adds team accounts / multi-user / API access.
   - **Volume split** — Pro = N translations/mo, Premium = M translations/mo, both still capped.
   - **My recommendation:** ship Pro=capped + Premium=uncapped + priority queue first; add other extras as discrete follow-ups when there's user demand.

2. **Pricing values ($/month).** Out of scope for this design. The user decides; code reads from env. **Decision needed before launch.**

3. **Reading-quota reset cadence.** Calendar month vs rolling 30-day. Recommended calendar month (§"Reading-quota enforcement / Why calendar month"). Reversible.

4. **Uploaded books in the free quota.** Today's design counts uploaded books toward the 3 / month. Argument for exempting them: it's the user's content. Argument against exempting: free users could upload and use the upload path as an unbounded translation-cache spammer. **Recommendation: count toward the cap; revisit if real users push back.**

5. **BYOK provider scope.** Today only Gemini has a per-user key column. Anthropic / OpenAI BYOK each need their own column + UI + routing. **Recommendation: ship Gemini-only BYOK in v1; add others in a follow-up if requested.**

6. **Trial period.** A free trial of Pro (7 / 14 days) would likely lift conversion. Stripe supports this directly via `trial_period_days` on the price. **Recommendation: ship without trial in v1; add as a Stripe-side change later (no code change, just dashboard config).**

7. **Annual subscription.** Standard discount (e.g. annual = 10× monthly = 2 months free). **Recommendation: ship monthly only; annual is a Stripe-dashboard change later.**

8. **Anonymous-reader access.** Today an anonymous reader can access the same chapters a signed-in free user can. After this design ships, signed-in free users get the 3-books cap; anonymous keeps the same lenient access (or gets the same cap, but we can't track them by user_id). **Recommendation: keep anonymous as today; force sign-in only at the "paid action" boundary, and apply the 3-books rule only when signed-in. Anonymous abuse risk is bounded by the existing rate limits and the cache (anonymous users can never trigger an LLM call).**

9. **Existing power users grandfathering.** A handful of users have used the project's translation features heavily for free. Should they be auto-promoted to Pro / Premium for some period as a thank-you? **Recommendation: leave to the user's call. Default "no" — paid behaviour starts on launch day for everyone.**

10. **Refunds, dispute handling, dunning emails.** Stripe handles all of this in the Customer Portal. Out of scope for the code; user configures dunning settings in Stripe Dashboard.

11. **EU VAT / tax compliance.** Stripe Tax can handle this with a one-click toggle. **Out of scope; user-decided.**

12. **Cache-poisoning concern.** A malicious paid user could spam-translate (within their cap) a book with garbage prompts to grief the cache for free readers. Today nothing prevents this, and the paid-tier-only gate doesn't change the threat model — it just narrows the actor pool to people who paid. **Recommendation: orthogonal issue; file a follow-up if it becomes real (admin-side moderation tooling already covers retranslate).**

## Acceptance

Implementation PR (filed as a follow-up issue once this design merges) ships:

- Migrations 038 + 039 with backfill tests.
- `require_tier` + `require_book_quota` + `require_translation_quota` dependencies + their unit tests.
- Five gated translation routes wired up.
- One book-quota-gated route wired up.
- Five new billing routes implemented and tested.
- Daily cron job `scripts/expire_subscriptions.py` for defensive downgrade.
- Frontend `/pricing` + `/account/billing` + paywall modal.
- E2E test for the Stripe checkout flow against test mode.
- `user-only` follow-up issue: configure Stripe products + prices + webhook in Dashboard, set env vars in production.

The design is settled when the user has ruled on §"Open questions" 1-3 (Pro/Premium split, pricing values, reset cadence). Other open questions can be deferred to impl-time refinement without re-opening this design.

## Path B gate

This PR will be created with `gh pr create --label needs-user-approval --label architecture --label enhancement` to seed the gate label at PR-open time, avoiding the auto-merge race noted in #1744. PM reviews for readiness and applies `pm-approved`; user is the sole approver and removes `needs-user-approval` + applies `user-approved` to release the merge. Implementation is filed as a follow-up issue (or via conversion of #1774) once this design is merged.
