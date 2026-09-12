import { notFound, redirect } from "next/navigation";
import { canWorkTheYard, createSupabaseServer, getCurrentProfile } from "@/lib/supabase/server";
import { getVehicle } from "@/lib/data/vehicles";
import { AppHeader } from "@/components/nav/app-header";
import { EmptyState } from "@/components/ui/primitives";
import { vehicleLabel } from "@/lib/format";
import { TrimList, type TrimPart } from "./trim-list";
import type { Part } from "@/types/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Trim the list" };

export default async function TrimPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const profile = await getCurrentProfile();
  if (!canWorkTheYard(profile)) redirect(`/vehicles/${id}`);

  const vehicle = await getVehicle(id);
  if (!vehicle) notFound();

  const supabase = await createSupabaseServer();

  // Only untouched parts can be trimmed away; anything sold or reserved
  // stays, and the RPC enforces that too.
  const { data: parts } = await supabase
    .from("parts")
    .select("id, name, category, icon_key, side, catalog_id")
    .eq("vehicle_id", id)
    .eq("status", "available")
    .order("category")
    .order("name")
    .order("side");

  const rows = (parts ?? []) as (Pick<
    Part,
    "id" | "name" | "category" | "icon_key" | "side"
  > & { catalog_id: string | null })[];

  if (rows.length === 0) {
    return (
      <>
        <AppHeader
          title="Trim the list"
          subtitle={vehicleLabel(vehicle)}
          back={{ href: `/vehicles/${id}` }}
        />
        <div className="px-3 py-4">
          <EmptyState
            title="Nothing left to trim"
            body="Every part on this vehicle is already priced, held, or sold. You can still add or remove individual parts from the vehicle screen."
            action={{ label: "Open the vehicle", href: `/vehicles/${id}` }}
          />
        </div>
      </>
    );
  }

  // High-value flags come from the catalog, matched on the id the part
  // was generated from -- never on the name, which is a snapshot.
  const catalogIds = [...new Set(rows.map((r) => r.catalog_id).filter(Boolean))] as string[];
  const { data: catalog } = await supabase
    .from("part_catalog")
    .select("id, is_high_value")
    .in("id", catalogIds.length ? catalogIds : ["00000000-0000-0000-0000-000000000000"]);

  const highValue = new Set(
    (catalog ?? []).filter((c) => c.is_high_value).map((c) => c.id as string),
  );

  const trimParts: TrimPart[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    icon_key: r.icon_key,
    side: r.side,
    is_high_value: r.catalog_id ? highValue.has(r.catalog_id) : false,
  }));

  return (
    <>
      <AppHeader
        title="Trim the list"
        subtitle={`${vehicleLabel(vehicle)} · ${vehicle.stock_number}`}
        back={{ href: `/vehicles/${id}` }}
      />

      <div className="border-b border-line bg-accent-soft px-4 py-3">
        <p className="text-[13.5px] leading-relaxed text-accent">
          Everything is kept by default. Untick whatever this car doesn&apos;t have
          or arrived wrecked — those rows get deleted when you save.
        </p>
      </div>

      <TrimList
        vehicleId={id}
        parts={trimParts}
        vehicleName={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
      />
    </>
  );
}
