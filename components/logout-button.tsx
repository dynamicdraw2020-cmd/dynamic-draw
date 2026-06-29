"use client";

import { LogOut, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function logout() {
    if (loading) return;
    setLoading(true);
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "include", cache: "no-store", headers: { "content-type": "application/json" }, body: "{}" }); }
    finally { router.replace("/login"); router.refresh(); }
  }
  return <button className={`btn btn-ghost ${compact ? "btn-sm" : ""}`} onClick={logout} disabled={loading}>{loading ? <LoaderCircle size={15} className="spin" /> : <LogOut size={15} />} {compact ? "" : "로그아웃"}</button>;
}
