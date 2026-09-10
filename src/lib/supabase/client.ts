"use client";

import { createBrowserClient } from "@supabase/ssr";
import { readSupabaseEnv } from "@/lib/env";

/**
 * Browser client. Carries the signed-in user's JWT, so every query it
 * makes is subject to RLS -- including the column-level revoke that keeps
 * vehicle costs away from staff.
 */
export function createClient() {
  const env = readSupabaseEnv();

  if (!env.ok) {
    // Reaching here means the build did not receive its NEXT_PUBLIC_*
    // values. Say so plainly; the alternative is a stack trace about an
    // invalid URL that points nowhere useful.
    throw new Error(
      "Supabase is not configured for this build. Missing: " +
        [...env.missing, ...env.invalid].join(", ") +
        ". These are compiled in at build time, so set them and redeploy.",
    );
  }

  return createBrowserClient(env.url, env.anonKey);
}

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

/** Singleton, so Realtime channels are shared rather than duplicated per component. */
export function getSupabaseBrowser() {
  if (!browserClient) browserClient = createClient();
  return browserClient;
}
