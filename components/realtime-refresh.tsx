"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

export function RealtimeRefresh({ eventTypes = ["DRAW_RESULT", "STATS_UPDATE"] }: { eventTypes?: string[] }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY));
  const eventKey = eventTypes.join(",");

  useEffect(() => {
    if (!configured) return;
    const allowed = new Set(eventKey.split(","));
    const supabase = createClient();
    const refreshSoon = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 350);
    };
    const channel = supabase
      .channel(`dynamic-d-refresh-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_events" }, (message) => {
        const event = message.new as { event_type?: string };
        if (!event.event_type || !allowed.has(event.event_type)) return;
        refreshSoon();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "raffle_events" }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "draws" }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "rewards" }, refreshSoon)
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [configured, eventKey, router]);

  return null;
}
