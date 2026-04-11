"use client";
import { SessionProvider, useSession } from "next-auth/react";
import { useEffect } from "react";
import { setAuthToken } from "@/lib/api";

/** Keeps the module-level auth token in api.ts in sync with the session. */
function TokenSync() {
  const { data: session } = useSession();
  useEffect(() => {
    setAuthToken(session?.backendToken ?? null);
  }, [session]);
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
