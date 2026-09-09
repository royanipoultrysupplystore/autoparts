import { redirect } from "next/navigation";
import { getCurrentProfile, hasFinanceAccess } from "@/lib/supabase/server";
import { getMakesInYard } from "@/lib/data/vehicles";
import { createVehicle } from "@/lib/actions/vehicles";
import { AppHeader } from "@/components/nav/app-header";
import { VehicleForm } from "@/components/vehicles/vehicle-form";
import { generatedPartCount } from "@/lib/part-catalog-seed";

export const dynamic = "force-dynamic";

export const metadata = { title: "Add a vehicle" };

export default async function NewVehiclePage() {
  const profile = await getCurrentProfile();
  if (!hasFinanceAccess(profile)) redirect("/vehicles");

  const yardMakes = await getMakesInYard();

  return (
    <>
      <AppHeader
        title="Add a vehicle"
        subtitle={`Generates up to ${generatedPartCount()} parts`}
        back={{ href: "/vehicles" }}
      />
      <VehicleForm
        action={createVehicle}
        yardMakes={yardMakes}
        submitLabel="Save and build the parts list"
      />
    </>
  );
}
