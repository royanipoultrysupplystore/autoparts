import Link from "next/link";
import { ChevronRight, TrendingDown } from "lucide-react";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, SectionHeading, Stat } from "@/components/ui/primitives";
import { formatMoney, formatMoneyWhole, formatPercent } from "@/lib/money";
import type { DashboardStats } from "@/types/db";

/**
 * Where the yard stands right now.
 *
 * These figures used to sit on the home screen, which was the wrong
 * place for them: that screen is opened one-handed, mid-conversation, to
 * find a part. Numbers want a moment's attention and a label saying what
 * they are, so they live here instead.
 */
export async function YardSnapshot() {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("dashboard_stats");

  if (error) {
    return (
      <Card className="p-4 text-[13.5px] text-ink-muted">
        Could not load the yard figures: {error.message}
      </Card>
    );
  }

  const stats = data as DashboardStats;
  const attention = stats.vehicles_below_break_even ?? [];

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <SectionHeading>Where the yard stands</SectionHeading>

        <div className="grid grid-cols-2 gap-2.5">
          <Stat
            label="Inventory value"
            value={formatMoneyWhole(stats.inventory_value_cents)}
            sub="At asking prices"
          />
          <Stat
            label="Parts available"
            value={new Intl.NumberFormat("en-CA").format(stats.parts_available)}
            sub={
              stats.parts_reserved > 0
                ? `${stats.parts_reserved} on hold`
                : "Nothing on hold"
            }
          />
          <Stat
            label="This month"
            value={formatMoneyWhole(stats.month_revenue_cents)}
            sub="Parts revenue"
            tone="positive"
          />
          <Stat
            label="This week"
            value={`${stats.week_sales_count} sold`}
            sub={formatMoney(stats.week_revenue_cents)}
          />
          <Stat
            label="Active vehicles"
            value={stats.active_vehicles}
            sub="Incoming or parting out"
            className="col-span-2"
          />
        </div>
      </section>

      {attention.length > 0 && (
        <section className="space-y-2">
          <SectionHeading>Needs attention</SectionHeading>
          <Card className="divide-y divide-line overflow-hidden">
            {attention.map((v) => (
              <Link
                key={v.vehicle_id}
                href={`/reports/vehicle/${v.vehicle_id}`}
                className="flex items-center gap-3 px-3.5 py-3 active:bg-surface-2"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-reserved-soft text-reserved">
                  <TrendingDown className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-medium text-ink">
                    {v.label}
                  </span>
                  <span className="tnum block text-[12.5px] text-ink-muted">
                    {formatMoney(v.break_even_remaining_cents)} to break even ·{" "}
                    {formatPercent(v.recovery_pct)} recovered · {v.days_held}d held
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-ink-subtle" />
              </Link>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
