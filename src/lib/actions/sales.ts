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

/**
 * The sale stands; the numbers on it were wrong.
 *
 * A yard is not a ledger. Somebody types 180 for an 80 dollar mirror and
 * notices at the end of the shift. The database decides who is allowed to
 * fix it -- the seller for a day, the owner for good -- so this does not
 * repeat that rule, it just reports what came back.
 */
export async function correctSale(
  partId: string,
  input: {
    price: string;
    payment: PaymentMethod;
    channel: SaleChannel;
    saleDate?: string | null;
    buyerName?: string | null;
    notes?: string | null;
  },
): Promise<WriteResult> {
  const profile = await getCurrentProfile();
  if (!profile?.is_active) return { ok: false, reason: "not_signed_in" };

  const cents = parseMoneyToCents(input.price);
  if (cents === null || cents < 0) return { ok: false, reason: "bad_price" };

  const supabase = await createSupabaseServer();

  const { data, error } = await supabase.rpc("update_sale", {
    p_part_id: partId,
    p_sale_price_cents: cents,
    p_payment_method: input.payment,
    p_channel: input.channel,
    p_sale_date: input.saleDate || null,
    p_buyer_name: input.buyerName || null,
    p_notes: input.notes || null,
  });

  if (error) return { ok: false, reason: error.message };

  const result = data as WriteResult;
  if (result.ok) {
    revalidatePath("/search");
    revalidatePath("/reports");
    revalidatePath("/activity");
  }
  return result;
}

/**
 * The part came back and the money went out.
 *
 * The sale row is kept and marked returned rather than deleted: who sold
 * it, for how much, and who took it back is exactly the history you want
 * when the same buyer turns up again. Every revenue figure stops counting
 * it, and the part goes back on the shelf where it can sell again.
 */
export async function returnSale(
  partId: string,
  reason?: string | null,
): Promise<WriteResult> {
  const profile = await getCurrentProfile();
  if (!profile?.is_active) return { ok: false, reason: "not_signed_in" };

  const supabase = await createSupabaseServer();

  const { data, error } = await supabase.rpc("return_sale", {
    p_part_id: partId,
    p_reason: reason || null,
  });

  if (error) return { ok: false, reason: error.message };

  const result = data as WriteResult;
  if (result.ok) {
    revalidatePath("/search");
    revalidatePath("/reports");
    revalidatePath("/activity");
  }
  return result;
}

export type LiveSale = {
  id: string;
  sale_price_cents: number;
  sale_date: string;
  payment_method: PaymentMethod;
  channel: SaleChannel;
  buyer_name: string | null;
  notes: string | null;
  sold_by_name: string;
  sold_at: string;
  /**
   * Whether this viewer may correct or return it. Display only -- the
   * database decides, in may_amend_sale(), and refuses regardless of what
   * this says. It is here so the buttons can be absent rather than
   * offered and then denied.
   */
  may_amend: boolean;
};

/** The sale a part is currently on, if it is on one. */
export async function getLiveSale(partId: string): Promise<LiveSale | null> {
  const profile = await getCurrentProfile();
  if (!profile?.is_active) return null;

  const supabase = await createSupabaseServer();

  const { data } = await supabase
    .from("sales")
    .select(
      "id, sale_price_cents, sale_date, payment_method, channel, buyer_name, notes, " +
        "sold_by, created_at, profiles:sold_by (full_name)",
    )
    .eq("part_id", partId)
    .is("returned_at", null)
    .maybeSingle();

  if (!data) return null;

  const row = data as unknown as {
    id: string;
    sale_price_cents: number;
    sale_date: string;
    payment_method: PaymentMethod;
    channel: SaleChannel;
    buyer_name: string | null;
    notes: string | null;
    sold_by: string | null;
    created_at: string;
    profiles: { full_name: string } | null;
  };

  const withinADay =
    Date.now() - new Date(row.created_at).getTime() < 24 * 60 * 60 * 1000;

  return {
    id: row.id,
    sale_price_cents: row.sale_price_cents,
    sale_date: row.sale_date,
    payment_method: row.payment_method,
    channel: row.channel,
    buyer_name: row.buyer_name,
    notes: row.notes,
    sold_by_name: row.profiles?.full_name ?? "someone",
    sold_at: row.created_at,
    may_amend:
      profile.role === "owner" || (row.sold_by === profile.id && withinADay),
  };
}
