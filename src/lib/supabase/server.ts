import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { cache } from "react";
import { readServerEnv } from "@/lib/env";
import type { Profile } from "@/types/db";

/**
 * Server client, bound to the request's auth cookies. Same RLS rules as
 * the browser client -- nothing here is privileged.
 */
export async function createSupabaseServer() {
  const cookieStore = await cookies();
  const env = readServerEnv();

  if (!env.ok) {
    throw new Error(
      "Supabase is not configured for this build. Missing: " +
        [...env.missing, ...env.invalid].join(", ") +
        ". These are compiled in at build time, so set them and redeploy.",
    );
  }

  return createServerClient(
    env.url,
    env.anonKey,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Middleware refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  );
}

/**
 * The signed-in user's profile, or null. Deduped per request so a page
 * with a dozen role checks still hits the database once.
 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createSupabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return (data as Profile) ?? null;
});

/** owner + partner. The single source of truth for "can see money". */
export function hasFinanceAccess(profile: Profile | null): boolean {
  return profile?.is_active === true && (profile.role === "owner" || profile.role === "partner");
}

export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active) throw new Error("NOT_AUTHENTICATED");
  return profile;
}

/**
 * Guard for every financial route. The database refuses staff anyway;
 * this stops them reaching a page that would only render errors.
 */
export async function requireFinanceAccess(): Promise<Profile> {
  const profile = await requireProfile();
  if (!hasFinanceAccess(profile)) throw new Error("FORBIDDEN_FINANCE");
  return profile;
}
