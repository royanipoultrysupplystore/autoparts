import { getCurrentProfile, hasFinanceAccess } from "@/lib/supabase/server";
import { currentYearMonth, getMonthlyReport, monthName } from "@/lib/data/reports";
import { csvFilename, csvMoney, csvResponse, toCsv, type CsvValue } from "@/lib/csv";
import { CHANNEL_LABEL, EXPENSE_CATEGORY_LABEL, PAYMENT_LABEL } from "@/lib/vehicle-options";

export const dynamic = "force-dynamic";

/**
 * The monthly report as one CSV.
 *
 * Sections are stacked into a single sheet rather than split across
 * files, because this gets emailed to an accountant and opened once.
 * Both profit figures appear with their basis spelled out in the label.
 */
export async function GET(request: Request) {
  if (!hasFinanceAccess(await getCurrentProfile())) {
    return new Response("Financial exports are limited to owners and partners.", {
      status: 403,
    });
  }

  const url = new URL(request.url);
  const now = currentYearMonth();
  const year = Number(url.searchParams.get("y")) || now.year;
  const month = Number(url.searchParams.get("m")) || now.month;

  const report = await getMonthlyReport(year, month);
  if (!report) return new Response("Report not available.", { status: 404 });

  const rows: CsvValue[][] = [];
  const section = (title: string) => {
    rows.push([]);
    rows.push([title]);
  };

  rows.push(["Revenue", csvMoney(report.revenue_cents), `${report.sales_count} parts sold`]);
  rows.push([
    "Vehicles purchased",
    csvMoney(report.vehicles_landed_cost_cents),
    `${report.vehicles_purchased_count} vehicles`,
  ]);
  rows.push(["Direct vehicle expenses", csvMoney(report.direct_vehicle_expenses_cents), ""]);
  rows.push(["Overhead expenses", csvMoney(report.overhead_expenses_cents), ""]);
  rows.push([
    "NET PROFIT (cash basis)",
    csvMoney(report.net_profit_cash_cents),
    "Revenue minus all cash out this month",
  ]);
  rows.push([
    "GROSS PROFIT ON PARTS SOLD (allocated cost basis)",
    csvMoney(report.gross_profit_on_parts_sold_cents),
    "Parts sold this month, each charged its share of its vehicle's cost",
  ]);
  rows.push([
    "  Revenue on those parts",
    csvMoney(report.allocated_revenue_cents),
    "",
  ]);
  rows.push([
    "  Their share of vehicle cost",
    csvMoney(report.allocated_part_cost_cents),
    "",
  ]);

  section("Overhead by category");
  for (const c of report.overhead_by_category) {
    rows.push([EXPENSE_CATEGORY_LABEL[c.category] ?? c.category, csvMoney(c.amount_cents), c.count]);
  }

  section("Sales by partner");
  for (const p of report.sales_by_partner) {
    rows.push([p.name, csvMoney(p.amount_cents), p.count]);
  }

  section("Sales by channel");
  for (const c of report.sales_by_channel) {
    rows.push([CHANNEL_LABEL[c.channel] ?? c.channel, csvMoney(c.amount_cents), c.count]);
  }

  section("Sales by payment method");
  for (const p of report.sales_by_payment) {
    rows.push([
      PAYMENT_LABEL[p.payment_method] ?? p.payment_method,
      csvMoney(p.amount_cents),
      p.count,
    ]);
  }

  section("Best vehicles this month");
  for (const v of report.best_vehicles) {
    rows.push([
      `${v.stock_number} ${v.label}`,
      csvMoney(v.month_revenue_cents),
      v.recovery_pct === null ? "" : `${v.recovery_pct}%`,
    ]);
  }

  const csv = toCsv(["Item", "Amount (CAD)", "Detail"], rows, {
    note:
      `Mahmood Shah Auto Recycler - ${monthName(year, month)} - all amounts CAD. ` +
      `Net profit is cash basis. Gross profit on parts sold uses allocated vehicle cost.`,
  });

  return csvResponse(csvFilename(["monthly", year, String(month).padStart(2, "0")]), csv);
}
