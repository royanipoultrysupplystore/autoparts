import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Scissors } from "lucide-react";
import {
  getVehicle,
  getVehicleFinance,
  getVehicleParts,
  getVehiclePnl,
} from "@/lib/data/vehicles";
import { getCurrentProfile, hasFinanceAccess } from "@/lib/supabase/server";
import { categoriesFrom, getActiveCatalog } from "@/lib/data/catalog";
import { AppHeader } from "@/components/nav/app-header";
import { Card, DetailRow, SectionHeading, Stat } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { VehicleStatusPill } from "@/components/ui/status-pill";
import { formatMoney, formatPercent } from "@/lib/money";
import { formatDate, formatKm, vehicleLabel } from "@/lib/format";
import { SOURCE_LABEL } from "@/lib/vehicle-options";
import { VehicleParts } from "./vehicle-parts";
import { VehicleDangerZone } from "./danger-zone";
import { BODY_TYPES, DRIVETRAINS, FUEL_TYPES, TRANSMISSIONS } from "@/lib/vehicle-options";

export const dynamic = "force-dynamic";

const label = <T extends { value: string; label: string }>(list: T[], v: string | null) =>
  list.find((x) => x.value === v)?.label ?? null;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vehicle = await getVehicle(id);
  return { title: vehicle ? `${vehicleLabel(vehicle)} · ${vehicle.stock_number}` : "Vehicle" };
}

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [vehicle, profile] = await Promise.all([getVehicle(id), getCurrentProfile()]);
  if (!vehicle) notFound();

  const finance = hasFinanceAccess(profile);
  const [parts, costs, pnl, catalog] = await Promise.all([
    getVehicleParts(id),
    finance ? getVehicleFinance(id) : Promise.resolve(null),
    finance ? getVehiclePnl(id) : Promise.resolve(null),
    finance ? getActiveCatalog() : Promise.resolve([]),
  ]);

  const storefrontEnabled = process.env.NEXT_PUBLIC_ENABLE_STOREFRONT === "true";

  const spec = [
    label(BODY_TYPES, vehicle.body_type),
    vehicle.engine,
    label(TRANSMISSIONS, vehicle.transmission),
    label(DRIVETRAINS, vehicle.drivetrain),
    label(FUEL_TYPES, vehicle.fuel_type),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <AppHeader
        title={vehicleLabel(vehicle)}
        subtitle={`${vehicle.stock_number}${vehicle.vin ? ` · VIN …${vehicle.vin.slice(-6)}` : ""}`}
        back={{ href: "/vehicles" }}
        action={
          finance ? (
            <Button asChild size="icon-sm" variant="ghost" aria-label="Edit vehicle">
              <Link href={`/vehicles/${id}/edit`}>
                <Pencil className="size-4" />
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-5 px-3 py-4">
        {/* ------------------------------------------------ Identity */}
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] text-ink-muted">{spec || "No specification recorded"}</p>
            </div>
            <VehicleStatusPill status={vehicle.status} />
          </div>

          <dl className="mt-3 divide-y divide-line border-t border-line">
            <DetailRow label="Mileage" value={formatKm(vehicle.mileage_km)} />
            <DetailRow label="Colour" value={vehicle.exterior_colour ?? "—"} />
            <DetailRow label="Bought" value={formatDate(vehicle.purchase_date)} />
            <DetailRow
              label="Source"
              value={`${SOURCE_LABEL[vehicle.source]}${vehicle.lot_number ? ` · ${vehicle.lot_number}` : ""}`}
            />
          </dl>

          {vehicle.notes && (
            <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2.5 text-[13.5px] leading-relaxed text-ink-muted">
              {vehicle.notes}
            </p>
          )}
        </Card>

        {/* ------------------------------------------------ The money */}
        {finance && pnl && (
          <section className="space-y-2">
            <SectionHeading
              action={
                <Link href={`/reports/vehicle/${id}`} className="text-[13px] font-medium text-accent">
                  Full P&amp;L
                </Link>
              }
            >
              Money
            </SectionHeading>

            <div className="grid grid-cols-2 gap-2.5">
              <Stat
                label="Recovered"
                value={formatPercent(pnl.recovery_pct)}
                sub={`of ${formatMoney(pnl.total_invested_cents)} in`}
                tone={
                  pnl.recovery_pct === null
                    ? "muted"
                    : pnl.recovery_pct >= 100
                      ? "positive"
                      : "default"
                }
              />
              <Stat
                label={pnl.gross_profit_cents >= 0 ? "Profit" : "Still down"}
                value={formatMoney(Math.abs(pnl.gross_profit_cents))}
                sub={
                  pnl.break_even_remaining_cents > 0
                    ? `${formatMoney(pnl.break_even_remaining_cents)} to break even`
                    : "Past break-even"
                }
                tone={pnl.gross_profit_cents >= 0 ? "positive" : "negative"}
              />
            </div>

            <Card className="px-3.5 py-1">
              <dl className="divide-y divide-line">
                <DetailRow label="Landed cost" value={formatMoney(pnl.landed_cost_cents)} />
                <DetailRow label="Direct expenses" value={formatMoney(pnl.direct_expenses_cents)} />
                <DetailRow label="Parts revenue" value={formatMoney(pnl.parts_revenue_cents)} />
                {costs && costs.scrap_income_cents > 0 && (
                  <DetailRow label="Scrap income" value={formatMoney(costs.scrap_income_cents)} />
                )}
                <DetailRow
                  label="Held"
                  value={`${pnl.days_held} days · ${formatMoney(pnl.revenue_per_day_cents)}/day`}
                />
                <DetailRow
                  label="Catalogue moved"
                  value={`${pnl.parts_sold} of ${pnl.parts_total} · ${formatPercent(pnl.pct_catalogue_moved)}`}
                />
              </dl>
            </Card>
          </section>
        )}

        {!finance && (
          <Card className="p-3.5">
            <p className="text-[13px] leading-relaxed text-ink-muted">
              Costs and profit for this vehicle are limited to owners and partners.
              You can still search, price, and sell every part below.
            </p>
          </Card>
        )}

        {/* ------------------------------------------------ The parts */}
        <section>
          {finance && parts.length > 0 && (
            <div className="mb-3">
              <Button asChild variant="secondary" size="md" block>
                <Link href={`/vehicles/${id}/trim`}>
                  <Scissors className="size-[18px]" />
                  Trim the parts list
                </Link>
              </Button>
            </div>
          )}

          <VehicleParts
            vehicle={{
              id: vehicle.id,
              stock_number: vehicle.stock_number,
              year: vehicle.year,
              make: vehicle.make,
              model: vehicle.model,
              trim: vehicle.trim,
            }}
            parts={parts}
            storefrontEnabled={storefrontEnabled}
            catalog={catalog}
            categories={categoriesFrom(catalog)}
          />
        </section>

        {finance && <VehicleDangerZone vehicleId={id} label={vehicleLabel(vehicle)} />}
      </div>
    </>
  );
}
