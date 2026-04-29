"use client";
import { useCallback, useEffect } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ClockIcon } from "@/components/Icons";
import { getMe } from "@/lib/api";

export default function PendingApprovalPage() {
  const router = useRouter();

  const checkApproval = useCallback(async () => {
    try {
      const user = await getMe();
      if (user.approved) {
        router.push("/");
      }
    } catch {
      // silently ignore — user stays on page if the check fails
    }
  }, [router]);

  useEffect(() => {
    document.title = "Account Pending — Book Reader AI";
    checkApproval();
    const interval = setInterval(checkApproval, 30_000);
    return () => clearInterval(interval);
  }, [checkApproval]);

  return (
    <main id="main-content" className="min-h-screen bg-parchment flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <ClockIcon className="w-16 h-16 text-amber-400 mx-auto mb-4" />
        <h1 className="font-serif text-2xl font-bold text-ink mb-2">Account Pending</h1>
        <p className="text-amber-700 text-sm mb-6">
          Your account is waiting for admin approval. You&apos;ll be able to use the
          app once an administrator approves your account.
        </p>
        <p className="text-xs text-stone-400 mb-4">Checking automatically every 30 seconds…</p>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-sm text-red-600 hover:text-red-800 min-h-[44px] flex items-center justify-center mx-auto"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
