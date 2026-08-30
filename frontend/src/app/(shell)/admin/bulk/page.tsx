"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BulkRedirect() {
  const router = useRouter();
  useEffect(() => {
    document.title = "Admin: Bulk — Book Reader AI";
    router.replace("/admin/queue");
  }, [router]);
  return null;
}
