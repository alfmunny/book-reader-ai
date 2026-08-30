"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { getMe } from "@/lib/api";
import { SearchBar } from "@/components/SearchBar";
import { SettingsIcon } from "@/components/Icons";

/**
 * Site header and primary navigation.
 *
 * Extracted when the personal collection moved out of the homepage tab strip and
 * onto its own /bookshelf route (#2711) — the nav now has to render on both pages
 * rather than living inline in the homepage.
 *
 * Rendered once by `app/(shell)/layout.tsx` for every in-app route. The active
 * tab is derived from the pathname rather than passed in: when each page mounted
 * this itself it also had to declare which tab was current, so Upload, Notes,
 * Word List and Admin were hardcoded inactive — they had no page that rendered
 * the nav to light them up.
 */

/** Is `href` the section the current pathname belongs to? "/" must match exactly. */
export function isActiveNav(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SiteHeader() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    getMe().then((me) => setIsAdmin(me.role === "admin")).catch(() => {});
  }, [status]);

  const linkClass = (active: boolean) =>
    `px-5 py-3 min-h-[44px] md:min-h-0 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 ${
      active
        ? "border-amber-700 text-amber-900"
        : "border-transparent text-amber-700 hover:text-amber-800"
    }`;

  return (
    <>
      <header className="border-b border-amber-200 bg-white/60 backdrop-blur px-4 md:px-6 py-3 md:py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="w-10 h-10 rounded-xl shrink-0" />
            <div>
              <h1 className="text-xl md:text-2xl font-serif font-bold text-ink">Book Reader AI</h1>
              <p className="text-xs md:text-sm text-amber-800 mt-0.5">Public domain classics with AI assistance</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {status === "authenticated" ? <SearchBar /> : null}
            {status === "unauthenticated" ? (
              <Link
                href="/login"
                className="rounded-lg border border-amber-300 px-4 py-2.5 md:py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 transition-colors min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 flex items-center"
              >
                Sign in
              </Link>
            ) : (
              <Link
                href="/profile"
                title={`${session?.backendUser?.name ?? "Profile"} — Profile & Settings`}
                aria-label={`${session?.backendUser?.name ?? "Profile"} — Profile & Settings`}
                className="min-w-[44px] md:min-w-0 min-h-[44px] md:min-h-0 w-11 h-11 md:w-9 md:h-9 rounded-full overflow-hidden border border-amber-200 hover:border-amber-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-inset"
              >
                {session?.backendUser?.picture ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={session.backendUser.picture} alt="" loading="lazy" className="w-full h-full object-cover" />
                ) : (
                  <span className="w-full h-full flex items-center justify-center bg-amber-100 text-amber-700 text-sm font-bold">
                    {session?.backendUser?.name?.[0] ?? "?"}
                  </span>
                )}
              </Link>
            )}
          </div>
        </div>
      </header>

      <nav aria-label="Main navigation" className="border-b border-amber-200 bg-white/40 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 md:px-6 flex gap-1 items-center overflow-x-auto scrollbar-none" style={{ scrollbarWidth: "none" }}>
          <Link href="/" aria-current={isActiveNav(pathname, "/") ? "page" : undefined} className={linkClass(isActiveNav(pathname, "/"))}>
            Home
          </Link>
          {status === "authenticated" && (
            <Link
              href="/bookshelf"
              aria-current={isActiveNav(pathname, "/bookshelf") ? "page" : undefined}
              className={linkClass(isActiveNav(pathname, "/bookshelf"))}
            >
              Your Bookshelf
            </Link>
          )}
          {status === "authenticated" && (
            <Link href="/upload" aria-current={isActiveNav(pathname, "/upload") ? "page" : undefined} className={linkClass(isActiveNav(pathname, "/upload"))}>Upload</Link>
          )}
          {status === "authenticated" && (
            <Link href="/discover" aria-current={isActiveNav(pathname, "/discover") ? "page" : undefined} className={linkClass(isActiveNav(pathname, "/discover"))}>Discover</Link>
          )}
          {status === "authenticated" && (
            <Link href="/notes" aria-current={isActiveNav(pathname, "/notes") ? "page" : undefined} className={linkClass(isActiveNav(pathname, "/notes"))}>Your Notes</Link>
          )}
          {status === "authenticated" && (
            <Link href="/vocabulary" aria-current={isActiveNav(pathname, "/vocabulary") ? "page" : undefined} className={linkClass(isActiveNav(pathname, "/vocabulary"))}>Your Word List</Link>
          )}
          {isAdmin && (
            <Link href="/admin" data-testid="admin-tab" aria-current={isActiveNav(pathname, "/admin") ? "page" : undefined} className={linkClass(isActiveNav(pathname, "/admin"))}>
              <SettingsIcon className="w-3.5 h-3.5" aria-hidden="true" />
              Admin
            </Link>
          )}
        </div>
      </nav>
    </>
  );
}
