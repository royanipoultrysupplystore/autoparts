/**
 * Environment configuration, checked in one place.
 *
 * NEXT_PUBLIC_* values are inlined by Next.js at BUILD time, not read at
 * runtime. Adding them in a hosting dashboard after a deploy therefore
 * changes nothing until the next build -- the already-built bundle still
 * carries `undefined`.
 *
 * That failure mode used to surface as a bare "Internal Server Error" on
 * every route, because the Supabase client throws when handed an invalid
 * URL and the proxy runs before anything else. This module turns it into
 * a sentence that says what is wrong and what to do.
 *
 * The references below are written out in full rather than built from
 * variables, because Next.js only inlines literal `process.env.NAME`
 * lookups -- a dynamic lookup would always come back undefined.
 */

export type SupabaseEnv =
  | { ok: true; url: string; anonKey: string }
  | { ok: false; missing: string[]; invalid: string[] };

export function readSupabaseEnv(): SupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const missing: string[] = [];
  const invalid: string[] = [];

  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  else if (!/^https?:\/\/.+/i.test(url)) invalid.push("NEXT_PUBLIC_SUPABASE_URL");

  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (missing.length || invalid.length) return { ok: false, missing, invalid };
  return { ok: true, url: url!, anonKey: anonKey! };
}

export function isSupabaseConfigured(): boolean {
  return readSupabaseEnv().ok;
}

/** The message shown on the configuration screen and in the server logs. */
export function describeEnvProblem(env: Extract<SupabaseEnv, { ok: false }>): string {
  const parts: string[] = [];
  if (env.missing.length) parts.push(`missing: ${env.missing.join(", ")}`);
  if (env.invalid.length) parts.push(`malformed: ${env.invalid.join(", ")}`);
  return parts.join("; ");
}

export const STOREFRONT_ENABLED = process.env.NEXT_PUBLIC_ENABLE_STOREFRONT === "true";
