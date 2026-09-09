import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, FileDown } from "lucide-react";
import { getCurrentProfile, hasFinanceAccess } from "@/lib/supabase/server";
import { getAllVehiclePnl } from "@/lib/data/reports";
import { AppHeader } from "@/components/nav/app-header";
import { Card, EmptyState, Stat } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { formatMoney, formatPercent } from "@/lib/money";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "Vehicle P&L" };

/** Green past break-even, amber close, red well short. */
function recoveryTone(pct: number | null): string {
  if (pct === null) return "text-ink-subtle";
  if (pct >= 100) return "text-available";
  if (pct >= 70) return "text-reserved";
  return "text-danger";
}

export default async function VehiclesReportPage() {
  const profile = await getCurrentProfile();
  if (!hasFinanceAccess(profile)) redirect("/");

  const rows = await getAllVehiclePnl();

  const invested = rows.reduce((n, r) => n + r.total_invested_cents, 0);
  const returned = rows.reduce((n, r) => n + r.parts_revenue_cents + r.scrap_income_cents, 0);
  const overall = invested > 0 ? (returned / invested) * 100 : null;

  return (
    <>
      <AppHeader
        title="Vehicle P&L"
        subtitle={`${rows.length} vehicles`}
        back={{ href: "/reports" }}
        action={
          <Button asChild size="icon-sm" variant="ghost" aria-label="Export to CSV">
            <a href="/api/export/vehicles">
              <FileDown className="size-4" />
            </a>
          </Button>
        }
      />

      <div className="space-y-4 px-3 py-4">
        {rows.length === 0 ? (
          <EmptyState
            title="No vehicles to report on"
            body="Add a vehicle and its costs, and its profit and loss shows up here as parts sell."
            action={{ label: "Add a vehicle", href: "/vehicles/new" }}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <Stat
                label="Total invested"
                value={formatMoney(invested)}
                sub="Landed cost + direct expenses"
                tone="muted"
              />
              <Stat
                label="Recovered"
                value={formatPercent(overall)}
                sub={formatMoney(returned)}
                tone={overall !== null && overall >= 100 ? "positive" : "default"}
              />
            </div>

            <Card className="divide-y divide-line overflow-hidden">
              {rows.map((r) => (
                <Link
                  key={r.vehicle_id}
                  href={`/reports/vehicle/${r.vehicle_id}`}
                  className="block px-3.5 py-3 active:bg-surface-2"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium text-ink">
                        {r.year} {r.make} {r.model}
                        {r.trim ? ` ${r.trim}` : ""}
                      </p>
                      <p className="tnum mt-0.5 text-[12.5px] text-ink-muted">
                        {r.stock_number} · {r.parts_sold}/{r.parts_total} sold ·{" "}
                        {r.days_held}d
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p
                        className={cn(
                          "tnum text-[16px] font-semibold leading-none",
                          recoveryTone(r.recovery_pct),
                        )}
                      >
                        {formatPercent(r.recovery_pct)}
                      </p>
                      <p
                        className={cn(
                          "tnum mt-1 text-[12.5px]",
                          r.gross_profit_cents >= 0 ? "text-available" : "text-danger",
                        )}
                      >
                        {r.gross_profit_cents < 0 ? "−" : "+"}
                        {formatMoney(Math.abs(r.gross_profit_cents))}
                      </p>
                    </div>

                    <ChevronRight className="mt-1 size-4 shrink-0 text-ink-subtle" />
                  </div>

                  {/* Recovery bar, with break-even marked at 100%. */}
                  <div className="relative mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-sunk">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        (r.recovery_pct ?? 0) >= 100 ? "bg-available" : "bg-accent",
                      )}
                      style={{ width: `${Math.min(100, r.recovery_pct ?? 0)}%` }}
                    />
                  </div>
                </Link>
              ))}
            </Card>

            <Button asChild variant="ghost" size="md" block>
              <a href="/api/export/vehicles">
                <FileDown className="size-[18px]" />
                Export every vehicle to CSV
              </a>
            </Button>
          </>
        )}
      </div>
    </>
  );
}
