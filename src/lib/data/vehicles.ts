import "server-only";
import { createSupabaseServer, getCurrentProfile, hasFinanceAccess } from "@/lib/supabase/server";
import type { Part, Vehicle, VehicleFinance, VehiclePnl } from "@/types/db";

/**
 * Vehicle reads.
 *
 * Cost columns are never selected from `vehicles` -- the database has
 * revoked them from every client role. They come from `vehicle_finance`,
 * which returns nothing at all to staff. Keeping the two apart in the
 * data layer means a careless `select("*")` cannot leak anything.
 */

export const VEHICLE_COLUMNS =
  "id, stock_number, vin, year, make, model, trim, body_type, engine, transmission, " +
  "drivetrain, fuel_type, exterior_colour, mileage_km, purchase_date, source, " +
  "lot_number, status, notes, created_by, created_at, updated_at";

export type VehicleWithCounts = Vehicle & {
  parts_total: number;
  parts_available: number;
  parts_sold: number;
};

export async function listVehicles(options?: {
  status?: string[];
  search?: string;
}): Promise<VehicleWithCounts[]> {
  const supabase = await createSupabaseServer();

  let query = supabase.from("vehicles").select(VEHICLE_COLUMNS);

  if (options?.status?.length) query = query.in("status", options.status);

  if (options?.search?.trim()) {
    const q = options.search.trim();
    query = query.or(
      `make.ilike.%${q}%,model.ilike.%${q}%,stock_number.ilike.%${q}%,vin.ilike.%${q}%`,
    );
  }

  const { data, error } = await query
    .order("purchase_date", { ascending: false })
    .order("stock_number", { ascending: false });

  if (error) throw new Error(error.message);

  // The select list is a runtime string, so supabase-js cannot infer a
  // row type for it. `Vehicle` is the contract; it is asserted here once,
  // in the data layer, rather than at every call site.
  const vehicles = (data ?? []) as unknown as Vehicle[];
  if (vehicles.length === 0) return [];

  // One grouped pass for the counts rather than a query per card.
  const ids = vehicles.map((v) => v.id);
  const { data: parts } = await supabase
    .from("parts")
    .select("vehicle_id, status")
    .in("vehicle_id", ids);

  const counts = new Map<string, { total: number; available: number; sold: number }>();
  for (const id of ids) counts.set(id, { total: 0, available: 0, sold: 0 });

  for (const p of parts ?? []) {
    const c = counts.get(p.vehicle_id);
    if (!c) continue;
    c.total += 1;
    if (p.status === "available" || p.status === "reserved") c.available += 1;
    if (p.status === "sold") c.sold += 1;
  }

  return vehicles.map((v) => {
    const c = counts.get(v.id)!;
    return { ...v, parts_total: c.total, parts_available: c.available, parts_sold: c.sold };
  });
}

export async function getVehicle(id: string): Promise<Vehicle | null> {
  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from("vehicles")
    .select(VEHICLE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as Vehicle) ?? null;
}

/** Returns null for staff -- by database rule, not by an `if` here. */
export async function getVehicleFinance(id: string): Promise<VehicleFinance | null> {
  const profile = await getCurrentProfile();
  if (!hasFinanceAccess(profile)) return null;

  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from("vehicle_finance")
    .select("*")
    .eq("vehicle_id", id)
    .maybeSingle();
  return (data as VehicleFinance) ?? null;
}

export async function getVehiclePnl(id: string): Promise<VehiclePnl | null> {
  const profile = await getCurrentProfile();
  if (!hasFinanceAccess(profile)) return null;

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("vehicle_pnl", { p_vehicle_id: id });
  if (error) return null;
  return ((data as VehiclePnl[])?.[0]) ?? null;
}

export async function getVehicleParts(vehicleId: string): Promise<Part[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("parts")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .order("category")
    .order("name")
    .order("side");

  if (error) throw new Error(error.message);
  return (data ?? []) as Part[];
}

/** Parts grouped the way the vehicle screen shows them. */
export function groupPartsByCategory(parts: Part[]): [string, Part[]][] {
  const groups = new Map<string, Part[]>();
  for (const p of parts) {
    const list = groups.get(p.category);
    if (list) list.push(p);
    else groups.set(p.category, [p]);
  }
  return [...groups.entries()];
}

export async function getMakesInYard(): Promise<string[]> {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.from("vehicles").select("make");
  const makes = new Set((data ?? []).map((v: { make: string }) => v.make).filter(Boolean));
  return [...makes].sort((a, b) => a.localeCompare(b));
}
