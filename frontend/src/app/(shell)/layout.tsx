import type { ReactNode } from "react";
import SiteHeader from "@/components/SiteHeader";

/**
 * Chrome shared by every in-app page: the global navigation.
 *
 * Routes placed in this group get the nav for free. Opting out is deliberate
 * — put the route *outside* `(shell)` — and today only four do: `/login`
 * (pre-auth), `/reader/[bookId]` and `/vocabulary/flashcards` (immersive
 * views that own their chrome), and `/admin` (renders its own section
 * header). `AppShellNavCoverage.test.ts` enforces that list.
 *
 * Before this existed, SiteHeader was mounted by hand inside individual page
 * components, so most routes — including Upload, Notes and Word List, which
 * are links in the nav itself — rendered no nav at all.
 */
export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  );
}
