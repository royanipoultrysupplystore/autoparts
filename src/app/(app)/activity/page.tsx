import Link from "next/link";
import {
  Banknote,
  Car,
  Clock,
  Package,
  Pencil,
  Store,
  Tag,
  Trash,
  TriangleAlert,
} from "lucide-react";
import { createSupabaseServer } from "@/lib/supabase/server";
import { AppHeader } from "@/components/nav/app-header";
import { Card, EmptyState } from "@/components/ui/primitives";
import { formatDate, timeAgo, TIMEZONE } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ActivityEntry } from "@/types/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Activity" };

/** Icon and tint per action, so the feed is scannable without reading. */
const ACTION_STYLE: Record<
  string,
  { icon: typeof Car; tone: string }
> = {
  sold: { icon: Banknote, tone: "bg-available-soft text-available" },
  reserved: { icon: Clock, tone: "bg-reserved-soft text-reserved" },
  reservation_expired: { icon: Clock, tone: "bg-reserved-soft text-reserved" },
  reservation_released: { icon: Clock, tone: "bg-surface-2 text-ink-muted" },
  created: { icon: Car, tone: "bg-accent-soft text-accent" },
  updated: { icon: Pencil, tone: "bg-surface-2 text-ink-muted" },
  deleted: { icon: Trash, tone: "bg-danger-soft text-danger" },
  parts_generated: { icon: Package, tone: "bg-accent-soft text-accent" },
  parts_trimmed: { icon: Package, tone: "bg-surface-2 text-ink-muted" },
  price_changed: { icon: Tag, tone: "bg-surface-2 text-ink-muted" },
  bulk_priced: { icon: Tag, tone: "bg-surface-2 text-ink-muted" },
  status_changed: { icon: Pencil, tone: "bg-surface-2 text-ink-muted" },
  added: { icon: Package, tone: "bg-surface-2 text-ink-muted" },
  published: { icon: Store, tone: "bg-accent-soft text-accent" },
  unpublished: { icon: Store, tone: "bg-surface-2 text-ink-muted" },
};

const FALLBACK = { icon: TriangleAlert, tone: "bg-surface-2 text-ink-muted" };

/** Groups entries under "Today", "Yesterday", then dates. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, dateStyle: "short" });
  const today = fmt.format(new Date());
  const yesterday = fmt.format(new Date(Date.now() - 86400000));
  const day = fmt.format(d);

  if (day === today) return "Today";
  if (day === yesterday) return "Yesterday";
  return formatDate(iso);
}

export default async function ActivityPage() {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.rpc("recent_activity", { p_limit: 120 });
  const entries = (data ?? []) as ActivityEntry[];

  const groups: [string, ActivityEntry[]][] = [];
  for (const e of entries) {
    const label = dayLabel(e.created_at);
    const last = groups[groups.length - 1];
    if (last && last[0] === label) last[1].push(e);
    else groups.push([label, [e]]);
  }

  return (
    <>
      <AppHeader title="Activity" subtitle="Who did what, and when" back={{ href: "/" }} />

      <div className="space-y-4 px-3 py-4">
        {entries.length === 0 ? (
          <EmptyState
            icon={<Clock className="size-7" />}
            title="Nothing has happened yet"
            body="Every sale, hold, price change, and deletion lands here with the name of whoever did it. Add a vehicle to get started."
            action={{ label: "Add a vehicle", href: "/vehicles/new" }}
          />
        ) : (
          groups.map(([label, items]) => (
            <section key={label} className="space-y-2">
              <h2 className="px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-subtle">
                {label}
              </h2>
              <Card className="divide-y divide-line overflow-hidden">
                {items.map((e) => {
                  const style = ACTION_STYLE[e.action] ?? FALLBACK;
                  const Icon = style.icon;

                  const body = (
                    <>
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-lg",
                          style.tone,
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] leading-snug text-ink">
                          {e.summary}
                        </span>
                        <span className="mt-0.5 block text-[12px] text-ink-subtle">
                          {e.user_name} · {timeAgo(e.created_at)}
                        </span>
                      </span>
                    </>
                  );

                  const className = "flex w-full items-start gap-3 px-3.5 py-3 text-left";

                  return e.entity_type === "vehicle" && e.entity_id && e.action !== "deleted" ? (
                    <Link
                      key={e.id}
                      href={`/vehicles/${e.entity_id}`}
                      className={cn(className, "active:bg-surface-2")}
                    >
                      {body}
                    </Link>
                  ) : (
                    <div key={e.id} className={className}>
                      {body}
                    </div>
                  );
                })}
              </Card>
            </section>
          ))
        )}
      </div>
    </>
  );
}
