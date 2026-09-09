import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { PublicPart } from "@/types/db";

/**
 * The public storefront's data layer -- deliberately separate from every
 * other read path in this codebase.
 *
 * Three things make a leak structurally impossible rather than merely
 * unlikely:
 *
 *   1. This file creates its own client with the ANON key and no session.
 *      It cannot borrow a signed-in partner's privileges even by
 *      accident, because it never sees their cookies.
 *
 *   2. It only ever touches `public_parts` and `search_public_parts`.
 *      Those are the only objects in the database granted to `anon`, and
 *      the view carries no cost, shelf, VIN, note, or asking-price
 *      column at all -- so there is nothing here to expose.
 *
 *   3. Nothing in this file imports from `@/lib/supabase/server`, so it
 *      has no route to an authenticated client.
 *
 * When the partners flip NEXT_PUBLIC_ENABLE_STOREFRONT on, no internal
 * financials can follow.
 */

export const STOREFRONT_ENABLED = process.env.NEXT_PUBLIC_ENABLE_STOREFRONT === "true";

function anonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function searchPublicParts(
  query: string,
  page = 0,
  pageSize = 48,
): Promise<{ parts: PublicPart[]; total: number }> {
  const supabase = anonClient();

  const { data, error } = await supabase.rpc("search_public_parts", {
    p_query: query.trim(),
    p_limit: pageSize,
    p_offset: page * pageSize,
  });

  if (error) return { parts: [], total: 0 };

  const parts = (data ?? []) as PublicPart[];
  return { parts, total: parts[0]?.total_count ?? 0 };
}

export async function getPublicPartBySlug(slug: string): Promise<PublicPart | null> {
  const supabase = anonClient();

  const { data } = await supabase
    .from("public_parts")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  return (data as PublicPart) ?? null;
}

/** Makes and models with something published, for the browse chips. */
export async function getPublicVehicleFacets(): Promise<
  { label: string; query: string; count: number }[]
> {
  const supabase = anonClient();

  const { data } = await supabase.from("public_parts").select("year, make, model");
  const rows = (data ?? []) as { year: number; make: string; model: string }[];

  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.year} ${r.make} ${r.model}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, query: label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}
