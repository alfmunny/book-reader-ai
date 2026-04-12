"use client";
import { signOut } from "next-auth/react";

export default function PendingApprovalPage() {
  return (
    <div className="min-h-screen bg-parchment flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="text-5xl mb-4">⏳</div>
        <h1 className="font-serif text-2xl font-bold text-ink mb-2">Account Pending</h1>
        <p className="text-amber-700 text-sm mb-6">
          Your account is waiting for admin approval. You&apos;ll be able to use the
          app once an administrator approves your account.
        </p>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-sm text-red-600 hover:text-red-800"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
