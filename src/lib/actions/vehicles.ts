"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServer, getCurrentProfile, hasFinanceAccess } from "@/lib/supabase/server";
import { parseMoneyToCents } from "@/lib/money";
import { vehicleLabel } from "@/lib/format";

export type ActionState = { ok: boolean; error?: string; fieldErrors?: Record<string, string> };

const str = (fd: FormData, key: string): string | null => {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
};

const cents = (fd: FormData, key: string): number => parseMoneyToCents(str(fd, key) ?? "0") ?? 0;

function readVehicleForm(fd: FormData) {
  const fieldErrors: Record<string, string> = {};

  const year = Number(str(fd, "year"));
  const make = str(fd, "make");
  const model = str(fd, "model");

  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    fieldErrors.year = "Enter a model year.";
  }
  if (!make) fieldErrors.make = "Which make?";
  if (!model) fieldErrors.model = "Which model?";

  const mileageRaw = str(fd, "mileage_km");
  const mileage_km = mileageRaw ? Number(mileageRaw.replace(/[,\s]/g, "")) : null;
  if (mileage_km !== null && (!Number.isFinite(mileage_km) || mileage_km < 0)) {
    fieldErrors.mileage_km = "Mileage must be a number.";
  }

  const values = {
    vin: str(fd, "vin")?.toUpperCase() ?? null,
    year,
    make,
    model,
    trim: str(fd, "trim"),
    body_type: str(fd, "body_type"),
    engine: str(fd, "engine"),
    transmission: str(fd, "transmission"),
    drivetrain: str(fd, "drivetrain"),
    fuel_type: str(fd, "fuel_type") ?? "gas",
    exterior_colour: str(fd, "exterior_colour"),
    mileage_km,
    purchase_date: str(fd, "purchase_date"),
    source: str(fd, "source") ?? "icbc_auction",
    lot_number: str(fd, "lot_number"),
    purchase_price_cents: cents(fd, "purchase_price"),
    auction_fee_cents: cents(fd, "auction_fee"),
    transport_cost_cents: cents(fd, "transport_cost"),
    other_acquisition_cost_cents: cents(fd, "other_acquisition_cost"),
    scrap_income_cents: cents(fd, "scrap_income"),
    status: str(fd, "status") ?? "parting_out",
    notes: str(fd, "notes"),
  };

  return { values, fieldErrors };
}

/**
 * Create the vehicle, then immediately generate one part row per active
 * catalog entry. The partner lands on the trim screen next, where they
 * take away whatever the car does not have.
 */
export async function createVehicle(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!hasFinanceAccess(profile)) {
    return { ok: false, error: "Only owners and partners can add a vehicle." };
  }

  const { values, fieldErrors } = readVehicleForm(formData);
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };

  const supabase = await createSupabaseServer();

  const { data: vehicle, error } = await supabase
    .from("vehicles")
    .insert({ ...values, created_by: profile!.id })
    .select("id, stock_number, year, make, model")
    .single();

  if (error) {
    if (error.code === "23505" && error.message.includes("vin")) {
      return { ok: false, fieldErrors: { vin: "That VIN is already in the yard." } };
    }
    return { ok: false, error: error.message };
  }

  const { error: genError } = await supabase.rpc("generate_parts_for_vehicle", {
    p_vehicle_id: vehicle.id,
  });

  if (genError) {
    return {
      ok: false,
      error:
        `${vehicle.stock_number} was saved, but its parts could not be generated: ` +
        `${genError.message}. Open the vehicle and try again.`,
    };
  }

  await supabase.rpc("log_activity", {
    p_entity_type: "vehicle",
    p_entity_id: vehicle.id,
    p_action: "created",
    p_summary: `Added ${vehicleLabel(vehicle)} (${vehicle.stock_number})`,
    p_before: null,
    p_after: { stock_number: vehicle.stock_number },
  });

  revalidatePath("/vehicles");
  revalidatePath("/");
  redirect(`/vehicles/${vehicle.id}/trim`);
}

export async function updateVehicle(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!hasFinanceAccess(profile)) {
    return { ok: false, error: "Only owners and partners can edit a vehicle." };
  }

  const id = formData.get("id");
  if (typeof id !== "string") return { ok: false, error: "Missing vehicle." };

  const { values, fieldErrors } = readVehicleForm(formData);
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };

  const supabase = await createSupabaseServer();

  const { data: before } = await supabase
    .from("vehicles")
    .select("status, year, make, model, stock_number")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("vehicles").update(values).eq("id", id);

  if (error) {
    if (error.code === "23505" && error.message.includes("vin")) {
      return { ok: false, fieldErrors: { vin: "That VIN is already in the yard." } };
    }
    return { ok: false, error: error.message };
  }

  await supabase.rpc("log_activity", {
    p_entity_type: "vehicle",
    p_entity_id: id,
    p_action: "updated",
    p_summary: `Updated ${before?.stock_number ?? "vehicle"}`,
    p_before: before ? { status: before.status } : null,
    p_after: { status: values.status },
  });

  revalidatePath(`/vehicles/${id}`);
  revalidatePath("/vehicles");
  redirect(`/vehicles/${id}`);
}

/**
 * Destructive: takes the vehicle and every part, sale, and expense
 * attached to it. Confirmed in the UI, logged here.
 */
export async function deleteVehicle(id: string): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!hasFinanceAccess(profile)) {
    return { ok: false, error: "Only owners and partners can delete a vehicle." };
  }

  const supabase = await createSupabaseServer();

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("stock_number, year, make, model")
    .eq("id", id)
    .single();

  const { count: soldCount } = await supabase
    .from("sales")
    .select("id", { count: "exact", head: true })
    .eq("vehicle_id", id);

  if ((soldCount ?? 0) > 0) {
    return {
      ok: false,
      error:
        `${vehicle?.stock_number ?? "This vehicle"} has ${soldCount} recorded ` +
        `sale${soldCount === 1 ? "" : "s"}. Deleting it would erase that revenue from ` +
        `every report. Mark it scrapped or depleted instead.`,
    };
  }

  // Log before the row is gone, so the entry survives the cascade.
  await supabase.rpc("log_activity", {
    p_entity_type: "vehicle",
    p_entity_id: id,
    p_action: "deleted",
    p_summary: `Deleted ${vehicle ? vehicleLabel(vehicle) : "a vehicle"} (${vehicle?.stock_number ?? "?"}) and all of its parts`,
    p_before: vehicle ?? null,
    p_after: null,
  });

  const { error } = await supabase.from("vehicles").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/vehicles");
  revalidatePath("/");
  return { ok: true };
}

/** Re-run generation for a vehicle whose parts failed to create. */
export async function regenerateParts(vehicleId: string): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!hasFinanceAccess(profile)) return { ok: false, error: "Not allowed." };

  const supabase = await createSupabaseServer();
  const { error } = await supabase.rpc("generate_parts_for_vehicle", {
    p_vehicle_id: vehicleId,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/vehicles/${vehicleId}`);
  return { ok: true };
}
