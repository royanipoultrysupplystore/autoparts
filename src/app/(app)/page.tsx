import Link from "next/link";
import { Suspense } from "react";
import {
  Boxes,
  Car,
  Clock,
  TrendingDown,
  ChevronRight,
  Search as SearchIcon,
} from "lucide-react";
import { createSupabaseServer, getCurrentProfile } from "@/lib/supabase/server";
import { formatMoney, formatMoneyWhole, formatPercent } from "@/lib/money";
import { timeAgo, TIMEZONE } from "@/lib/format";
import { Card, EmptyState, SectionHeading, Stat, SkeletonRows } from "@/components/ui/primitives";
import { AppHeader } from "@/components/nav/app-header";
import { Wordmark } from "@/components/brand";
import type { ActivityEntry, DashboardStats } from "@/types/db";

export const dynamic = "force-dynamic";

async function StatsBlock() {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("dashboard_stats");

  if (error) {
    return (
      <Card className="p-4 text-[13.5px] text-ink-muted">
        Could not load the dashboard: {error.message}
      </Card>
    );
  }

  const stats = data as DashboardStats;
  const finance = stats.finance_visible;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5">
        {finance && (
          <Stat
            label="Inventory value"
            value={formatMoneyWhole(stats.inventory_value_cents)}
            sub="At asking prices"
          />
        )}
        <Stat
          label="Parts available"
          value={new Intl.NumberFormat("en-CA").format(stats.parts_available)}
          sub={
            stats.parts_reserved > 0
              ? `${stats.parts_reserved} on hold`
              : "Nothing on hold"
          }
        />
        {finance && (
          <Stat
            label="This month"
            value={formatMoneyWhole(stats.month_revenue_cents)}
            sub="Parts revenue"
            tone="positive"
          />
        )}
        <Stat
          label="This week"
          value={`${stats.week_sales_count} sold`}
          sub={finance ? formatMoney(stats.week_revenue_cents) : "Parts moved"}
        />
        <Stat
          label="Active vehicles"
          value={stats.active_vehicles}
          sub="Incoming or parting out"
        />
      </div>

      {finance && stats.vehicles_below_break_even && stats.vehicles_below_break_even.length > 0 && (
        <section className="space-y-2">
          <SectionHeading>Needs attention</SectionHeading>
          <Card className="divide-y divide-line overflow-hidden">
            {stats.vehicles_below_break_even.map((v) => (
              <Link
                key={v.vehicle_id}
                href={`/vehicles/${v.vehicle_id}`}
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

async function ActivityFeed() {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.rpc("recent_activity", { p_limit: 12 });
  const entries = (data ?? []) as ActivityEntry[];

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<Clock className="size-7" />}
        title="Nothing has happened yet"
        body="Add your first vehicle and the yard's activity will show up here — who sold what, and when."
        action={{ label: "Add a vehicle", href: "/vehicles/new" }}
      />
    );
  }

  return (
    <Card className="divide-y divide-line overflow-hidden">
      {entries.map((e) => (
        <div key={e.id} className="px-3.5 py-2.5">
          <p className="text-[13.5px] leading-snug text-ink">{e.summary}</p>
          <p className="mt-0.5 text-[12px] text-ink-subtle">
            {e.user_name} · {timeAgo(e.created_at)}
          </p>
        </div>
      ))}
    </Card>
  );
}

/** Greeting follows the clock in the yard, not the server's. */
function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIMEZONE,
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
  );
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  const firstName = (profile?.full_name || "there").split(" ")[0];

  return (
    <>
      <AppHeader title={<Wordmark />} />

      <div className="space-y-5 px-3 py-4">
        <div className="px-1">
          <p className="text-[15px] text-ink-muted">
            {greeting()}, <span className="font-medium text-ink">{firstName}</span>.
          </p>
        </div>

        <Link
          href="/search"
          className="flex h-12 items-center gap-2.5 rounded-xl border border-line-strong bg-surface px-3.5 text-ink-subtle shadow-[var(--shadow-card)] active:bg-surface-2"
        >
          <SearchIcon className="size-5" />
          <span className="text-[15px]">Search every part in the yard</span>
        </Link>

        <Suspense fallback={<div className="skeleton h-40 rounded-xl" />}>
          <StatsBlock />
        </Suspense>

        <section className="space-y-2">
          <SectionHeading
            action={
              <Link href="/activity" className="text-[13px] font-medium text-accent">
                See all
              </Link>
            }
          >
            Recent activity
          </SectionHeading>
          <Suspense fallback={<SkeletonRows count={4} />}>
            <ActivityFeed />
          </Suspense>
        </section>

        <div className="grid grid-cols-2 gap-2.5">
          <Link
            href="/vehicles"
            className="flex items-center gap-2.5 rounded-xl border border-line bg-surface p-3.5 active:bg-surface-2"
          >
            <Car className="size-5 text-accent" />
            <span className="text-[14px] font-medium text-ink">Vehicles</span>
          </Link>
          <Link
            href="/search?status=available"
            className="flex items-center gap-2.5 rounded-xl border border-line bg-surface p-3.5 active:bg-surface-2"
          >
            <Boxes className="size-5 text-accent" />
            <span className="text-[14px] font-medium text-ink">Inventory</span>
          </Link>
        </div>
      </div>
    </>
  );
}
