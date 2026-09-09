"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser client. Carries the signed-in user's JWT, so every query it
 * makes is subject to RLS -- including the column-level revoke that keeps
 * vehicle costs away from staff.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

/** Singleton, so Realtime channels are shared rather than duplicated per component. */
export function getSupabaseBrowser() {
  if (!browserClient) browserClient = createClient();
  return browserClient;
}
