"use client";
import BulkTranslateTab from "@/components/BulkTranslateTab";
import { adminFetch } from "@/lib/adminFetch";

export default function BulkPage() {
  return <BulkTranslateTab adminFetch={adminFetch} />;
}
