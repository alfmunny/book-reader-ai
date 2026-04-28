"use client";
import { useCallback, useEffect, useState } from "react";
import { getMe } from "@/lib/api";
import { adminFetch } from "@/lib/adminFetch";
import { AlertCircleIcon, CloseIcon, RetryIcon } from "@/components/Icons";

interface User {
  id: number;
  email: string;
  name: string;
  picture: string;
  role: string;
  approved: number;
  created_at: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [myId, setMyId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actError, setActError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);

  useEffect(() => {
    document.title = "Admin: Users — Book Reader AI";
  }, []);

  useEffect(() => {
    document.title = "Admin: Users — Book Reader AI";
  }, []);

  const load = useCallback(async () => {
    setError("");
    try {
      const u = await adminFetch("/admin/users");
      setUsers(u);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getMe().then((me) => setMyId(me.id)).catch(() => {});
    load();
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      await load();
      setActError(null);
    } catch (e: unknown) {
      setActError(e instanceof Error ? e.message : "Failed");
    }
  }

  if (loading) return <SpinnerRow />;
  if (error)
    return (
      <div role="alert" className="flex flex-col items-center gap-3 py-16 text-center">
        <AlertCircleIcon className="w-10 h-10 text-red-300" aria-hidden="true" />
        <p className="font-serif text-lg text-ink">Failed to load users.</p>
        <p className="text-sm text-stone-500">{error}</p>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-lg bg-amber-700 text-white text-sm font-medium hover:bg-amber-800 transition-colors"
        >
          <RetryIcon className="w-4 h-4" aria-hidden="true" />
          Retry
        </button>
      </div>
    );

  return (
    <div className="space-y-3">
      {actError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{actError}</span>
          <button
            type="button"
            onClick={() => setActError(null)}
            aria-label="Dismiss error"
            className="shrink-0 text-red-500 hover:text-red-700"
          >
            <CloseIcon className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-amber-200 divide-y divide-amber-100 overflow-hidden">
        {users.map((u) => (
          <div key={u.id} className="px-4 py-3 flex items-center gap-3">
            {u.picture ? (
              <img src={u.picture} alt="" className="w-8 h-8 rounded-full" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-sm font-bold">
                {u.name?.[0]}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-ink text-sm truncate" title={u.name}>{u.name}</span>
                {u.role === "admin" && (
                  <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">admin</span>
                )}
                {!u.approved && (
                  <span className="text-xs bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded">pending</span>
                )}
              </div>
              <p className="text-xs text-stone-500 truncate" title={u.email}>{u.email}</p>
            </div>
            {u.id !== myId && (
              <div className="flex gap-1 items-center">
                <button
                  onClick={() =>
                    act(() =>
                      adminFetch(`/admin/users/${u.id}/approve`, {
                        method: "PUT",
                        body: JSON.stringify({ approved: !u.approved }),
                      }),
                    )
                  }
                  aria-label={u.approved ? `Revoke ${u.name}` : `Approve ${u.name}`}
                  className={`text-xs px-3 py-2 md:px-2 md:py-1 rounded border min-h-[44px] md:min-h-0 flex items-center ${
                    u.approved ? "border-orange-200 text-orange-700" : "border-emerald-200 text-emerald-600"
                  }`}
                >
                  {u.approved ? "Revoke" : "Approve"}
                </button>

                {pendingDelete === u.id ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-red-600 whitespace-nowrap">Delete?</span>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingDelete(null);
                        act(() => adminFetch(`/admin/users/${u.id}`, { method: "DELETE" }));
                      }}
                      aria-label={`Confirm delete ${u.name}`}
                      className="text-xs px-2 py-1 md:py-0.5 rounded border border-red-400 bg-red-50 text-red-700 min-h-[44px] md:min-h-0 flex items-center"
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(null)}
                      aria-label="Cancel delete"
                      className="text-xs px-2 py-1 md:py-0.5 rounded border border-stone-200 text-stone-600 min-h-[44px] md:min-h-0 flex items-center"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPendingDelete(u.id)}
                    aria-label={`Delete ${u.name}`}
                    className="text-xs px-3 py-2 md:px-2 md:py-1 rounded border min-h-[44px] md:min-h-0 flex items-center border-red-200 text-red-600"
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
            {u.id === myId && <span className="text-xs text-stone-500">You</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function SpinnerRow() {
  return (
    <div role="status" aria-label="Loading users" className="flex items-center justify-center py-16">
      <span className="sr-only">Loading users...</span>
      <div className="w-6 h-6 border-4 border-amber-300 border-t-amber-700 rounded-full animate-spin" aria-hidden="true" />
    </div>
  );
}
