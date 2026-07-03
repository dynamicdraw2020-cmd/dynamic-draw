"use client";

import { useEffect } from "react";

export function OperationGuard() {
  useEffect(() => {
    let alive = true;
    async function check() {
      try {
        const response = await fetch(`/api/site/operation?ts=${Date.now()}`, { cache: "no-store" });
        const body = await response.json();
        if (!alive) return;
        if (body?.data?.mustLogout) {
          await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
          window.location.href = "/system-status";
        }
      } catch {}
    }
    void check();
    const timer = window.setInterval(check, 15000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);
  return null;
}
