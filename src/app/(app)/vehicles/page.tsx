import Link from "next/link";
import { Car, Plus } from "lucide-react";
import { listVehicles } from "@/lib/data/vehicles";
import { getCurrentProfile, hasFinanceAccess } from "@/lib/supabase/server";
import { AppHeader } from "@/components/nav/app-header";
import { EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { VehicleCard } from "@/components/vehicles/vehicle-card";
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
          vehicles.map((v) => <VehicleCard key={v.id} vehicle={v} />)
        )}
      </div>
    </>
  );
}
