import "server-only";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { PartSide } from "@/types/db";

/** What the "add a part" picker needs -- small enough to send whole. */
export type CatalogOption = {
  id: string;
  name: string;
  category: string;
  icon_key: string;
  default_sides: PartSide[];
  is_high_value: boolean;
};

export async function getActiveCatalog(): Promise<CatalogOption[]> {
  const supabase = await createSupabaseServer();

  const { data } = await supabase
    .from("part_catalog")
    .select("id, name, category, icon_key, default_sides, is_high_value")
    .eq("is_active", true)
    .order("sort_order");

  return (data ?? []) as CatalogOption[];
}

/** The categories a custom part can be filed under. */
export function categoriesFrom(catalog: CatalogOption[]): string[] {
  return [...new Set(catalog.map((c) => c.category))];
}
