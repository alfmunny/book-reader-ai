# Path A vs Path B

Every feature lands via one of two workflows. PM decides which at triage time by labelling.

## Path A — simple feature

One service, clear scope, no schema redesign.

```
Anyone files issue (feat label)
  → Dev or Architect claims it
  → Implements; optional design note in PR body
  → PM reviews PR
  → Merged
```

**When:** bug fixes, small enhancements, a new field on an existing model, a new endpoint that follows an established pattern.

## Path B — complex / cross-cutting

New DB table, schema migration with existing-data impact, new service/router, features touching 3+ files across different services, or anything the user / PM flags as needing design review first.

```
Anyone files issue (architecture label)
  → Architect claims it
  → Design doc PR first (docs/design/<feature>.md)
  → PM reviews design doc → pm-approved label
  → User reviews highest-impact cases → user-approved label
  → Design doc merged
  → Implementation PR(s) reference the merged doc
  → PM reviews implementation PR(s)
  → Merged
```

**Gate labels:**

- `pm-approved` — PM signs off after reviewing the design doc.
- `user-approved` — user signs off for highest-impact changes (new deploy targets, cross-cutting policy changes, dependency additions).

Implementation PRs **do not** need a second PM review — once the design is approved, Dev or Architect implements directly.

## Deciding which path

- Touching 1–2 files in one service? → **Path A**.
- Adding a `REFERENCES` clause across 8 tables? → **Path B**.
- Adding a new workflow, deploy target, or third-party dependency? → **Path B**, and expect a `user-approved` requirement.
- Unsure? File the issue, let PM triage.

## Examples

- **Path A**: Adding `min_length=1` to a query param to reject empty strings (#786). One router file + one test.
- **Path B**: Declared FKs on soft `user_id`/`book_id` columns (#754). Four implementation PRs after the design doc merged, spanning migrations + service-layer cleanup.
- **Path B + user-approved**: The MkDocs docs site (#864). New GitHub Pages deploy target, new Python toolchain, site-wide content model.

For the current list of in-flight design docs, see the [Design docs index](../architecture/design-index.md).
