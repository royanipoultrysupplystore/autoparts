/**
 * Public configuration, resolved at RUNTIME.
 *
 * The obvious way to do this in Next.js is `process.env.NEXT_PUBLIC_X`,
 * which the compiler substitutes into the bundle at BUILD time. That is
 * fast, and it is also brittle in exactly the way that costs an evening:
 *
 *   - set the variable after the build and it is not in the bundle
 *   - mark it "sensitive" on Vercel and the build never sees it
 *   - restore a cached build and the old value comes back with it
 *
 * Every one of those failures looks identical from the outside: the value
 * is simply undefined, with nothing to say why.
 *
 * So the server reads the environment when a request arrives -- which is
 * always current, and works with sensitive variables too -- and hands the
 * result to the browser through a small inline script. The build-time
 * constants stay as a fallback, so nothing breaks if the script is
 * absent.
 *
 * Only the project URL and the publishable key travel this way. Both are
 * public by definition: they are shipped to every visitor either way, and
 * neither grants access to anything on its own. RLS does that work.
 */

export type PublicConfig = { url: string; anonKey: string };

export type SupabaseEnv =
  | ({ ok: true } & PublicConfig)
  | { ok: false; missing: string[]; invalid: string[] };

/** The global the inline script writes to. */
export const CONFIG_GLOBAL = "__MS_PUBLIC_CONFIG__";

declare global {
  var __MS_PUBLIC_CONFIG__: Partial<PublicConfig> | undefined;
}

/**
 * Server-side read. Accepts the value with or without the NEXT_PUBLIC_
 * prefix, so an operator who sets SUPABASE_URL -- the more natural name
 * for a server secret -- is not punished for it.
 *
 * Written out as literal lookups because Next.js only substitutes those;
 * a computed key would come back undefined however correct it looks.
 */
function fromProcessEnv(): Partial<PublicConfig> {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || undefined,
    anonKey:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      undefined,
  };
}

function validate(candidate: Partial<PublicConfig>): SupabaseEnv {
  const missing: string[] = [];
  const invalid: string[] = [];

  const url = candidate.url?.trim();
  const anonKey = candidate.anonKey?.trim();

  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  else if (!/^https?:\/\/[^\s]+$/i.test(url)) invalid.push("NEXT_PUBLIC_SUPABASE_URL");

  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (missing.length || invalid.length) return { ok: false, missing, invalid };
  return { ok: true, url: url!, anonKey: anonKey! };
}

/** For the proxy, server components, and route handlers. */
export function readServerEnv(): SupabaseEnv {
  return validate(fromProcessEnv());
}

/**
 * For the browser. Prefers what the server injected -- which is current
 * as of this request -- and falls back to whatever the build inlined.
 */
export function readClientEnv(): SupabaseEnv {
  const injected =
    typeof window !== "undefined" ? globalThis[CONFIG_GLOBAL] : undefined;

  if (injected?.url && injected?.anonKey) return validate(injected);
  return validate(fromProcessEnv());
}

/** Works on either side of the wire. */
export function readSupabaseEnv(): SupabaseEnv {
  return typeof window === "undefined" ? readServerEnv() : readClientEnv();
}

export function describeEnvProblem(env: Extract<SupabaseEnv, { ok: false }>): string {
  const parts: string[] = [];
  if (env.missing.length) parts.push(`missing: ${env.missing.join(", ")}`);
  if (env.invalid.length) parts.push(`malformed: ${env.invalid.join(", ")}`);
  return parts.join("; ");
}

/**
 * The inline script. JSON.stringify escapes the values; the `</` guard
 * stops a value containing a closing tag from breaking out of the script
 * element.
 */
export function publicConfigScript(): string {
  const env = readServerEnv();
  const payload: Partial<PublicConfig> = env.ok
    ? { url: env.url, anonKey: env.anonKey }
    : {};

  return `window.${CONFIG_GLOBAL}=${JSON.stringify(payload).replace(/</g, "\\u003c")};`;
}

export const STOREFRONT_ENABLED = process.env.NEXT_PUBLIC_ENABLE_STOREFRONT === "true";
