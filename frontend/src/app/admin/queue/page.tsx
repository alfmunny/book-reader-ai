"use client";
import QueueTab from "@/components/QueueTab";
import { adminFetch } from "@/lib/adminFetch";

export default function QueuePage() {
  return <QueueTab adminFetch={adminFetch} />;
}
