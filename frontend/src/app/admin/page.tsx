"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminIndex() {
  const router = useRouter();
  useEffect(() => {
    document.title = "Admin — Book Reader AI";
    router.replace("/admin/users");
  }, [router]);
  return null;
}
