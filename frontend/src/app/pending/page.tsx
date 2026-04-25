"use client";
import { signOut } from "next-auth/react";
import { ClockIcon } from "@/components/Icons";

export default function PendingApprovalPage() {
  return (
    <main id="main-content" className="min-h-screen bg-parchment flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <ClockIcon className="w-16 h-16 text-amber-400 mx-auto mb-4" />
        <h1 className="font-serif text-2xl font-bold text-ink mb-2">Account Pending</h1>
        <p className="text-amber-700 text-sm mb-6">
          Your account is waiting for admin approval. You&apos;ll be able to use the
          app once an administrator approves your account.
        </p>
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
