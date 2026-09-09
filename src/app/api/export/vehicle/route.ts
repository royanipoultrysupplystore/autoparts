import { createSupabaseServer, getCurrentProfile, hasFinanceAccess } from "@/lib/supabase/server";
import { getVehicle, getVehiclePnl } from "@/lib/data/vehicles";
import { csvFilename, csvMoney, csvResponse, toCsv, type CsvValue } from "@/lib/csv";
import { SIDE_LABELS, vehicleLabel } from "@/lib/format";
import type { Part, PartSide } from "@/types/db";

export const dynamic = "force-dynamic";

/** One vehicle: its P&L on top, then every part with its outcome. */
export async function GET(request: Request) {
  if (!hasFinanceAccess(await getCurrentProfile())) {
    return new Response("Financial exports are limited to owners and partners.", {
      status: 403,
    });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return new Response("Missing vehicle id.", { status: 400 });

  const [vehicle, pnl] = await Promise.all([getVehicle(id), getVehiclePnl(id)]);
  if (!vehicle || !pnl) return new Response("Vehicle not found.", { status: 404 });

  const supabase = await createSupabaseServer();

  const [{ data: parts }, { data: sales }, { data: expenses }] = await Promise.all([
    supabase
      .from("parts")
      .select("*")
      .eq("vehicle_id", id)
      .order("category")
      .order("name"),
    supabase
      .from("sales")
      .select("part_id, sale_price_cents, sale_date, payment_method, channel, buyer_name")
      .eq("vehicle_id", id),
    supabase
      .from("expenses")
      .select("category, amount_cents, expense_date, note")
      .eq("vehicle_id", id)
      .order("expense_date"),
  ]);

  const saleByPart = new Map(
    ((sales ?? []) as {
      part_id: string;
      sale_price_cents: number;
      sale_date: string;
      payment_method: string;
      channel: string;
      buyer_name: string | null;
    }[]).map((s) => [s.part_id, s]),
  );

  const rows: CsvValue[][] = [];

  rows.push(["P&L", "", "", "", "", "", "", ""]);
  rows.push(["Landed cost", csvMoney(pnl.landed_cost_cents)]);
  rows.push(["Direct expenses", csvMoney(pnl.direct_expenses_cents)]);
  rows.push(["Total invested", csvMoney(pnl.total_invested_cents)]);
  rows.push(["Parts revenue", csvMoney(pnl.parts_revenue_cents)]);
  rows.push(["Scrap income", csvMoney(pnl.scrap_income_cents)]);
  rows.push(["Gross profit", csvMoney(pnl.gross_profit_cents)]);
  rows.push(["Recovery %", pnl.recovery_pct ?? ""]);
  rows.push(["To break even", csvMoney(pnl.break_even_remaining_cents)]);
  rows.push(["Days held", pnl.days_held]);
  rows.push(["Revenue per day", csvMoney(pnl.revenue_per_day_cents)]);

  if (expenses?.length) {
    rows.push([]);
    rows.push(["Direct expenses"]);
    for (const e of expenses as {
      category: string;
      amount_cents: number;
      expense_date: string;
      note: string | null;
    }[]) {
      rows.push([e.expense_date, e.category, csvMoney(e.amount_cents), e.note ?? ""]);
    }
  }

  rows.push([]);
  rows.push([
    "Part",
    "Side",
    "Category",
    "Condition",
    "Status",
    "Asking",
    "Sold for",
    "Sold on",
    "Channel",
    "Payment",
    "Buyer",
    "Shelf",
  ]);

  for (const p of (parts ?? []) as Part[]) {
    const sale = saleByPart.get(p.id);
    rows.push([
      p.name,
      SIDE_LABELS[p.side as PartSide] || "",
      p.category,
      p.condition,
      p.status,
      csvMoney(p.asking_price_cents),
      sale ? csvMoney(sale.sale_price_cents) : "",
      sale?.sale_date ?? "",
      sale?.channel ?? "",
      sale?.payment_method ?? "",
      sale?.buyer_name ?? "",
      p.shelf_location ?? "",
    ]);
  }

  const csv = toCsv(["Item", "Value", "", "", "", "", "", "", "", "", "", ""], rows, {
    note:
      `Mahmood Shah Auto Recycler - ${vehicle.stock_number} ${vehicleLabel(vehicle)} - ` +
      `all amounts CAD, cash basis.`,
  });

  return csvResponse(csvFilename(["vehicle", vehicle.stock_number]), csv);
}
