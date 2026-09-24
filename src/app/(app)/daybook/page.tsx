import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, Car, Clock, Receipt, Undo2 } from "lucide-react";
import { canWorkTheYard, getCurrentProfile } from "@/lib/supabase/server";
import { listDayBook } from "@/lib/data/daybook";
import { AppHeader } from "@/components/nav/app-header";
import { Card, EmptyState, SectionHeading } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/money";
import { formatDate, formatTime, partTitle, todayInVancouver } from "@/lib/format";
import { EXPENSE_CATEGORY_LABEL, PAYMENT_LABEL } from "@/lib/vehicle-options";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "Day book" };

const RANGES = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "all", label: "Last 90 days" },
] as const;

export default async function DayBookPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const [params, profile] = await Promise.all([searchParams, getCurrentProfile()]);
  if (!canWorkTheYard(profile)) redirect("/");

  const range = RANGES.some((r) => r.value === params.range)
    ? (params.range as string)
    : "week";

  const { days, finance } = await listDayBook(range);
  const today = todayInVancouver();

  const totalIn = days.reduce((n, d) => n + d.in_cents, 0);
  const totalOut = days.reduce((n, d) => n + d.out_cents, 0);
  const totalSales = days.reduce(
    (n, d) => n + d.sales.filter((s) => !s.returned_at).length,
    0,
  );

  return (
    <>
      <AppHeader
        title="Day book"
        subtitle={
          days.length === 0
            ? "Nothing yet"
            : finance
              ? `In ${formatMoney(totalIn)} · out ${formatMoney(totalOut)}`
              : `${totalSales} part${totalSales === 1 ? "" : "s"} sold`
        }
        close={{ href: "/" }}
        below={
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 pb-2.5">
            {RANGES.map((r) => (
              <Link
                key={r.value}
                href={`/daybook?range=${r.value}`}
                scroll={false}
                aria-current={r.value === range ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors",
                  r.value === range
                    ? "border-accent bg-accent text-accent-text"
                    : "border-line-strong bg-surface text-ink-muted active:bg-surface-2",
                )}
              >
                {r.label}
              </Link>
            ))}
          </div>
        }
      />

      <div className="space-y-6 px-3 py-4">
        {days.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="size-7" />}
            title={range === "today" ? "Nothing yet today" : "Nothing in this stretch"}
            body="Every sale, every expense and everything the yard did shows up here on the day it happened."
            action={{ label: "Search the shelf", href: "/search" }}
          />
        ) : (
          days.map((day) => {
            const net = day.in_cents - day.out_cents;

            return (
              <section key={day.date} className="space-y-2">
                <SectionHeading
                  action={
                    finance ? (
                      <span
                        className={cn(
                          "tnum text-[13px] font-semibold",
                          net > 0 ? "text-available" : net < 0 ? "text-danger" : "text-ink-muted",
                        )}
                      >
                        {net >= 0 ? "+" : "−"}
                        {formatMoney(Math.abs(net))}
                      </span>
                    ) : undefined
                  }
                >
                  {day.date === today ? "Today" : formatDate(day.date)}
                </SectionHeading>

                {/* ------------------------------------------- Money in */}
                {(day.sales.length > 0 || day.vehicle_sales.length > 0) && (
                  <Card className="divide-y divide-line overflow-hidden">
                    <Row
                      heading
                      left="Sold"
                      right={finance ? formatMoney(day.in_cents) : undefined}
                    />

                    {day.vehicle_sales.map((v) => (
                      <Link
                        key={v.id}
                        href={`/vehicles/${v.id}`}
                        className="flex items-start gap-3 px-3.5 py-2.5 active:bg-surface-2"
                      >
                        <Car className="mt-0.5 size-4 shrink-0 text-accent" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium text-ink">
                            {v.label} — whole car
                          </span>
                          <span className="block truncate text-[12px] text-ink-subtle">
                            {v.stock_number}
                            {v.sold_to ? ` · ${v.sold_to}` : ""}
                          </span>
                        </span>
                        {finance && (
                          <span className="tnum shrink-0 text-[14px] font-semibold text-ink">
                            {formatMoney(v.price_cents)}
                          </span>
                        )}
                      </Link>
                    ))}

                    {day.sales.map((s) => (
                      <Link
                        key={s.id}
                        href={`/vehicles/${s.vehicle_id}`}
                        className="flex items-start gap-3 px-3.5 py-2.5 active:bg-surface-2"
                      >
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block truncate text-[14px]",
                              s.returned_at
                                ? "text-ink-subtle line-through"
                                : "text-ink",
                            )}
                          >
                            {partTitle(s.part_name, s.part_side as never)}
                          </span>
                          <span className="block truncate text-[12px] text-ink-subtle">
                            {s.year} {s.make} {s.model} · {s.sold_by_name} ·{" "}
                            {PAYMENT_LABEL[s.payment_method]}
                            {s.buyer_name ? ` · ${s.buyer_name}` : ""}
                          </span>
                          {s.returned_at && (
                            <span className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-medium text-danger">
                              <Undo2 className="size-3" />
                              Returned and refunded
                            </span>
                          )}
                        </span>
                        <span
                          className={cn(
                            "tnum shrink-0 text-[14px] font-semibold",
                            s.returned_at ? "text-ink-subtle line-through" : "text-ink",
                          )}
                        >
                          {formatMoney(s.sale_price_cents)}
                        </span>
                      </Link>
                    ))}

                    {day.refunded_cents > 0 && (
                      <p className="px-3.5 py-2 text-[12px] text-ink-subtle">
                        {formatMoney(day.refunded_cents)} refunded — already off the
                        figure above.
                      </p>
                    )}
                  </Card>
                )}

                {/* ------------------------------------------ Money out */}
                {finance && day.expenses.length > 0 && (
                  <Card className="divide-y divide-line overflow-hidden">
                    <Row heading left="Spent" right={formatMoney(day.out_cents)} />
                    {day.expenses.map((e) => (
                      <div
                        key={e.id}
                        className="flex items-start gap-3 px-3.5 py-2.5"
                      >
                        <Receipt className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] text-ink">
                            {EXPENSE_CATEGORY_LABEL[e.category]}
                          </span>
                          {e.note && (
                            <span className="block truncate text-[12px] text-ink-subtle">
                              {e.note}
                            </span>
                          )}
                        </span>
                        <span className="tnum shrink-0 text-[14px] font-semibold text-ink">
                          {formatMoney(e.amount_cents)}
                        </span>
                      </div>
                    ))}
                  </Card>
                )}

                {/* --------------------------------------- What happened */}
                {day.events.length > 0 && (
                  <Card className="overflow-hidden">
                    <Row heading left="Also that day" />
                    <ul className="divide-y divide-line">
                      {day.events.map((e) => (
                        <li key={e.id} className="flex items-start gap-3 px-3.5 py-2">
                          <Clock className="mt-0.5 size-3.5 shrink-0 text-ink-subtle" />
                          <span className="min-w-0 flex-1 text-[13px] leading-snug text-ink-muted">
                            {e.summary}
                            <span className="block text-[11.5px] text-ink-subtle">
                              {e.user_name} · {formatTime(e.created_at)}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </section>
            );
          })
        )}
      </div>
    </>
  );
}

function Row({
  left,
  right,
  heading,
}: {
  left: string;
  right?: string;
  heading?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 px-3.5 py-2",
        heading && "bg-surface-2/60",
      )}
    >
      <span className="text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-subtle">
        {left}
      </span>
      {right && (
        <span className="tnum text-[13px] font-semibold text-ink">{right}</span>
      )}
    </div>
  );
}
