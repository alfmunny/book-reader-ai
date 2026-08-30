"use client";
import { useEffect } from "react";
import QueueTab from "@/components/QueueTab";
import { adminFetch } from "@/lib/adminFetch";

export default function QueuePage() {
  useEffect(() => {
    document.title = "Admin: Queue — Book Reader AI";
  }, []);

  return (
    <div>
      <h2 className="sr-only">Translation Queue</h2>
      <QueueTab adminFetch={adminFetch} />
    </div>
  );
}
