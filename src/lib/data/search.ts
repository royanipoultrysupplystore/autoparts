import "server-only";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { PartCondition, PartStatus, SearchResult } from "@/types/db";

/**
 * The search screen's data layer.
 *
 * All of the work happens in the `search_parts` RPC: one query, one
 * trigram index, no join fan-out and no N+1. The screen is the one a
 * partner opens mid-conversation with a customer, so this path stays as
 * short as it can be.
 */

export type SearchFilters = {
  query?: string;
  makes?: string[];
  models?: string[];
  yearMin?: number;
  yearMax?: number;
  conditions?: PartCondition[];
  categories?: string[];
  statuses?: PartStatus[];
  limit?: number;
  offset?: number;
};

export const DEFAULT_STATUSES: PartStatus[] = ["available"];

export async function searchParts(filters: SearchFilters): Promise<{
  results: SearchResult[];
  total: number;
}> {
  const supabase = await createSupabaseServer();

  const { data, error } = await supabase.rpc("search_parts", {
    p_query: filters.query?.trim() || "",
    p_makes: filters.makes?.length ? filters.makes : null,
    p_models: filters.models?.length ? filters.models : null,
    p_year_min: filters.yearMin ?? null,
    p_year_max: filters.yearMax ?? null,
    p_conditions: filters.conditions?.length ? filters.conditions : null,
    p_categories: filters.categories?.length ? filters.categories : null,
    p_statuses: filters.statuses?.length ? filters.statuses : DEFAULT_STATUSES,
    p_limit: filters.limit ?? 50,
    p_offset: filters.offset ?? 0,
  });

  if (error) throw new Error(error.message);

  const results = (data ?? []) as SearchResult[];
  return {
    results,
    // total_count is a window function on the same pass, so the count
    // costs nothing extra.
    total: results[0]?.total_count ?? 0,
  };
}

/** Everything the filter sheet needs, in one round trip. */
export async function getFilterOptions(): Promise<{
  makes: string[];
  models: string[];
  categories: string[];
  yearRange: [number, number] | null;
}> {
  const supabase = await createSupabaseServer();

  const [{ data: vehicles }, { data: categories }] = await Promise.all([
    supabase.from("vehicles").select("make, model, year"),
    supabase.from("part_catalog").select("category").eq("is_active", true),
  ]);

  const rows = (vehicles ?? []) as { make: string; model: string; year: number }[];

  const makes = [...new Set(rows.map((v) => v.make).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
  const models = [...new Set(rows.map((v) => v.model).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
  const years = rows.map((v) => v.year).filter((y) => Number.isFinite(y));

  const cats = [
    ...new Set(((categories ?? []) as { category: string }[]).map((c) => c.category)),
  ];

  return {
    makes,
    models,
    categories: cats,
    yearRange: years.length ? [Math.min(...years), Math.max(...years)] : null,
  };
}
