import "server-only";
import { createSupabaseServer, getCurrentProfile, hasFinanceAccess } from "@/lib/supabase/server";
import { TIMEZONE } from "@/lib/format";
import type { MonthlyReport, VehiclePnl } from "@/types/db";

/**
 * Reporting reads.
 *
 * Every function below calls a SECURITY DEFINER database function that
 * re-checks the caller's role and raises for staff. The guard here is
 * only so a staff user gets a clean page instead of an error screen.
 */

export type TopPart = {
  part_id: string;
  name: string;
  side: string;
  category: string;
  icon_key: string;
  condition: "A" | "B" | "C" | "damaged";
  status: string;
  asking_price_cents: number;
  shelf_location: string | null;
};

export async function getMonthlyReport(
  year: number,
  month: number,
): Promise<MonthlyReport | null> {
  if (!hasFinanceAccess(await getCurrentProfile())) return null;

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("monthly_report", {
    p_year: year,
    p_month: month,
  });

  if (error) return null;
  return data as MonthlyReport;
}

export async function getAllVehiclePnl(): Promise<VehiclePnl[]> {
  if (!hasFinanceAccess(await getCurrentProfile())) return [];

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("vehicle_pnl", { p_vehicle_id: null });

  if (error) return [];
  return (data ?? []) as VehiclePnl[];
}

/**
 * Everything the business has taken in and paid out, since the first car.
 *
 * The monthly report answers one month at a time; this is the running
 * total the partners ask about -- "how much have we sold, and how much
 * have we spent". Built from vehicle_pnl, so it counts sales exactly the
 * way every other report does (returned sales out, whole-car sales and
 * scrap in), plus business overhead, which belongs to no car.
 */
export type AllTimeTotals = {
  parts_sales_cents: number;
  vehicle_sales_cents: number;
  scrap_cents: number;
  sales_total_cents: number;
  /** What the cars cost to buy and bring in: price, fees, transport. */
  cars_cents: number;
  /** Repairs, towing and the rest, charged against a car. */
  car_expenses_cents: number;
  /** Rent, tools, fuel -- spending that belongs to no one car. */
  overhead_cents: number;
  spent_total_cents: number;
  vehicles: number;
};

export async function getAllTimeTotals(): Promise<AllTimeTotals | null> {
  if (!hasFinanceAccess(await getCurrentProfile())) return null;

  const supabase = await createSupabaseServer();

  const { data, error } = await supabase.rpc("vehicle_pnl", { p_vehicle_id: null });
  if (error) return null;
  const rows = (data ?? []) as VehiclePnl[];

  // Overhead has no car to hang off, so it is summed from expenses. Read
  // in pages: a table read stops at 1,000 rows, and a few years of fuel
  // receipts would quietly fall off the end of one request.
  let overhead_cents = 0;
  for (let from = 0; ; from += 1000) {
    const { data: page, error: pageError } = await supabase
      .from("expenses")
      .select("amount_cents")
      .eq("scope", "business")
      .order("id")
      .range(from, from + 999);
    if (pageError) return null;
    for (const e of page ?? []) overhead_cents += e.amount_cents as number;
    if (!page || page.length < 1000) break;
  }

  const sum = (pick: (r: VehiclePnl) => number) => rows.reduce((n, r) => n + pick(r), 0);

  const parts_sales_cents = sum((r) => r.parts_revenue_cents);
  const vehicle_sales_cents = sum((r) => r.vehicle_sale_cents);
  const scrap_cents = sum((r) => r.scrap_income_cents);
  const cars_cents = sum((r) => r.landed_cost_cents);
  const car_expenses_cents = sum((r) => r.direct_expenses_cents);

  return {
    parts_sales_cents,
    vehicle_sales_cents,
    scrap_cents,
    sales_total_cents: parts_sales_cents + vehicle_sales_cents + scrap_cents,
    cars_cents,
    car_expenses_cents,
    overhead_cents,
    spent_total_cents: cars_cents + car_expenses_cents + overhead_cents,
    vehicles: rows.length,
  };
}

export async function getTopRemainingParts(
  vehicleId: string,
  limit = 10,
): Promise<TopPart[]> {
  if (!hasFinanceAccess(await getCurrentProfile())) return [];

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("top_remaining_parts", {
    p_vehicle_id: vehicleId,
    p_limit: limit,
  });

  if (error) return [];
  return (data ?? []) as TopPart[];
}

/** The current year and month in Vancouver, not in UTC. */
export function currentYearMonth(): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());

  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { year: get("year"), month: get("month") };
}

export function monthName(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/** Previous / next month, clamped so the picker cannot run past today. */
export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export function isFutureMonth(year: number, month: number): boolean {
  const now = currentYearMonth();
  return year > now.year || (year === now.year && month > now.month);
}
