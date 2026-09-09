"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServer, getCurrentProfile } from "@/lib/supabase/server";
import { parseMoneyToCents } from "@/lib/money";
import type { PaymentMethod, SaleChannel, WriteResult } from "@/types/db";

/**
 * Selling and holding parts.
 *
 * Both go through database functions whose UPDATE carries its own status
 * guard, so two partners hitting the same part at the same moment cannot
 * both win. The loser gets a payload naming who beat them, when, and for
 * how much -- never a silent failure and never a second sale.
 */

export type SellInput = {
  partId: string;
  priceInput: string;
  paymentMethod: PaymentMethod;
  buyerName?: string;
  buyerContact?: string;
  channel: SaleChannel;
  notes?: string;
  soldBy?: string;
  saleDate?: string;
};

export type SellResult =
  | { ok: true }
  | { ok: false; kind: "validation" | "conflict" | "error"; message: string; detail?: string };

export async function sellPart(input: SellInput): Promise<SellResult> {
  const profile = await getCurrentProfile();
  if (!profile?.is_active) {
    return { ok: false, kind: "error", message: "You are not signed in." };
  }

  const cents = parseMoneyToCents(input.priceInput);
  if (cents === null || cents < 0) {
    return { ok: false, kind: "validation", message: "Enter the sale price." };
  }

  const supabase = await createSupabaseServer();

  const { data, error } = await supabase.rpc("sell_part", {
    p_part_id: input.partId,
    p_sale_price_cents: cents,
    p_payment_method: input.paymentMethod,
    p_buyer_name: input.buyerName ?? null,
    p_buyer_contact: input.buyerContact ?? null,
    p_channel: input.channel,
    p_notes: input.notes ?? null,
    p_sold_by: input.soldBy ?? profile.id,
    p_sale_date: input.saleDate ?? null,
  });

  if (error) {
    return { ok: false, kind: "error", message: "The sale could not be saved.", detail: error.message };
  }

  const result = data as WriteResult;

  if (!result.ok) {
    return { ok: false, ...describeConflict(result) };
  }

  revalidatePath("/search");
  revalidatePath("/");
  revalidatePath("/reports");
  return { ok: true };
}

export async function reservePart(
  partId: string,
  buyerName: string,
  hours = 48,
): Promise<SellResult> {
  const profile = await getCurrentProfile();
  if (!profile?.is_active) {
    return { ok: false, kind: "error", message: "You are not signed in." };
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("reserve_part", {
    p_part_id: partId,
    p_buyer_name: buyerName || null,
    p_hours: hours,
  });

  if (error) {
    return { ok: false, kind: "error", message: "The hold could not be placed.", detail: error.message };
  }

  const result = data as WriteResult;
  if (!result.ok) return { ok: false, ...describeConflict(result) };

  revalidatePath("/search");
  revalidatePath("/");
  return { ok: true };
}

export async function releaseReservation(partId: string): Promise<SellResult> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("release_reservation", { p_part_id: partId });

  if (error) {
    return { ok: false, kind: "error", message: "Could not release the hold.", detail: error.message };
  }

  const result = data as WriteResult;
  if (!result.ok) {
    return { ok: false, kind: "conflict", message: "That part is not on hold any more." };
  }

  revalidatePath("/search");
  return { ok: true };
}

/**
 * Turns a losing conditional write into the sentence a partner needs to
 * read out loud to the customer standing in front of them.
 */
function describeConflict(
  result: Extract<WriteResult, { ok: false }>,
): { kind: "conflict" | "error"; message: string; detail?: string } {
  if (result.reason === "not_found") {
    return { kind: "error", message: "That part is no longer in the system." };
  }

  if (result.status === "sold") {
    const who = result.sold_by_name ?? "someone";
    const price =
      typeof result.sale_price_cents === "number"
        ? ` for $${(result.sale_price_cents / 100).toFixed(2)}`
        : "";
    return {
      kind: "conflict",
      message: `Already sold by ${who}${price}.`,
      detail: result.sold_at,
    };
  }

  if (result.status === "reserved") {
    const who = result.reserved_by_name ?? "someone";
    const forWhom = result.reserved_for_name ? ` for ${result.reserved_for_name}` : "";
    return {
      kind: "conflict",
      message: `${who} has this on hold${forWhom}.`,
      detail: result.reserved_until,
    };
  }

  return {
    kind: "conflict",
    message: `That part is marked ${result.status ?? "unavailable"}.`,
  };
}
