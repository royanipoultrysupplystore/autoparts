import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, FileDown, Info, TrendingUp } from "lucide-react";
import { getCurrentProfile, hasFinanceAccess } from "@/lib/supabase/server";
import {
  currentYearMonth,
  getMonthlyReport,
  isFutureMonth,
  monthName,
  shiftMonth,
} from "@/lib/data/reports";
import { AppHeader } from "@/components/nav/app-header";
import { Card, DetailRow, EmptyState, SectionHeading, Stat } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { formatMoney, formatPercent } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { CHANNEL_LABEL, EXPENSE_CATEGORY_LABEL, PAYMENT_LABEL } from "@/lib/vehicle-options";
import { cn } from "@/lib/utils";
import { YardSnapshot } from "@/components/reports/yard-snapshot";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export const metadata = { title: "Reports" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!hasFinanceAccess(profile)) redirect("/");

  const params = await searchParams;
  const now = currentYearMonth();
  const year = Number(params.y) || now.year;
  const month = Number(params.m) || now.month;

  const report = await getMonthlyReport(year, month);

  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const nextDisabled = isFutureMonth(next.year, next.month);

  return (
    <>
      <AppHeader
        title="Reports"
        subtitle={monthName(year, month)}
        action={
          <Button asChild size="icon-sm" variant="ghost" aria-label="Export this month to CSV">
            <a href={`/api/export/monthly?y=${year}&m=${month}`}>
              <FileDown className="size-4" />
            </a>
          </Button>
        }
      />

      {/* Month picker */}
      <div className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-line bg-bg/95 px-3 py-2 backdrop-blur-md">
        <Link
          href={`/reports?y=${prev.year}&m=${prev.month}`}
          className="tap flex items-center justify-center rounded-lg px-2 text-ink-muted active:bg-surface-2"
          aria-label={`Go to ${monthName(prev.year, prev.month)}`}
        >
          <ChevronLeft className="size-5" />
        </Link>

        <span className="text-[14.5px] font-semibold text-ink">{monthName(year, month)}</span>

        {nextDisabled ? (
          <span className="tap flex items-center justify-center px-2 text-ink-subtle opacity-40">
            <ChevronRight className="size-5" />
          </span>
        ) : (
          <Link
            href={`/reports?y=${next.year}&m=${next.month}`}
            className="tap flex items-center justify-center rounded-lg px-2 text-ink-muted active:bg-surface-2"
            aria-label={`Go to ${monthName(next.year, next.month)}`}
          >
            <ChevronRight className="size-5" />
          </Link>
        )}
      </div>

      <div className="space-y-5 px-3 py-4">
        {/* Right now, before the month-by-month figures below. */}
        <Suspense fallback={<div className="skeleton h-56 rounded-xl" />}>
          <YardSnapshot />
        </Suspense>

        {!report ? (
          <EmptyState title="This report is not available" body="Try another month." />
        ) : (
          <>
            {/* ------------------------------------- The two profit figures */}
            <section className="space-y-2">
              <SectionHeading>The month</SectionHeading>

              <div className="grid grid-cols-2 gap-2.5">
                <Stat
                  label="Revenue"
                  value={formatMoney(report.revenue_cents)}
                  sub={`${report.sales_count} parts sold`}
                  tone="positive"
                />
                <Stat
                  label="Cash out"
                  value={formatMoney(
                    report.vehicles_landed_cost_cents +
                      report.direct_vehicle_expenses_cents +
                      report.overhead_expenses_cents,
                  )}
                  sub={`${report.vehicles_purchased_count} vehicles bought`}
                  tone="muted"
                />
              </div>

              {/*
                Two profit numbers sit side by side, each labelled with its
                basis. Cash basis alone makes any month with three cars in it
                look like a disaster; the allocated figure says whether the
                business is actually working. Neither is presented as "the"
                profit.
              */}
              <Card className="overflow-hidden">
                <div className="border-b border-line p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <div>
                      <p className="text-[13px] font-semibold uppercase tracking-[0.05em] text-ink-subtle">
                        Net profit
                      </p>
                      <p className="text-[12px] text-ink-subtle">Cash basis</p>
                    </div>
                    <p
                      className={cn(
                        "tnum text-[24px] font-semibold leading-none",
                        report.net_profit_cash_cents >= 0 ? "text-available" : "text-danger",
                      )}
                    >
                      {report.net_profit_cash_cents < 0 && "−"}
                      {formatMoney(Math.abs(report.net_profit_cash_cents))}
                    </p>
                  </div>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">
                    Everything that came in this month, minus everything that
                    went out — including cars bought this month that have not
                    been parted yet.
                  </p>
                </div>

                <div className="p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <div>
                      <p className="text-[13px] font-semibold uppercase tracking-[0.05em] text-ink-subtle">
                        Gross profit on parts sold
                      </p>
                      <p className="text-[12px] text-ink-subtle">Allocated cost basis</p>
                    </div>
                    <p
                      className={cn(
                        "tnum text-[24px] font-semibold leading-none",
                        report.gross_profit_on_parts_sold_cents >= 0
                          ? "text-available"
                          : "text-danger",
                      )}
                    >
                      {report.gross_profit_on_parts_sold_cents < 0 && "−"}
                      {formatMoney(Math.abs(report.gross_profit_on_parts_sold_cents))}
                    </p>
                  </div>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">
                    Only the parts actually sold this month, each charged its
                    share of what its car cost. This is the number that says
                    whether the yard is working.
                  </p>

                  <dl className="mt-3 divide-y divide-line border-t border-line">
                    <DetailRow
                      label="Revenue on those parts"
                      value={formatMoney(report.allocated_revenue_cents)}
                    />
                    <DetailRow
                      label="Their share of vehicle cost"
                      value={formatMoney(report.allocated_part_cost_cents)}
                    />
                    <DetailRow
                      label="Margin"
                      value={
                        report.allocated_revenue_cents > 0
                          ? formatPercent(
                              (report.gross_profit_on_parts_sold_cents /
                                report.allocated_revenue_cents) *
                                100,
                            )
                          : "—"
                      }
                    />
                  </dl>
                </div>
              </Card>

              <p className="flex items-start gap-2 px-1 text-[12px] leading-relaxed text-ink-subtle">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                A part&apos;s share of its vehicle&apos;s cost is worked out by asking
                price against every unsold part on that car. Period{" "}
                {formatDate(report.period_start)} – {formatDate(report.period_end)}.
              </p>
            </section>

            {/* ---------------------------------------------- Cash out */}
            <section className="space-y-2">
              <SectionHeading>Where the cash went</SectionHeading>
              <Card className="px-3.5 py-1">
                <dl className="divide-y divide-line">
                  <DetailRow
                    label={`Vehicles bought (${report.vehicles_purchased_count})`}
                    value={formatMoney(report.vehicles_landed_cost_cents)}
                  />
                  <DetailRow
                    label="Direct vehicle expenses"
                    value={formatMoney(report.direct_vehicle_expenses_cents)}
                  />
                  <DetailRow
                    label="Overhead"
                    value={formatMoney(report.overhead_expenses_cents)}
                  />
                </dl>
              </Card>

              {report.overhead_by_category.length > 0 && (
                <Card className="px-3.5 py-1">
                  <dl className="divide-y divide-line">
                    {report.overhead_by_category.map((c) => (
                      <DetailRow
                        key={c.category}
                        label={EXPENSE_CATEGORY_LABEL[c.category] ?? c.category}
                        value={formatMoney(c.amount_cents)}
                      />
                    ))}
                  </dl>
                </Card>
              )}
            </section>

            {/* ------------------------------------------ By partner */}
            {report.sales_by_partner.length > 0 && (
              <section className="space-y-2">
                <SectionHeading>Sales by partner</SectionHeading>
                <Card className="divide-y divide-line overflow-hidden">
                  {report.sales_by_partner.map((p) => {
                    const share =
                      report.revenue_cents > 0
                        ? (p.amount_cents / report.revenue_cents) * 100
                        : 0;
                    return (
                      <div key={p.user_id ?? p.name} className="px-3.5 py-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-[14.5px] font-medium text-ink">
                            {p.name}
                          </span>
                          <span className="tnum shrink-0 text-[14.5px] font-semibold text-ink">
                            {formatMoney(p.amount_cents)}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunk">
                            <div
                              className="h-full rounded-full bg-accent"
                              style={{ width: `${share}%` }}
                            />
                          </div>
                          <span className="tnum shrink-0 text-[12px] text-ink-subtle">
                            {p.count} {p.count === 1 ? "part" : "parts"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </Card>
              </section>
            )}

            {/* --------------------------------- Channel and payment */}
            {(report.sales_by_channel.length > 0 || report.sales_by_payment.length > 0) && (
              <section className="grid grid-cols-1 gap-2.5">
                {report.sales_by_channel.length > 0 && (
                  <div className="space-y-2">
                    <SectionHeading>Where buyers came from</SectionHeading>
                    <Card className="px-3.5 py-1">
                      <dl className="divide-y divide-line">
                        {report.sales_by_channel.map((c) => (
                          <DetailRow
                            key={c.channel}
                            label={`${CHANNEL_LABEL[c.channel] ?? c.channel} · ${c.count}`}
                            value={formatMoney(c.amount_cents)}
                          />
                        ))}
                      </dl>
                    </Card>
                  </div>
                )}

                {report.sales_by_payment.length > 0 && (
                  <div className="space-y-2">
                    <SectionHeading>How they paid</SectionHeading>
                    <Card className="px-3.5 py-1">
                      <dl className="divide-y divide-line">
                        {report.sales_by_payment.map((p) => (
                          <DetailRow
                            key={p.payment_method}
                            label={`${PAYMENT_LABEL[p.payment_method] ?? p.payment_method} · ${p.count}`}
                            value={formatMoney(p.amount_cents)}
                          />
                        ))}
                      </dl>
                    </Card>
                  </div>
                )}
              </section>
            )}

            {/* ------------------------------------- Best performers */}
            {report.best_vehicles.length > 0 && (
              <section className="space-y-2">
                <SectionHeading>Best cars this month</SectionHeading>
                <Card className="divide-y divide-line overflow-hidden">
                  {report.best_vehicles.map((v) => (
                    <Link
                      key={v.vehicle_id}
                      href={`/reports/vehicle/${v.vehicle_id}`}
                      className="flex items-center gap-3 px-3.5 py-3 active:bg-surface-2"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-available-soft text-available">
                        <TrendingUp className="size-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] font-medium text-ink">
                          {v.label}
                        </span>
                        <span className="tnum block text-[12.5px] text-ink-muted">
                          {formatPercent(v.recovery_pct)} recovered ·{" "}
                          {formatMoney(v.month_revenue_cents)} this month
                        </span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-ink-subtle" />
                    </Link>
                  ))}
                </Card>
              </section>
            )}

            {report.sales_count === 0 && (
              <EmptyState
                title={`Nothing sold in ${monthName(year, month)}`}
                body="Sales recorded in this month will show up here, broken down by partner, channel, and payment method."
                action={{ label: "Open search", href: "/search" }}
              />
            )}

            <div className="space-y-2.5 pt-1">
              <Button asChild variant="secondary" size="lg" block>
                <Link href="/reports/vehicles">Every vehicle&apos;s P&amp;L</Link>
              </Button>
              <Button asChild variant="secondary" size="lg" block>
                <Link href="/reports/partners">Partner performance</Link>
              </Button>
              <Button asChild variant="ghost" size="md" block>
                <a href={`/api/export/monthly?y=${year}&m=${month}`}>
                  <FileDown className="size-[18px]" />
                  Export {monthName(year, month)} to CSV
                </a>
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
