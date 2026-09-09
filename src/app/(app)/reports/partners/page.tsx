import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { createSupabaseServer, getCurrentProfile, hasFinanceAccess } from "@/lib/supabase/server";
import {
  currentYearMonth,
  getMonthlyReport,
  monthName,
  shiftMonth,
} from "@/lib/data/reports";
import { AppHeader } from "@/components/nav/app-header";
import { Card, EmptyState, SectionHeading, Stat } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "Partner performance" };

/**
 * Per-partner performance across the last six months.
 *
 * Presented as counts and dollars only, with no ranking language: four
 * business partners share this data, and a screen that reads like a
 * leaderboard would cause more arguments than it settles.
 */
export default async function PartnerReportPage() {
  const profile = await getCurrentProfile();
  if (!hasFinanceAccess(profile)) redirect("/");

  const now = currentYearMonth();
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(now.year, now.month, -i));

  const reports = await Promise.all(
    months.map(({ year, month }) => getMonthlyReport(year, month)),
  );

  const supabase = await createSupabaseServer();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("is_active", true);

  const names = new Map(
    ((profiles ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]),
  );

  // Totals across the whole window.
  const totals = new Map<string, { name: string; count: number; cents: number }>();
  for (const report of reports) {
    for (const p of report?.sales_by_partner ?? []) {
      const key = p.user_id ?? "unassigned";
      const existing = totals.get(key) ?? {
        name: names.get(key) ?? p.name,
        count: 0,
        cents: 0,
      };
      existing.count += p.count;
      existing.cents += p.amount_cents;
      totals.set(key, existing);
    }
  }

  const rows = [...totals.values()].sort((a, b) => b.cents - a.cents);
  const grandTotal = rows.reduce((n, r) => n + r.cents, 0);
  const grandCount = rows.reduce((n, r) => n + r.count, 0);

  return (
    <>
      <AppHeader
        title="Partner performance"
        subtitle={`${monthName(months[5].year, months[5].month)} – ${monthName(now.year, now.month)}`}
        back={{ href: "/reports" }}
      />

      <div className="space-y-5 px-3 py-4">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Users className="size-7" />}
            title="No sales in the last six months"
            body="Once parts start selling, each partner's count and dollar total shows up here."
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <Stat label="Six-month revenue" value={formatMoney(grandTotal)} tone="positive" />
              <Stat label="Parts sold" value={grandCount} sub="Across the yard" />
            </div>

            <section className="space-y-2">
              <SectionHeading>Six months, by partner</SectionHeading>
              <Card className="divide-y divide-line overflow-hidden">
                {rows.map((r) => {
                  const share = grandTotal > 0 ? (r.cents / grandTotal) * 100 : 0;
                  const average = r.count > 0 ? Math.round(r.cents / r.count) : 0;

                  return (
                    <div key={r.name} className="px-3.5 py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-[15px] font-medium text-ink">
                          {r.name}
                        </span>
                        <span className="tnum shrink-0 text-[15px] font-semibold text-ink">
                          {formatMoney(r.cents)}
                        </span>
                      </div>

                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunk">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${share}%` }}
                        />
                      </div>

                      <p className="tnum mt-1.5 text-[12.5px] text-ink-subtle">
                        {r.count} {r.count === 1 ? "part" : "parts"} ·{" "}
                        {formatMoney(average)} average
                      </p>
                    </div>
                  );
                })}
              </Card>
            </section>

            <section className="space-y-2">
              <SectionHeading>Month by month</SectionHeading>
              <Card className="divide-y divide-line overflow-hidden">
                {months.map(({ year, month }, i) => {
                  const report = reports[i];
                  const partners = report?.sales_by_partner ?? [];

                  return (
                    <div key={`${year}-${month}`} className="px-3.5 py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-[14px] font-medium text-ink">
                          {monthName(year, month)}
                        </span>
                        <span className="tnum text-[14px] font-semibold text-ink">
                          {formatMoney(report?.revenue_cents ?? 0)}
                        </span>
                      </div>

                      {partners.length === 0 ? (
                        <p className="mt-1 text-[12.5px] text-ink-subtle">Nothing sold</p>
                      ) : (
                        <div className="mt-2 space-y-1">
                          {partners.map((p) => (
                            <div
                              key={p.user_id ?? p.name}
                              className="flex items-baseline justify-between gap-3"
                            >
                              <span className="truncate text-[13px] text-ink-muted">
                                {names.get(p.user_id ?? "") ?? p.name}
                              </span>
                              <span
                                className={cn(
                                  "tnum shrink-0 text-[13px]",
                                  p.amount_cents > 0 ? "text-ink" : "text-ink-subtle",
                                )}
                              >
                                {formatMoney(p.amount_cents)}
                                <span className="ml-1.5 text-ink-subtle">×{p.count}</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </Card>
            </section>
          </>
        )}
      </div>
    </>
  );
}
