import Link from "next/link";
import { Car, Plus } from "lucide-react";
import { listVehicles } from "@/lib/data/vehicles";
import { getCurrentProfile, hasFinanceAccess } from "@/lib/supabase/server";
import { AppHeader } from "@/components/nav/app-header";
import { Card, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { VehicleStatusPill } from "@/components/ui/status-pill";
import { formatDate, formatKm, vehicleLabel } from "@/lib/format";
import { VehicleFilterBar } from "./filter-bar";

export const dynamic = "force-dynamic";

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const params = await searchParams;
  const profile = await getCurrentProfile();
  const finance = hasFinanceAccess(profile);

  const statusFilter =
    params.status && params.status !== "all" ? params.status.split(",") : undefined;

  const vehicles = await listVehicles({ status: statusFilter, search: params.q });

  return (
    <>
      <AppHeader
        title="Vehicles"
        subtitle={`${vehicles.length} ${vehicles.length === 1 ? "vehicle" : "vehicles"}`}
        action={
          finance ? (
            <Button asChild size="sm" variant="subtle">
              <Link href="/vehicles/new">
                <Plus className="size-4" />
                Add
              </Link>
            </Button>
          ) : undefined
        }
      />

      <VehicleFilterBar />

      <div className="space-y-2.5 px-3 py-3">
        {vehicles.length === 0 ? (
          params.q || params.status ? (
            <EmptyState
              icon={<Car className="size-7" />}
              title="Nothing matches that"
              body="Try a different make, model, or stock number — or clear the filters."
              action={{ label: "Show all vehicles", href: "/vehicles" }}
            />
          ) : (
            <EmptyState
              icon={<Car className="size-7" />}
              title="No vehicles yet"
              body="Add the first car from the auction. The system will build its whole parts list for you, and you trim off what it doesn't have."
              action={
                finance ? { label: "Add a vehicle", href: "/vehicles/new" } : undefined
              }
            />
          )
        ) : (
          vehicles.map((v) => (
            <Link key={v.id} href={`/vehicles/${v.id}`} className="block">
              <Card className="p-3.5 active:bg-surface-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[16px] font-semibold leading-snug text-ink">
                      {vehicleLabel(v)}
                    </h2>
                    <p className="tnum mt-0.5 text-[12.5px] text-ink-muted">
                      {v.stock_number}
                      {v.vin ? ` · VIN …${v.vin.slice(-6)}` : ""}
                      {v.exterior_colour ? ` · ${v.exterior_colour}` : ""}
                    </p>
                  </div>
                  <VehicleStatusPill status={v.status} />
                </div>

                <div className="mt-3 flex items-center gap-4 text-[12.5px] text-ink-muted">
                  <span className="tnum">{formatKm(v.mileage_km)}</span>
                  <span className="tnum">In {formatDate(v.purchase_date)}</span>
                </div>

                {v.parts_total > 0 && (
                  <div className="mt-3">
                    <div className="flex items-baseline justify-between text-[12.5px]">
                      <span className="tnum text-ink-muted">
                        <span className="font-semibold text-ink">{v.parts_available}</span> on the
                        shelf · {v.parts_sold} sold
                      </span>
                      <span className="tnum text-ink-subtle">
                        {Math.round((v.parts_sold / v.parts_total) * 100)}% moved
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-sunk">
                      <div
                        className="h-full rounded-full bg-available transition-[width]"
                        style={{ width: `${(v.parts_sold / v.parts_total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {v.parts_total === 0 && (
                  <p className="mt-2.5 rounded-lg bg-reserved-soft px-2.5 py-1.5 text-[12.5px] text-reserved">
                    No parts generated yet — open this vehicle to build its list.
                  </p>
                )}
              </Card>
            </Link>
          ))
        )}
      </div>
    </>
  );
}
