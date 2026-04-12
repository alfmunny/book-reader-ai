"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Direct API calls (admin endpoints)
const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

interface User {
  id: number;
  email: string;
  name: string;
  picture: string;
  role: string;
  approved: number;
  created_at: string;
}

interface Stats {
  users_total: number;
  users_approved: number;
  users_pending: number;
  books_cached: number;
  audio_chunks_cached: number;
  audio_cache_mb: number;
}

import { getMe, getAuthToken } from "@/lib/api";

async function adminFetch(path: string, options?: RequestInit) {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options?.headers as Record<string, string> || {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [myId, setMyId] = useState<number | null>(null);

  useEffect(() => {
    // Store the auth token globally for adminFetch
    import("@/lib/api").then((api) => {
      // The token is set by Providers/TokenSync — we need to read it
      // We'll use getMe to verify we're admin, then fetch admin data
    });

    Promise.all([
      getMe().then((me) => {
        setMyId(me.id);
        if (me.role !== "admin") {
          router.push("/");
          return;
        }
      }),
      adminFetch("/admin/users").then(setUsers).catch((e) => setError(e.message)),
      adminFetch("/admin/stats").then(setStats).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [router]);

  async function toggleApproval(userId: number, currentlyApproved: boolean) {
    try {
      await adminFetch(`/admin/users/${userId}/approve`, {
        method: "PUT",
        body: JSON.stringify({ approved: !currentlyApproved }),
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, approved: currentlyApproved ? 0 : 1 } : u))
      );
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed");
    }
  }

  async function removeUser(userId: number, name: string) {
    if (!confirm(`Remove user "${name}"? This cannot be undone.`)) return;
    try {
      await adminFetch(`/admin/users/${userId}`, { method: "DELETE" });
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-parchment flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-amber-300 border-t-amber-700 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-parchment">
      <header className="border-b border-amber-200 bg-white/60 backdrop-blur px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.push("/")}
          className="text-amber-700 hover:text-amber-900 text-sm"
        >
          ← Library
        </button>
        <h1 className="font-serif font-bold text-ink text-xl">Admin Panel</h1>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-amber-200 p-4 text-center">
              <div className="text-2xl font-bold text-ink">{stats.users_approved}</div>
              <div className="text-xs text-amber-600">Approved Users</div>
            </div>
            <div className="bg-white rounded-xl border border-amber-200 p-4 text-center">
              <div className="text-2xl font-bold text-amber-600">{stats.users_pending}</div>
              <div className="text-xs text-amber-600">Pending Approval</div>
            </div>
            <div className="bg-white rounded-xl border border-amber-200 p-4 text-center">
              <div className="text-2xl font-bold text-ink">{stats.books_cached}</div>
              <div className="text-xs text-amber-600">Books Cached</div>
            </div>
            <div className="bg-white rounded-xl border border-amber-200 p-4 text-center">
              <div className="text-2xl font-bold text-ink">{stats.audio_chunks_cached}</div>
              <div className="text-xs text-amber-600">Audio Chunks</div>
            </div>
            <div className="bg-white rounded-xl border border-amber-200 p-4 text-center">
              <div className="text-2xl font-bold text-ink">{stats.audio_cache_mb} MB</div>
              <div className="text-xs text-amber-600">Audio Cache Size</div>
            </div>
          </div>
        )}

        {/* Users table */}
        <section className="bg-white rounded-2xl border border-amber-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-amber-200">
            <h2 className="font-serif font-semibold text-ink text-lg">Users</h2>
          </div>
          <div className="divide-y divide-amber-100">
            {users.map((user) => (
              <div key={user.id} className="px-6 py-4 flex items-center gap-4">
                {user.picture ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.picture} alt="" className="w-10 h-10 rounded-full" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold">
                    {user.name?.[0] ?? "?"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink truncate">{user.name}</span>
                    {user.role === "admin" && (
                      <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">admin</span>
                    )}
                    {!user.approved && (
                      <span className="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full">pending</span>
                    )}
                  </div>
                  <p className="text-xs text-stone-500 truncate">{user.email}</p>
                </div>
                <div className="flex gap-2">
                  {user.id !== myId && (
                    <>
                      <button
                        onClick={() => toggleApproval(user.id, !!user.approved)}
                        className={`text-xs px-3 py-1.5 rounded-lg border font-medium ${
                          user.approved
                            ? "border-orange-300 text-orange-700 hover:bg-orange-50"
                            : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                        }`}
                      >
                        {user.approved ? "Revoke" : "Approve"}
                      </button>
                      <button
                        onClick={() => removeUser(user.id, user.name)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </>
                  )}
                  {user.id === myId && (
                    <span className="text-xs text-stone-400">You</span>
                  )}
                </div>
              </div>
            ))}
            {users.length === 0 && (
              <div className="px-6 py-8 text-center text-amber-700">No users yet.</div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
