import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FileDown, MapPin, Target } from "lucide-react";
import { getCurrentProfile, hasFinanceAccess } from "@/lib/supabase/server";
import { getVehicle, getVehicleFinance, getVehiclePnl } from "@/lib/data/vehicles";
import { getTopRemainingParts } from "@/lib/data/reports";
import { AppHeader } from "@/components/nav/app-header";
import { Card, DetailRow, SectionHeading, Stat } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ConditionBadge } from "@/components/ui/status-pill";
import { PartIconTile } from "@/lib/icons/part-icons";
import { formatMoney, formatPercent } from "@/lib/money";
import { SIDE_LABELS, formatDate, vehicleLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PartSide } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function VehiclePnlPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const profile = await getCurrentProfile();
  if (!hasFinanceAccess(profile)) redirect(`/vehicles/${id}`);

  const [vehicle, pnl, costs, topParts] = await Promise.all([
    getVehicle(id),
    getVehiclePnl(id),
    getVehicleFinance(id),
    getTopRemainingParts(id, 10),
  ]);

  if (!vehicle || !pnl) notFound();

  const recovered = pnl.parts_revenue_cents + pnl.scrap_income_cents;
  const pastBreakEven = pnl.break_even_remaining_cents === 0;
  const shelfValue = topParts.reduce((n, p) => n + p.asking_price_cents, 0);

  return (
    <>
      <AppHeader
        title={vehicleLabel(vehicle)}
        subtitle={`${vehicle.stock_number} · P&L, cash basis`}
        back={{ href: "/reports/vehicles" }}
        action={
          <Button asChild size="icon-sm" variant="ghost" aria-label="Export to CSV">
            <a href={`/api/export/vehicle?id=${id}`}>
              <FileDown className="size-4" />
            </a>
          </Button>
        }
      />

      <div className="space-y-5 px-3 py-4">
        {/* ------------------------------------------ Headline */}
        <div className="grid grid-cols-2 gap-2.5">
          <Stat
            label="Recovered"
            value={formatPercent(pnl.recovery_pct)}
            sub={`${formatMoney(recovered)} back`}
            tone={pastBreakEven ? "positive" : "default"}
          />
          <Stat
            label={pnl.gross_profit_cents >= 0 ? "Gross profit" : "Still down"}
            value={formatMoney(Math.abs(pnl.gross_profit_cents))}
            sub={pnl.gross_profit_cents >= 0 ? "Past break-even" : "Below break-even"}
            tone={pnl.gross_profit_cents >= 0 ? "positive" : "negative"}
          />
        </div>

        {/* Break-even marker: how much more revenue clears zero. */}
        <Card className="p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.05em] text-ink-subtle">
              <Target className="size-4" />
              Break-even
            </span>
            <span
              className={cn(
                "tnum text-[16px] font-semibold",
                pastBreakEven ? "text-available" : "text-ink",
              )}
            >
              {pastBreakEven
                ? "Cleared"
                : `${formatMoney(pnl.break_even_remaining_cents)} to go`}
            </span>
          </div>

          <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-surface-sunk">
            <div
              className={cn(
                "h-full rounded-full transition-[width]",
                pastBreakEven ? "bg-available" : "bg-accent",
              )}
              style={{ width: `${Math.min(100, pnl.recovery_pct ?? 0)}%` }}
            />
          </div>

          <div className="mt-2 flex justify-between text-[12px] text-ink-subtle">
            <span className="tnum">{formatMoney(recovered)} in</span>
            <span className="tnum">{formatMoney(pnl.total_invested_cents)} invested</span>
          </div>

          {!pastBreakEven && shelfValue > 0 && (
            <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-muted">
              The ten highest-priced parts still on the shelf are worth{" "}
              <span className="tnum font-semibold text-ink">{formatMoney(shelfValue)}</span> at
              asking. That alone{" "}
              {shelfValue >= pnl.break_even_remaining_cents
                ? "would clear break-even."
                : `covers ${formatPercent(
                    (shelfValue / pnl.break_even_remaining_cents) * 100,
                    0,
                  )} of what's left.`}
            </p>
          )}
        </Card>

        {/* ------------------------------------------ The ledger */}
        <section className="space-y-2">
          <SectionHeading>What went in</SectionHeading>
          <Card className="px-3.5 py-1">
            <dl className="divide-y divide-line">
              {costs && (
                <>
                  <DetailRow label="Purchase price" value={formatMoney(costs.purchase_price_cents)} />
                  {costs.auction_fee_cents > 0 && (
                    <DetailRow label="Auction fee" value={formatMoney(costs.auction_fee_cents)} />
                  )}
                  {costs.transport_cost_cents > 0 && (
                    <DetailRow label="Transport" value={formatMoney(costs.transport_cost_cents)} />
                  )}
                  {costs.other_acquisition_cost_cents > 0 && (
                    <DetailRow
                      label="Other acquisition"
                      value={formatMoney(costs.other_acquisition_cost_cents)}
                    />
                  )}
                </>
              )}
              <DetailRow label="Landed cost" value={formatMoney(pnl.landed_cost_cents)} />
              <DetailRow
                label="Direct expenses"
                value={formatMoney(pnl.direct_expenses_cents)}
              />
              <DetailRow
                label={<span className="font-semibold text-ink">Total invested</span>}
                value={
                  <span className="text-[15px] font-bold">
                    {formatMoney(pnl.total_invested_cents)}
                  </span>
                }
              />
            </dl>
          </Card>
        </section>

        <section className="space-y-2">
          <SectionHeading>What came back</SectionHeading>
          <Card className="px-3.5 py-1">
            <dl className="divide-y divide-line">
              <DetailRow label="Parts revenue" value={formatMoney(pnl.parts_revenue_cents)} />
              <DetailRow label="Scrap income" value={formatMoney(pnl.scrap_income_cents)} />
              <DetailRow
                label="Revenue per day held"
                value={`${formatMoney(pnl.revenue_per_day_cents)} · ${pnl.days_held} days`}
              />
              <DetailRow
                label="Catalogue moved"
                value={`${pnl.parts_sold} of ${pnl.parts_total} · ${formatPercent(pnl.pct_catalogue_moved)}`}
              />
              <DetailRow label="Still on the shelf" value={`${pnl.parts_remaining} parts`} />
              <DetailRow label="Bought" value={formatDate(pnl.purchase_date)} />
            </dl>
          </Card>
        </section>

        {/* ------------------------------- Top remaining parts */}
        {topParts.length > 0 && (
          <section className="space-y-2">
            <SectionHeading>Biggest money still on the shelf</SectionHeading>
            <Card className="divide-y divide-line overflow-hidden">
              {topParts.map((p) => {
                const side = SIDE_LABELS[p.side as PartSide];
                return (
                  <div key={p.part_id} className="flex items-center gap-3 px-3.5 py-2.5">
                    <PartIconTile iconKey={p.icon_key} category={p.category} size={20} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] text-ink">
                        {p.name}
                        {side && <span className="text-ink-subtle"> · {side}</span>}
                      </span>
                      {p.shelf_location && (
                        <span className="mt-0.5 flex items-center gap-1 text-[12px] text-ink-subtle">
                          <MapPin className="size-3 shrink-0" />
                          <span className="truncate">{p.shelf_location}</span>
                        </span>
                      )}
                    </span>
                    <ConditionBadge condition={p.condition} />
                    <span className="tnum shrink-0 text-[14.5px] font-semibold text-ink">
                      {formatMoney(p.asking_price_cents)}
                    </span>
                  </div>
                );
              })}
            </Card>
          </section>
        )}

        <div className="space-y-2.5">
          <Button asChild variant="secondary" size="lg" block>
            <Link href={`/vehicles/${id}`}>Open the vehicle</Link>
          </Button>
          <Button asChild variant="ghost" size="md" block>
            <a href={`/api/export/vehicle?id=${id}`}>
              <FileDown className="size-[18px]" />
              Export this P&amp;L to CSV
            </a>
          </Button>
        </div>
      </div>
    </>
  );
}
