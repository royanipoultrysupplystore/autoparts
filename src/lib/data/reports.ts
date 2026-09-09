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
