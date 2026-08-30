/**
 * Regression: every app route must render the main navigation by default.
 *
 * The bug this locks down: SiteHeader used to be mounted ad-hoc *inside*
 * three page components (`/`, `/bookshelf`, `/discover`). Every other route
 * — including Upload, Your Notes, Your Word List and Admin, which are
 * themselves links in that very nav — rendered no nav at all. Five of the
 * eight destinations in the main menu dropped the main menu, so the only way
 * back was the browser Back button.
 *
 * The fix is structural: routes live under the `(shell)` route group whose
 * layout renders SiteHeader once. Opting out is now a deliberate act — you
 * have to place the route *outside* the group — and this test makes that
 * opt-out explicit, so route #26 can't silently regress.
 *
 * If you add a route and this test fails, the fix is almost always "move it
 * into (shell)", not "add it to STANDALONE_ROUTES".
 */

import fs from "fs";
import path from "path";

const APP_DIR = path.join(__dirname, "..", "app");

/**
 * Routes deliberately rendered WITHOUT the global nav, with the reason.
 * Anything not listed here must live inside the (shell) group.
 */
const STANDALONE_ROUTES: Record<string, string> = {
  "/login": "pre-auth; no session yet, so no nav to render",
  "/reader/[bookId]": "immersive reading view — owns its chrome and sidebar",
  "/vocabulary/flashcards": "immersive study mode — owns its own back control",
};

/** Walk src/app and return every route that has a page.tsx. */
function collectRoutes(): { route: string; inShell: boolean }[] {
  const out: { route: string; inShell: boolean }[] = [];

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === "page.tsx") {
        const rel = path.relative(APP_DIR, dir).split(path.sep).filter(Boolean);
        const inShell = rel[0] === "(shell)";
        // Route groups "(name)" are transparent in the URL.
        const segments = rel.filter((s) => !(s.startsWith("(") && s.endsWith(")")));
        out.push({ route: "/" + segments.join("/"), inShell });
      }
    }
  };
  walk(APP_DIR);
  return out;
}

/** A route is covered by an entry in STANDALONE_ROUTES if it is that route or nested under it. */
function standaloneReasonFor(route: string): string | undefined {
  for (const [prefix, reason] of Object.entries(STANDALONE_ROUTES)) {
    if (route === prefix || route.startsWith(`${prefix}/`)) return reason;
  }
  return undefined;
}

describe("app shell — global navigation coverage", () => {
  const routes = collectRoutes();

  test("sanity: the route table is non-trivial", () => {
    expect(routes.length).toBeGreaterThan(15);
  });

  test("every route either lives in (shell) or is a declared standalone", () => {
    const undeclared = routes
      .filter((r) => !r.inShell && !standaloneReasonFor(r.route))
      .map((r) => r.route)
      .sort();

    expect(undeclared).toEqual([]);
  });

  test("declared standalone routes are genuinely outside (shell)", () => {
    const contradictions = routes
      .filter((r) => r.inShell && standaloneReasonFor(r.route))
      .map((r) => r.route)
      .sort();

    expect(contradictions).toEqual([]);
  });

  test("the four nav destinations that regressed are inside the shell", () => {
    // These are links in SiteHeader itself; each one used to drop the nav.
    const mustHaveNav = ["/upload", "/notes", "/vocabulary", "/bookshelf", "/discover", "/"];
    for (const route of mustHaveNav) {
      const found = routes.find((r) => r.route === route);
      expect(found).toBeDefined();
      expect({ route, inShell: found!.inShell }).toEqual({ route, inShell: true });
    }
  });

  test("no page mounts SiteHeader itself — the shell layout owns it", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name === "page.tsx") {
          if (/\bSiteHeader\b/.test(fs.readFileSync(full, "utf8"))) {
            offenders.push(path.relative(APP_DIR, full));
          }
        }
      }
    };
    walk(APP_DIR);
    expect(offenders.sort()).toEqual([]);
  });
});
