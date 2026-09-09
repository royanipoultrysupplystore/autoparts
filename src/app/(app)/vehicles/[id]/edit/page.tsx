import { notFound, redirect } from "next/navigation";
import { getCurrentProfile, hasFinanceAccess } from "@/lib/supabase/server";
import { getMakesInYard, getVehicle, getVehicleFinance } from "@/lib/data/vehicles";
import { updateVehicle } from "@/lib/actions/vehicles";
import { AppHeader } from "@/components/nav/app-header";
import { VehicleForm } from "@/components/vehicles/vehicle-form";
import { vehicleLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function EditVehiclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const profile = await getCurrentProfile();
  if (!hasFinanceAccess(profile)) redirect(`/vehicles/${id}`);

  const [vehicle, finance, yardMakes] = await Promise.all([
    getVehicle(id),
    getVehicleFinance(id),
    getMakesInYard(),
  ]);

  if (!vehicle) notFound();

  return (
    <>
      <AppHeader
        title="Edit vehicle"
        subtitle={`${vehicleLabel(vehicle)} · ${vehicle.stock_number}`}
        back={{ href: `/vehicles/${id}` }}
      />
      <VehicleForm
        action={updateVehicle}
        vehicle={vehicle}
        finance={finance}
        yardMakes={yardMakes}
        submitLabel="Save changes"
      />
    </>
  );
}
