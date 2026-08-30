/**
 * Regression: a page inside the (shell) group must not render its own
 * "back to the library" link.
 *
 * Before #2779 most routes rendered no global nav, so each page grew its own
 * header with a `← Library` / `← Back` link to `/` — that link was the only
 * way out. Now the shell layout renders SiteHeader on every one of these
 * routes, and its Home tab already goes to `/`, so those page-level back
 * links are duplicate chrome: three stacked bars, two of which point home.
 *
 * The page's own <header> is still useful — it carries the page title and
 * page-specific actions (Flashcards, note counts, export). It is only the
 * redundant back-affordance that must go.
 *
 * What counts as a back-affordance: a <Link href="/"> containing ArrowLeftIcon.
 * Deliberately NOT flagged, because they are real calls to action rather than
 * navigation chrome:
 *   - empty-state buttons ("Browse books", "Browse the library")
 *   - decks/[deckId]'s "Start reading" prompt when a manual deck has no words
 * Those use a forward/plus icon and read as an invitation, not an escape hatch.
 */

import fs from "fs";
import path from "path";

const SHELL_DIR = path.join(__dirname, "..", "app", "(shell)");

function pageFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...pageFiles(full));
    else if (entry.name === "page.tsx") out.push(full);
  }
  return out;
}

/**
 * Find <Link href="/"> elements whose body contains a back arrow.
 * Splitting on "<Link" keeps this readable without pulling in a JSX parser.
 */
function backLinksToHome(source: string): number {
  let count = 0;
  for (const chunk of source.split("<Link").slice(1)) {
    const body = chunk.split("</Link>")[0];
    if (/href="\/"/.test(body) && /ArrowLeftIcon/.test(body)) count += 1;
  }
  return count;
}

describe("(shell) pages — no duplicate back-to-home link", () => {
  const pages = pageFiles(SHELL_DIR);

  test("sanity: the shell contains the routes we expect", () => {
    expect(pages.length).toBeGreaterThan(10);
  });

  test("no shell page renders its own back-to-library link", () => {
    const offenders = pages
      .filter((p) => backLinksToHome(fs.readFileSync(p, "utf8")) > 0)
      .map((p) => path.relative(SHELL_DIR, p))
      .sort();

    expect(offenders).toEqual([]);
  });

  test("legitimate forward CTAs to / are left alone", () => {
    // decks/[deckId] invites you to go start reading when a manual deck is
    // empty. It points at "/" but is not a back link, and must survive.
    const deckDetail = fs.readFileSync(
      path.join(SHELL_DIR, "decks", "[deckId]", "page.tsx"),
      "utf8",
    );
    expect(deckDetail).toMatch(/Start reading/);
    expect(deckDetail).toMatch(/href="\/"/);
  });
});
