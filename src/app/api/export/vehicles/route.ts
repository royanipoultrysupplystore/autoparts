import { getCurrentProfile, hasFinanceAccess } from "@/lib/supabase/server";
import { getAllVehiclePnl } from "@/lib/data/reports";
import { csvFilename, csvMoney, csvResponse, toCsv, type CsvValue } from "@/lib/csv";
import { todayInVancouver } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Every vehicle's P&L, one row each — the sheet the partners argue over. */
export async function GET() {
  if (!hasFinanceAccess(await getCurrentProfile())) {
    return new Response("Financial exports are limited to owners and partners.", {
      status: 403,
    });
  }

  const rows = await getAllVehiclePnl();

  const body: CsvValue[][] = rows.map((r) => [
    r.stock_number,
    r.year,
    r.make,
    r.model,
    r.trim ?? "",
    r.status,
    r.purchase_date,
    r.days_held,
    csvMoney(r.landed_cost_cents),
    csvMoney(r.direct_expenses_cents),
    csvMoney(r.total_invested_cents),
    csvMoney(r.parts_revenue_cents),
    csvMoney(r.scrap_income_cents),
    csvMoney(r.gross_profit_cents),
    r.recovery_pct === null ? "" : r.recovery_pct,
    r.parts_total,
    r.parts_sold,
    r.parts_remaining,
    r.pct_catalogue_moved,
    csvMoney(r.revenue_per_day_cents),
    csvMoney(r.break_even_remaining_cents),
  ]);

  const csv = toCsv(
    [
      "Stock",
      "Year",
      "Make",
      "Model",
      "Trim",
      "Status",
      "Purchased",
      "Days held",
      "Landed cost",
      "Direct expenses",
      "Total invested",
      "Parts revenue",
      "Scrap income",
      "Gross profit",
      "Recovery %",
      "Parts total",
      "Parts sold",
      "Parts remaining",
      "% catalogue moved",
      "Revenue per day",
      "To break even",
    ],
    body,
    {
      note:
        `Mahmood Shah Auto Recycler - vehicle P&L as at ${todayInVancouver()} - ` +
        `all amounts CAD, cash basis. Gross profit = parts revenue + scrap - total invested.`,
    },
  );

  return csvResponse(csvFilename(["vehicles", todayInVancouver()]), csv);
}
