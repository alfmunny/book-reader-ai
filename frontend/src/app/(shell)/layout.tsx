import type { ReactNode } from "react";
import SiteHeader from "@/components/SiteHeader";

/**
 * Chrome shared by every in-app page: the global navigation.
 *
 * Routes placed in this group get the nav for free. Opting out is deliberate
 * — put the route *outside* `(shell)` — and today only three do: `/login`
 * (pre-auth), and `/reader/[bookId]` and `/vocabulary/flashcards` (immersive
 * views that own their chrome). `AppShellNavCoverage.test.ts` enforces that
 * list.
 *
 * Before this existed, SiteHeader was mounted by hand inside individual page
 * components, so most routes — including Upload, Notes and Word List, which
 * are links in the nav itself — rendered no nav at all.
 *
 * `/admin` is inside the group too. It keeps its own sub-header (title,
 * Refresh) and section tabs, but no longer carries a "← Library" link: the
 * nav's Home tab is the single way back, so admin reads the same as every
 * other section instead of being its own little world.
 */
export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  );
}
