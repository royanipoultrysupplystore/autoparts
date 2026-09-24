"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  canWorkTheYard,
  createSupabaseServer,
  getCurrentProfile,
  hasFinanceAccess,
} from "@/lib/supabase/server";
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

/**
 * Only the owner may put a figure against a car. For anyone else the
 * cost fields are not on the form at all, and are forced to zero here as
 * well -- a form is a suggestion, and this runs on the server. The RLS
 * policy refuses a non-zero cost from a non-owner regardless, so this
 * exists to give a clear result rather than a policy violation.
 */
function readVehicleForm(fd: FormData, canPrice: boolean) {
  const fieldErrors: Record<string, string> = {};

  const year = Number(str(fd, "year"));
  const make = str(fd, "make");
  const model = str(fd, "model");

  // A car branded non-repairable or written off can never be road-legal
  // again, so it cannot be on the repair-and-sell path whatever the form
  // said. The UI already forces this; the server does not take its word.
  const title_status = str(fd, "title_status") ?? "unknown";
  const plan =
    title_status === "non_repairable" || title_status === "write_off"
      ? "part_out"
      : (str(fd, "plan") ?? "part_out");

  // Likewise a status that does not belong to the plan.
  const rawStatus = str(fd, "status") ?? (plan === "repair_and_sell" ? "incoming" : "parting_out");
  const status =
    plan === "repair_and_sell"
      ? rawStatus === "parting_out" || rawStatus === "depleted"
        ? "incoming"
        : rawStatus
      : rawStatus === "sold"
        ? "depleted"
        : rawStatus;

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
    title_status,
    plan,
    purchase_price_cents: canPrice ? cents(fd, "purchase_price") : 0,
    auction_fee_cents: canPrice ? cents(fd, "auction_fee") : 0,
    transport_cost_cents: canPrice ? cents(fd, "transport_cost") : 0,
    other_acquisition_cost_cents: canPrice ? cents(fd, "other_acquisition_cost") : 0,
    // What the whole car went for. Only ever non-zero on a car that was
    // repaired and sold rather than stripped, and only the owner may set
    // it -- the RLS policy refuses a priced insert from anyone else.
    sale_price_cents: canPrice && plan === "repair_and_sell" ? cents(fd, "sale_price") : 0,
    sold_on: plan === "repair_and_sell" ? str(fd, "sold_on") : null,
    sold_to: plan === "repair_and_sell" ? str(fd, "sold_to") : null,
    // Not asked when adding a car -- it is in the yard to be parted out.
    // The edit form supplies it when a car needs retiring.
    status,
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
  if (!canWorkTheYard(profile)) {
    return { ok: false, error: "You are not signed in." };
  }

  const { values, fieldErrors } = readVehicleForm(formData, hasFinanceAccess(profile));
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

  // A car bought to fix and resell is never stripped, so it gets no parts
  // list. Generating 239 rows for it would put phantom inventory in every
  // search and drag the yard totals off.
  const partingOut = values.plan === "part_out";

  // Copying an earlier car of the same make and model starts from a list
  // somebody has already trimmed and priced, rather than from all 239.
  const copyFrom = str(formData, "copy_from");

  if (partingOut) {
    const { error: genError } = copyFrom
      ? await supabase.rpc("copy_parts_from_vehicle", {
          p_source_vehicle_id: copyFrom,
          p_target_vehicle_id: vehicle.id,
        })
      : await supabase.rpc("generate_parts_for_vehicle", {
          p_vehicle_id: vehicle.id,
        });

    if (genError) {
      return {
        ok: false,
        error:
          `${vehicle.stock_number} was saved, but its parts could not be ` +
          `${copyFrom ? "copied" : "generated"}: ${genError.message}. ` +
          `Open the vehicle and try again.`,
      };
    }
  }

  await supabase.rpc("log_activity", {
    p_entity_type: "vehicle",
    p_entity_id: vehicle.id,
    p_action: "created",
    p_summary:
      `Added ${vehicleLabel(vehicle)} (${vehicle.stock_number})` +
      (partingOut ? "" : " to repair and sell"),
    p_before: null,
    p_after: { stock_number: vehicle.stock_number, plan: values.plan },
  });

  revalidatePath("/vehicles");
  revalidatePath("/");
  redirect(partingOut ? `/vehicles/${vehicle.id}/trim` : `/vehicles/${vehicle.id}`);
}

export async function updateVehicle(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!hasFinanceAccess(profile)) {
    return { ok: false, error: "Only the owner can change a vehicle." };
  }

  const id = formData.get("id");
  if (typeof id !== "string") return { ok: false, error: "Missing vehicle." };

  const { values, fieldErrors } = readVehicleForm(formData, true);
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
    return { ok: false, error: "Only the owner can delete a vehicle." };
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
  if (!canWorkTheYard(profile)) return { ok: false, error: "Not allowed." };

  const supabase = await createSupabaseServer();
  const { error } = await supabase.rpc("generate_parts_for_vehicle", {
    p_vehicle_id: vehicleId,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/vehicles/${vehicleId}`);
  return { ok: true };
}

/**
 * A car repaired and sold whole.
 *
 * The same job as marking a part sold, and until now the only way to do
 * it was to open the edit form, know to set the status to "Sold whole",
 * and then fill in a section that only appeared once you had. It may as
 * well not have existed.
 *
 * Owner only: this is a price, and prices are the owner's. The RLS policy
 * refuses a priced update from anyone else regardless.
 */
export async function sellVehicle(
  vehicleId: string,
  input: {
    price: string;
    soldOn?: string | null;
    soldTo?: string | null;
    notes?: string | null;
  },
): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!hasFinanceAccess(profile)) {
    return { ok: false, error: "Only the owner can record a vehicle sale." };
  }

  const priceCents = parseMoneyToCents(input.price);
  if (priceCents === null || priceCents <= 0) {
    return { ok: false, error: "Enter what the car sold for." };
  }

  const supabase = await createSupabaseServer();

  const { data: before } = await supabase
    .from("vehicles")
    .select("stock_number, year, make, model, plan, status, notes")
    .eq("id", vehicleId)
    .single();

  const { error } = await supabase
    .from("vehicles")
    .update({
      sale_price_cents: priceCents,
      sold_on: input.soldOn || new Date().toISOString().slice(0, 10),
      sold_to: input.soldTo || null,
      status: "sold",
      // Appended, never replaced: whatever was written about the car when
      // it came in is worth more than a line about how it left.
      notes: input.notes
        ? [before?.notes, input.notes].filter(Boolean).join("\n\n")
        : (before?.notes ?? null),
    })
    .eq("id", vehicleId);

  if (error) return { ok: false, error: error.message };

  await supabase.rpc("log_activity", {
    p_entity_type: "vehicle",
    p_entity_id: vehicleId,
    p_action: "sold",
    p_summary:
      `Sold ${before ? vehicleLabel(before) : "a vehicle"} ` +
      `(${before?.stock_number ?? "?"}) whole for $${(priceCents / 100).toFixed(2)}`,
    p_before: { status: before?.status ?? null },
    p_after: { status: "sold", sale_price_cents: priceCents, sold_to: input.soldTo },
  });

  revalidatePath(`/vehicles/${vehicleId}`);
  revalidatePath("/vehicles");
  revalidatePath("/reports");
  revalidatePath("/");
  return { ok: true };
}

/** A car already in the yard whose parts list this one could start from. */
export type PartsTemplate = {
  vehicle_id: string;
  stock_number: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  parts_total: number;
  parts_priced: number;
  purchase_date: string;
};

/**
 * Have we done one of these before?
 *
 * Called from the add form as the make and model are typed, so it has to
 * be cheap and it has to return nothing rather than fail -- a lookup that
 * errors must not stop somebody booking a car in.
 */
export async function findPartsTemplate(
  make: string,
  model: string,
  year?: number | null,
): Promise<PartsTemplate | null> {
  const profile = await getCurrentProfile();
  if (!canWorkTheYard(profile)) return null;
  if (!make.trim() || !model.trim()) return null;

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("find_parts_template", {
    p_make: make.trim(),
    p_model: model.trim(),
    p_year: year ?? null,
  });

  if (error) return null;
  return ((data as PartsTemplate[])?.[0]) ?? null;
}
