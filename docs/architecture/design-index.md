# Design docs index

Every significant architectural change in Book Reader AI lands as a merged design doc under [`docs/design/`](https://github.com/alfmunny/book-reader-ai/tree/main/docs/design) before implementation begins. This page is the browsable index.

!!! note "Auto-generation coming in PR B"

    This page is **hand-curated** in PR A of the docs site (#864). **PR B** replaces it with content auto-generated from each design doc's H1 + `**Status:**` line + a `gh pr list --search` lookup for the merge commit.

## Active designs (merged, in or post-implementation)

| # | Design | Status | Summary |
|---|---|---|---|
| 700 | [FK enforcement](../design/fk-enforcement.md) | Shipped (#751) | Enables `PRAGMA foreign_keys = ON` per connection. |
| 754 | [Declared FKs schema](../design/declared-fks-schema.md) | PR 1–2 shipped; 3–4 in flight | Adds declared `REFERENCES` to soft `user_id`/`book_id` columns across 8 tables. |
| 357 | [User-book chapters table](../design/user-book-chapters.md) | Shipped | Dedicated chapters table for uploaded books (vs inline `books.text`). |
| 592 | [FTS5 in-app search](../design/fts5-in-app-search.md) | Shipped | Annotations + vocabulary + uploaded chapters full-text search. |
| 645 | [Vocab tags & decks](../design/vocab-tags-decks.md) | Slices 1–3 shipped | Free-text tags on vocabulary + manual/smart study decks. |
| 864 | [Docs site (this site)](../design/docs-site.md) | Design merged; PR A in flight | MkDocs + Material at `alfmunny.github.io/book-reader-ai/`. |

## Workflow: how designs get here

1. **Problem filed** as a GitHub issue with `architecture` label.
2. **Architect** claims the issue and writes `docs/design/<name>.md` covering: problem, goals, non-goals, solution, schema / API / file-scope changes, rollback, open questions.
3. **PM reviews** the design-doc PR. Path B extends the review to a `user-approved` label for the biggest-blast-radius changes.
4. **Design PR merges.** Implementation lands in one or more follow-up PRs that reference this doc.

For the full rule-set, see [Development → Path A vs B](../development/paths.md).

## Filing a new design doc

Follow the [existing design docs](https://github.com/alfmunny/book-reader-ai/tree/main/docs/design) as templates. Standard section order:

1. Problem
2. Goals / non-goals
3. Solution (schema, API, services affected)
4. File scope
5. Testing plan
6. Rollback / rollout
7. Open questions

Section 7 is the most important — if reviewers have no open questions, the design isn't ambitious enough.
