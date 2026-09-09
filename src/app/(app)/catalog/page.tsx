import { createSupabaseServer } from "@/lib/supabase/server";
import { AppHeader } from "@/components/nav/app-header";
import { Card, EmptyState, SectionHeading } from "@/components/ui/primitives";
import { PartIcon, categoryColour } from "@/lib/icons/part-icons";
import { SIDE_SHORT } from "@/lib/format";
import { cn } from "@/lib/utils";
import { generatedPartCount } from "@/lib/part-catalog-seed";
import type { PartCatalogEntry } from "@/types/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Parts catalog" };

/**
 * The catalog is the template every vehicle's parts list is generated
 * from. It is read-only here on purpose: editing an entry changes what
 * future cars generate, and that is a decision worth making deliberately
 * rather than by fat-fingering a row on a phone.
 */
export default async function CatalogPage() {
  const supabase = await createSupabaseServer();

  const { data } = await supabase
    .from("part_catalog")
    .select("*")
    .order("sort_order");

  const entries = (data ?? []) as PartCatalogEntry[];
  const active = entries.filter((e) => e.is_active);

  const groups = new Map<string, PartCatalogEntry[]>();
  for (const e of entries) {
    const list = groups.get(e.category);
    if (list) list.push(e);
    else groups.set(e.category, [e]);
  }

  const generated = active.reduce((n, e) => n + e.default_sides.length, 0);

  return (
    <>
      <AppHeader
        title="Parts catalog"
        subtitle={`${active.length} active entries · ${generated} parts per vehicle`}
        back={{ href: "/more" }}
      />

      <div className="space-y-4 px-3 py-4">
        {entries.length === 0 ? (
          <EmptyState
            title="The catalog is empty"
            body={`Run "npm run seed" to load the ${generatedPartCount()}-part template. Vehicles cannot generate their parts list without it.`}
          />
        ) : (
          <>
            <Card className="p-3.5">
              <p className="text-[13px] leading-relaxed text-ink-muted">
                Every new vehicle generates one part per active entry below,
                multiplied by its sides. Renaming an entry only affects cars
                added afterwards — parts already in inventory keep the name they
                were created with.
              </p>
            </Card>

            {[...groups.entries()].map(([category, items]) => {
              const colour = categoryColour(category);
              return (
                <section key={category} className="space-y-2">
                  <SectionHeading
                    action={
                      <span className="tnum text-[12.5px] text-ink-subtle">
                        {items.reduce(
                          (n, e) => n + (e.is_active ? e.default_sides.length : 0),
                          0,
                        )}{" "}
                        parts
                      </span>
                    }
                  >
                    {category}
                  </SectionHeading>

                  <Card className="divide-y divide-line overflow-hidden">
                    {items.map((e) => (
                      <div
                        key={e.id}
                        className={cn(
                          "flex items-center gap-3 px-3.5 py-2.5",
                          !e.is_active && "opacity-45",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-lg",
                            colour.bg,
                            colour.fg,
                          )}
                        >
                          <PartIcon iconKey={e.icon_key} category={e.category} size={18} />
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14.5px] text-ink">
                            {e.name}
                          </span>
                          {e.default_sides.length > 1 || e.default_sides[0] !== "none" ? (
                            <span className="mt-0.5 block text-[12px] text-ink-subtle">
                              {e.default_sides.map((s) => SIDE_SHORT[s]).join(" · ")}
                            </span>
                          ) : null}
                        </span>

                        {e.is_high_value && (
                          <span className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-accent">
                            High value
                          </span>
                        )}

                        {!e.is_active && (
                          <span className="shrink-0 text-[11px] font-medium uppercase text-ink-subtle">
                            Retired
                          </span>
                        )}
                      </div>
                    ))}
                  </Card>
                </section>
              );
            })}
          </>
        )}
      </div>
    </>
  );
}
