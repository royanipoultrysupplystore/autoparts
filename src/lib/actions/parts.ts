"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServer, getCurrentProfile, hasFinanceAccess } from "@/lib/supabase/server";
import { parseMoneyToCents } from "@/lib/money";
import { partTitle } from "@/lib/format";
import type { PartCondition, PartSide, PartStatus } from "@/types/db";

export type ActionState = { ok: boolean; error?: string; removed?: number };

/**
 * The trim screen's save. One round trip for the whole car.
 *
 * Takes the ids to remove, not the ids to keep, so a part another partner
 * added while this screen was open cannot be swept away by accident.
 */
export async function trimVehicleParts(
  vehicleId: string,
  removeIds: string[],
): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!profile?.is_active) return { ok: false, error: "Not signed in." };

  const supabase = await createSupabaseServer();

  if (removeIds.length === 0) {
    revalidatePath(`/vehicles/${vehicleId}`);
    return { ok: true, removed: 0 };
  }

  const { data, error } = await supabase.rpc("trim_vehicle_parts", {
    p_vehicle_id: vehicleId,
    p_remove_ids: removeIds,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/vehicles/${vehicleId}`);
  revalidatePath("/");
  return { ok: true, removed: (data as number) ?? 0 };
}

export type PartPatch = {
  asking_price_cents?: number;
  condition?: PartCondition;
  shelf_location?: string | null;
  notes?: string | null;
  name?: string;
};

export async function updatePart(partId: string, patch: PartPatch): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!profile?.is_active) return { ok: false, error: "Not signed in." };

  const supabase = await createSupabaseServer();

  const { data: before } = await supabase
    .from("parts")
    .select("id, vehicle_id, name, side, asking_price_cents, condition, shelf_location, status")
    .eq("id", partId)
    .single();

  if (!before) return { ok: false, error: "That part is gone." };
  if (before.status === "sold") {
    return { ok: false, error: "This part is sold. Its record is history now." };
  }

  const { error } = await supabase.from("parts").update(patch).eq("id", partId);
  if (error) return { ok: false, error: error.message };

  // Price changes are logged individually -- they matter to the reports.
  if (
    patch.asking_price_cents !== undefined &&
    patch.asking_price_cents !== before.asking_price_cents
  ) {
    await supabase.rpc("log_activity", {
      p_entity_type: "part",
      p_entity_id: partId,
      p_action: "price_changed",
      p_summary: `Repriced ${partTitle(before.name, before.side as PartSide)} to $${(
        patch.asking_price_cents / 100
      ).toFixed(2)}`,
      p_before: { asking_price_cents: before.asking_price_cents },
      p_after: { asking_price_cents: patch.asking_price_cents },
    });
  }

  revalidatePath(`/vehicles/${before.vehicle_id}`);
  revalidatePath("/search");
  return { ok: true };
}

/** Bulk price a whole category at once -- pricing 200 parts one by one is nobody's afternoon. */
export async function bulkSetPrices(
  partIds: string[],
  priceInput: string,
): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!profile?.is_active) return { ok: false, error: "Not signed in." };

  const cents = parseMoneyToCents(priceInput);
  if (cents === null || cents < 0) return { ok: false, error: "Enter a price." };
  if (partIds.length === 0) return { ok: false, error: "Nothing selected." };

  const supabase = await createSupabaseServer();

  const { error } = await supabase
    .from("parts")
    .update({ asking_price_cents: cents })
    .in("id", partIds)
    .neq("status", "sold");

  if (error) return { ok: false, error: error.message };

  await supabase.rpc("log_activity", {
    p_entity_type: "part",
    p_entity_id: null,
    p_action: "bulk_priced",
    p_summary: `Priced ${partIds.length} parts at $${(cents / 100).toFixed(2)}`,
    p_before: null,
    p_after: { count: partIds.length, asking_price_cents: cents },
  });

  revalidatePath("/search");
  return { ok: true };
}

export async function setPartStatus(
  partId: string,
  status: Exclude<PartStatus, "sold">,
): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!profile?.is_active) return { ok: false, error: "Not signed in." };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("set_part_status", {
    p_part_id: partId,
    p_status: status,
  });

  if (error) return { ok: false, error: error.message };

  const result = data as { ok: boolean; reason?: string };
  if (!result.ok) {
    return { ok: false, error: "That part has already been sold." };
  }

  revalidatePath("/search");
  return { ok: true };
}

/** Destructive. Confirmed in the UI, logged here. Sold parts stay put. */
export async function deletePart(partId: string): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!hasFinanceAccess(profile)) {
    return { ok: false, error: "Only owners and partners can delete a part." };
  }

  const supabase = await createSupabaseServer();

  const { data: part } = await supabase
    .from("parts")
    .select("id, vehicle_id, name, side, status")
    .eq("id", partId)
    .single();

  if (!part) return { ok: false, error: "That part is already gone." };
  if (part.status === "sold") {
    return {
      ok: false,
      error: "This part is sold. Deleting it would remove the sale from every report.",
    };
  }

  await supabase.rpc("log_activity", {
    p_entity_type: "part",
    p_entity_id: partId,
    p_action: "deleted",
    p_summary: `Deleted ${partTitle(part.name, part.side as PartSide)}`,
    p_before: { name: part.name, status: part.status },
    p_after: null,
  });

  const { error } = await supabase.from("parts").delete().eq("id", partId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/vehicles/${part.vehicle_id}`);
  revalidatePath("/search");
  return { ok: true };
}

/** Add a part the generator did not create, from the catalog or by hand. */
export async function addPart(
  vehicleId: string,
  input: {
    catalogId?: string | null;
    name: string;
    category: string;
    iconKey?: string;
    side: PartSide;
    condition: PartCondition;
    priceInput?: string;
    shelfLocation?: string | null;
  },
): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!profile?.is_active) return { ok: false, error: "Not signed in." };
  if (!input.name.trim()) return { ok: false, error: "Give the part a name." };

  const supabase = await createSupabaseServer();

  const { error } = await supabase.from("parts").insert({
    vehicle_id: vehicleId,
    catalog_id: input.catalogId ?? null,
    name: input.name.trim(),
    category: input.category,
    icon_key: input.iconKey ?? "generic-part",
    side: input.side,
    condition: input.condition,
    asking_price_cents: parseMoneyToCents(input.priceInput ?? "0") ?? 0,
    shelf_location: input.shelfLocation ?? null,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "That part and side already exist on this vehicle." };
    }
    return { ok: false, error: error.message };
  }

  await supabase.rpc("log_activity", {
    p_entity_type: "part",
    p_entity_id: null,
    p_action: "added",
    p_summary: `Added ${partTitle(input.name.trim(), input.side)}`,
    p_before: null,
    p_after: { name: input.name.trim(), side: input.side },
  });

  revalidatePath(`/vehicles/${vehicleId}`);
  return { ok: true };
}

/** Storefront bulk action. Owners and partners only -- the RPC re-checks. */
export async function publishParts(
  partIds: string[],
  publish: boolean,
): Promise<ActionState> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("publish_parts", {
    p_part_ids: partIds,
    p_publish: publish,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/vehicles");
  revalidatePath("/shop");
  return { ok: true, removed: data as number };
}
