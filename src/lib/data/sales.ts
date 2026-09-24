import "server-only";
import { createSupabaseServer, getCurrentProfile } from "@/lib/supabase/server";
import { todayInVancouver } from "@/lib/format";
import type { PaymentMethod, SaleChannel } from "@/types/db";

/**
 * The day book.
 *
 * Every sale, newest first, grouped by the day it happened. This is not
 * the monthly report -- it is the question somebody asks at six o'clock:
 * what went out today, and for how much.
 *
 * Returned sales are kept in the list and marked, not hidden. A day that
 * took four hundred dollars and gave eighty back had both of those
 * things happen, and the person who took the part back knows it did.
 */

export type SaleRow = {
  id: string;
  sale_date: string;
  sale_price_cents: number;
  payment_method: PaymentMethod;
  channel: SaleChannel;
  buyer_name: string | null;
  returned_at: string | null;
  part_id: string;
  part_name: string;
  part_side: string;
  vehicle_id: string;
  stock_number: string;
  year: number;
  make: string;
  model: string;
  sold_by_name: string;
};

export type SaleDay = {
  date: string;
  rows: SaleRow[];
  /** Net of anything returned: what the day actually took. */
  total_cents: number;
  refunded_cents: number;
};

/** The first day of the window, as a Vancouver calendar date. */
export function windowStart(range: string): string {
  const today = todayInVancouver();

  if (range === "today") return today;

  const [y, m, d] = today.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d));

  if (range === "month") return `${today.slice(0, 7)}-01`;

  if (range === "week") {
    // Monday, the way a yard counts a week.
    const weekday = (anchor.getUTCDay() + 6) % 7;
    anchor.setUTCDate(anchor.getUTCDate() - weekday);
  } else {
    anchor.setUTCDate(anchor.getUTCDate() - 90);
  }

  return anchor.toISOString().slice(0, 10);
}

export async function listSaleDays(range: string): Promise<SaleDay[]> {
  const profile = await getCurrentProfile();
  if (!profile?.is_active) return [];

  const supabase = await createSupabaseServer();

  const { data, error } = await supabase
    .from("sales")
    .select(
      "id, sale_date, sale_price_cents, payment_method, channel, buyer_name, " +
        "returned_at, part_id, vehicle_id, " +
        "parts:part_id (name, side), " +
        "vehicles:vehicle_id (stock_number, year, make, model), " +
        "profiles:sold_by (full_name)",
    )
    .gte("sale_date", windowStart(range))
    .order("sale_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);

  type Joined = {
    id: string;
    sale_date: string;
    sale_price_cents: number;
    payment_method: PaymentMethod;
    channel: SaleChannel;
    buyer_name: string | null;
    returned_at: string | null;
    part_id: string;
    vehicle_id: string;
    parts: { name: string; side: string } | null;
    vehicles: {
      stock_number: string;
      year: number;
      make: string;
      model: string;
    } | null;
    profiles: { full_name: string } | null;
  };

  const rows = (data ?? []) as unknown as Joined[];

  // Grouped in one pass; the query already returns them in day order.
  const days: SaleDay[] = [];

  for (const r of rows) {
    const row: SaleRow = {
      id: r.id,
      sale_date: r.sale_date,
      sale_price_cents: r.sale_price_cents,
      payment_method: r.payment_method,
      channel: r.channel,
      buyer_name: r.buyer_name,
      returned_at: r.returned_at,
      part_id: r.part_id,
      part_name: r.parts?.name ?? "A part",
      part_side: r.parts?.side ?? "none",
      vehicle_id: r.vehicle_id,
      stock_number: r.vehicles?.stock_number ?? "",
      year: r.vehicles?.year ?? 0,
      make: r.vehicles?.make ?? "",
      model: r.vehicles?.model ?? "",
      sold_by_name: r.profiles?.full_name ?? "someone",
    };

    const last = days[days.length - 1];
    const day =
      last && last.date === r.sale_date
        ? last
        : (days[days.push({
            date: r.sale_date,
            rows: [],
            total_cents: 0,
            refunded_cents: 0,
          }) - 1] as SaleDay);

    day.rows.push(row);

    if (row.returned_at) day.refunded_cents += row.sale_price_cents;
    else day.total_cents += row.sale_price_cents;
  }

  return days;
}
