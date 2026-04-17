"use client";
import { useCallback, useEffect, useState } from "react";
import { getMe } from "@/lib/api";
import { adminFetch } from "@/lib/adminFetch";

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
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed");
    }
  }

  if (loading) return <SpinnerRow />;
  if (error)
    return <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>;

  return (
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
              <span className="font-medium text-ink text-sm truncate">{u.name}</span>
              {u.role === "admin" && (
                <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">admin</span>
              )}
              {!u.approved && (
                <span className="text-[10px] bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded">pending</span>
              )}
            </div>
            <p className="text-xs text-stone-400 truncate">{u.email}</p>
          </div>
          {u.id !== myId && (
            <div className="flex gap-1">
              <button
                onClick={() =>
                  act(() =>
                    adminFetch(`/admin/users/${u.id}/approve`, {
                      method: "PUT",
                      body: JSON.stringify({ approved: !u.approved }),
                    }),
                  )
                }
                className={`text-xs px-2 py-1 rounded border ${
                  u.approved ? "border-orange-200 text-orange-600" : "border-emerald-200 text-emerald-600"
                }`}
              >
                {u.approved ? "Revoke" : "Approve"}
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete "${u.name}"?`))
                    act(() => adminFetch(`/admin/users/${u.id}`, { method: "DELETE" }));
                }}
                className="text-xs px-2 py-1 rounded border border-red-200 text-red-500"
              >
                Del
              </button>
            </div>
          )}
          {u.id === myId && <span className="text-xs text-stone-300">You</span>}
        </div>
      ))}
    </div>
  );
}

function SpinnerRow() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-6 h-6 border-4 border-amber-300 border-t-amber-700 rounded-full animate-spin" />
    </div>
  );
}
