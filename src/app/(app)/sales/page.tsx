import Link from "next/link";
import { redirect } from "next/navigation";
import { Receipt, Undo2 } from "lucide-react";
import { canWorkTheYard, getCurrentProfile } from "@/lib/supabase/server";
import { listSaleDays } from "@/lib/data/sales";
import { AppHeader } from "@/components/nav/app-header";
import { Card, EmptyState, SectionHeading } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/money";
import { formatDate, partTitle, todayInVancouver } from "@/lib/format";
import { PAYMENT_LABEL } from "@/lib/vehicle-options";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sales" };

const RANGES = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "all", label: "Last 90 days" },
] as const;

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const [params, profile] = await Promise.all([searchParams, getCurrentProfile()]);
  if (!canWorkTheYard(profile)) redirect("/");

  const range = RANGES.some((r) => r.value === params.range)
    ? (params.range as string)
    : "week";

  const days = await listSaleDays(range);
  const today = todayInVancouver();

  const windowTotal = days.reduce((n, d) => n + d.total_cents, 0);
  const windowCount = days.reduce(
    (n, d) => n + d.rows.filter((r) => !r.returned_at).length,
    0,
  );

  return (
    <>
      <AppHeader
        title="Sales"
        subtitle={
          days.length === 0
            ? "Nothing yet"
            : `${windowCount} part${windowCount === 1 ? "" : "s"} · ${formatMoney(windowTotal)}`
        }
        close={{ href: "/" }}
        below={
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 pb-2.5">
            {RANGES.map((r) => (
              <Link
                key={r.value}
                href={`/sales?range=${r.value}`}
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

      <div className="space-y-5 px-3 py-4">
        {days.length === 0 ? (
          <EmptyState
            icon={<Receipt className="size-7" />}
            title={range === "today" ? "Nothing sold today yet" : "No sales in this stretch"}
            body="Every part sold shows up here the moment it's marked sold, grouped by the day it went."
            action={{ label: "Search the shelf", href: "/search" }}
          />
        ) : (
          days.map((day) => (
            <section key={day.date} className="space-y-2">
              <SectionHeading
                action={
                  <span className="tnum text-[13px] font-semibold text-ink">
                    {formatMoney(day.total_cents)}
                  </span>
                }
              >
                {day.date === today ? "Today" : formatDate(day.date)}
              </SectionHeading>

              <Card className="divide-y divide-line overflow-hidden">
                {day.rows.map((r) => (
                  <Link
                    key={r.id}
                    href={`/vehicles/${r.vehicle_id}`}
                    className="flex items-start gap-3 px-3.5 py-3 active:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-[14.5px] font-medium",
                          r.returned_at ? "text-ink-subtle line-through" : "text-ink",
                        )}
                      >
                        {partTitle(r.part_name, r.part_side as never)}
                      </span>
                      <span className="mt-0.5 block truncate text-[12.5px] text-ink-muted">
                        {r.year} {r.make} {r.model} · {r.stock_number}
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-ink-subtle">
                        {r.sold_by_name} · {PAYMENT_LABEL[r.payment_method]}
                        {r.buyer_name ? ` · ${r.buyer_name}` : ""}
                      </span>
                      {r.returned_at && (
                        <span className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-danger">
                          <Undo2 className="size-3" />
                          Returned and refunded
                        </span>
                      )}
                    </span>

                    <span
                      className={cn(
                        "tnum shrink-0 text-[15px] font-semibold",
                        r.returned_at ? "text-ink-subtle line-through" : "text-ink",
                      )}
                    >
                      {formatMoney(r.sale_price_cents)}
                    </span>
                  </Link>
                ))}
              </Card>

              {day.refunded_cents > 0 && (
                <p className="px-1 text-[12.5px] text-ink-subtle">
                  {formatMoney(day.refunded_cents)} refunded that day — already
                  taken off the total above.
                </p>
              )}
            </section>
          ))
        )}
      </div>
    </>
  );
}
