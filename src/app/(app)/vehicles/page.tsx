import Link from "next/link";
import { Car, Plus } from "lucide-react";
import { listVehicles } from "@/lib/data/vehicles";
import { canWorkTheYard, getCurrentProfile } from "@/lib/supabase/server";
import { AppHeader } from "@/components/nav/app-header";
import { EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { VehicleCard } from "@/components/vehicles/vehicle-card";
import { cn } from "@/lib/utils";

/**
 * Two piles of cars, and they are run completely differently: one gets
 * stripped and sold a part at a time, the other gets repaired and sold
 * once. Anyone looking for "the cars we are fixing up" was reduced to
 * opening them one by one.
 */
function PlanFilter({ active }: { active?: string }) {
  const options = [
    { value: undefined, label: "All" },
    { value: "part_out", label: "Parting out" },
    { value: "repair_and_sell", label: "Repair & sell" },
  ];

  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 pb-2.5">
      {options.map((o) => {
        const on = active === o.value;
        return (
          <Link
            key={o.label}
            href={o.value ? `/vehicles?plan=${o.value}` : "/vehicles"}
            scroll={false}
            aria-current={on ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors",
              on
                ? "border-accent bg-accent text-accent-text"
                : "border-line-strong bg-surface text-ink-muted active:bg-surface-2",
            )}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}

export const dynamic = "force-dynamic";

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; plan?: string; q?: string }>;
}) {
  const params = await searchParams;
  const profile = await getCurrentProfile();
  const canAdd = canWorkTheYard(profile);

  const statusFilter =
    params.status && params.status !== "all" ? params.status.split(",") : undefined;

  // Which pile the car is in: stripped for parts, or fixed and sold whole.
  // Not its status -- those chips were taken off this screen on purpose,
  // and "incoming vs parting out" is noise next to "parts or whole car".
  const plan =
    params.plan === "part_out" || params.plan === "repair_and_sell"
      ? params.plan
      : undefined;

  const vehicles = await listVehicles({
    status: statusFilter,
    plan,
    search: params.q,
  });

  return (
    <>
      <AppHeader
        title="Vehicles"
        subtitle={`${vehicles.length} ${vehicles.length === 1 ? "vehicle" : "vehicles"}`}
        close={{ href: "/" }}
        below={<PlanFilter active={plan} />}
        action={
          canAdd ? (
            <Button asChild size="sm" variant="subtle">
              <Link href="/vehicles/new">
                <Plus className="size-4" />
                Add
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-2.5 px-3 py-3">
        {vehicles.length === 0 ? (
          params.q || params.status || plan ? (
            <EmptyState
              icon={<Car className="size-7" />}
              title="Nothing matches that"
              body={
                plan === "repair_and_sell"
                  ? "No cars are on the repair-and-sell path yet. A car is put on it when it's added, or from its edit screen."
                  : "Try a different make, model, or stock number — or clear the filters."
              }
              action={{ label: "Show all vehicles", href: "/vehicles" }}
            />
          ) : (
            <EmptyState
              icon={<Car className="size-7" />}
              title="No vehicles yet"
              body="Add the first car from the auction. The system will build its whole parts list for you, and you trim off what it doesn't have."
              action={
                canAdd ? { label: "Add a vehicle", href: "/vehicles/new" } : undefined
              }
            />
          )
        ) : (
          vehicles.map((v) => <VehicleCard key={v.id} vehicle={v} />)
        )}
      </div>
    </>
  );
}
