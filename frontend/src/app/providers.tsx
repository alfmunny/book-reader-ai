"use client";
import { SessionProvider, useSession } from "next-auth/react";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { setAuthToken, getMe } from "@/lib/api";

/** Keeps the module-level auth token in api.ts in sync with the session.
 *  Also redirects unapproved users to /pending. */
function TokenSync() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    setAuthToken(session?.backendToken ?? null);
  }, [session]);

  // Check approval status once we have a token
  useEffect(() => {
    if (!session?.backendToken) return;
    getMe().then((me) => {
      if (!me.approved && pathname !== "/pending") {
        router.replace("/pending");
      }
    }).catch(() => {});
  }, [session?.backendToken, pathname, router]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <TokenSync />
      {children}
    </SessionProvider>
  );
}
