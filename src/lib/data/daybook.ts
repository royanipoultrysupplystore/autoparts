import "server-only";
import {
  createSupabaseServer,
  getCurrentProfile,
  hasFinanceAccess,
} from "@/lib/supabase/server";
import { TIMEZONE } from "@/lib/format";
import { windowStart, type SaleRow } from "@/lib/data/sales";
import type { ExpenseCategory } from "@/types/db";

/**
 * The day book.
 *
 * One page per day of everything that happened on it: what went out the
 * door, what was spent, and what the yard did. The monthly report answers
 * "how did we do"; this answers "what happened on Tuesday", which is the
 * question you ask when a number looks wrong or a customer rings up about
 * something from last week.
 *
 * Money out is the owner's, the same as everywhere else. A partner gets
 * the same page with the spending and the net taken out of it -- not a
 * different page, and not an empty one.
 */

export type DayVehicleSale = {
  id: string;
  stock_number: string;
  label: string;
  price_cents: number;
  sold_to: string | null;
};

export type DayExpense = {
  id: string;
  category: ExpenseCategory;
  amount_cents: number;
  note: string | null;
  vehicle_id: string | null;
};

export type DayEvent = {
  id: string;
  action: string;
  summary: string;
  user_name: string;
  created_at: string;
};

export type DayBookDay = {
  date: string;
  sales: SaleRow[];
  vehicle_sales: DayVehicleSale[];
  expenses: DayExpense[];
  events: DayEvent[];
  /** Parts plus whole vehicles, already net of anything returned. */
  in_cents: number;
  refunded_cents: number;
  out_cents: number;
};

/** The Vancouver calendar date a timestamp fell on. */
function vancouverDate(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "01";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export async function listDayBook(range: string): Promise<{
  days: DayBookDay[];
  finance: boolean;
}> {
  const profile = await getCurrentProfile();
  if (!profile?.is_active) return { days: [], finance: false };

  const finance = hasFinanceAccess(profile);
  const from = windowStart(range);
  const supabase = await createSupabaseServer();

  // One round trip each, in parallel. Everything is bounded by the window
  // and by a row cap, so a busy quarter cannot pull the whole yard down
  // the wire.
  const [saleRes, vehicleRes, expenseRes, eventRes] = await Promise.all([
    supabase
      .from("sales")
      .select(
        "id, sale_date, sale_price_cents, payment_method, channel, buyer_name, " +
          "returned_at, part_id, vehicle_id, " +
          "parts:part_id (name, side), " +
          "vehicles:vehicle_id (stock_number, year, make, model), " +
          "profiles:sold_by (full_name)",
      )
      .gte("sale_date", from)
      .order("sale_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500),

    supabase
      .from("vehicles")
      .select("id, stock_number, year, make, model, sold_on, sold_to")
      .gte("sold_on", from)
      .order("sold_on", { ascending: false })
      .limit(200),

    finance
      ? supabase
          .from("expenses")
          .select("id, category, amount_cents, note, vehicle_id, expense_date")
          .gte("expense_date", from)
          .order("expense_date", { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [], error: null }),

    supabase
      .from("activity_log")
      .select("id, action, summary, user_name, created_at")
      .gte("created_at", `${from}T00:00:00Z`)
      .order("created_at", { ascending: false })
      .limit(400),
  ]);

  const byDate = new Map<string, DayBookDay>();
  const day = (date: string): DayBookDay => {
    const found = byDate.get(date);
    if (found) return found;
    const fresh: DayBookDay = {
      date,
      sales: [],
      vehicle_sales: [],
      expenses: [],
      events: [],
      in_cents: 0,
      refunded_cents: 0,
      out_cents: 0,
    };
    byDate.set(date, fresh);
    return fresh;
  };

  type JoinedSale = {
    id: string;
    sale_date: string;
    sale_price_cents: number;
    payment_method: SaleRow["payment_method"];
    channel: SaleRow["channel"];
    buyer_name: string | null;
    returned_at: string | null;
    part_id: string;
    vehicle_id: string;
    parts: { name: string; side: string } | null;
    vehicles: { stock_number: string; year: number; make: string; model: string } | null;
    profiles: { full_name: string } | null;
  };

  for (const r of (saleRes.data ?? []) as unknown as JoinedSale[]) {
    const d = day(r.sale_date);
    d.sales.push({
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
    });

    if (r.returned_at) d.refunded_cents += r.sale_price_cents;
    else d.in_cents += r.sale_price_cents;
  }

  // A whole-car sale's price is a vehicle cost column, so it is revoked
  // from anyone but the owner -- hence the separate read and the zero.
  type SoldVehicle = {
    id: string;
    stock_number: string;
    year: number;
    make: string;
    model: string;
    sold_on: string;
    sold_to: string | null;
  };

  const soldVehicles = (vehicleRes.data ?? []) as unknown as SoldVehicle[];

  let prices = new Map<string, number>();
  if (finance && soldVehicles.length > 0) {
    const { data } = await supabase
      .from("vehicle_finance")
      .select("vehicle_id, sale_price_cents")
      .in("vehicle_id", soldVehicles.map((v) => v.id));

    prices = new Map(
      ((data ?? []) as { vehicle_id: string; sale_price_cents: number }[]).map((r) => [
        r.vehicle_id,
        r.sale_price_cents,
      ]),
    );
  }

  for (const v of soldVehicles) {
    if (!v.sold_on) continue;
    const price = prices.get(v.id) ?? 0;
    const d = day(v.sold_on);
    d.vehicle_sales.push({
      id: v.id,
      stock_number: v.stock_number,
      label: `${v.year} ${v.make} ${v.model}`,
      price_cents: price,
      sold_to: v.sold_to,
    });
    d.in_cents += price;
  }

  for (const e of (expenseRes.data ?? []) as {
    id: string;
    category: ExpenseCategory;
    amount_cents: number;
    note: string | null;
    vehicle_id: string | null;
    expense_date: string;
  }[]) {
    const d = day(e.expense_date);
    d.expenses.push({
      id: e.id,
      category: e.category,
      amount_cents: e.amount_cents,
      note: e.note,
      vehicle_id: e.vehicle_id,
    });
    d.out_cents += e.amount_cents;
  }

  for (const a of (eventRes.data ?? []) as DayEvent[]) {
    day(vancouverDate(a.created_at)).events.push(a);
  }

  return {
    days: [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1)),
    finance,
  };
}
