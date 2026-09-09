"use client";

import { useEffect } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";

/**
 * A 48 hour hold has to end on its own, or parts sit ghost-held by
 * no-show buyers forever.
 *
 * Supabase's free tier has no scheduler, so the sweep runs whenever
 * somebody opens the app and then hourly while it stays open. Four
 * partners checking their phones through the day is more than enough
 * coverage, and `expire_reservations()` is idempotent -- running it twice
 * costs nothing.
 */
export function ReservationSweeper() {
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    let cancelled = false;

    const sweep = async () => {
      if (cancelled || document.visibilityState === "hidden") return;
      await supabase.rpc("expire_reservations");
    };

    void sweep();
    const timer = setInterval(() => void sweep(), 60 * 60 * 1000);
    document.addEventListener("visibilitychange", sweep);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", sweep);
    };
  }, []);

  return null;
}
