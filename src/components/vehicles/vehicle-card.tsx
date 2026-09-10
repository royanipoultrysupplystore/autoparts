import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import { VehicleStatusPill } from "@/components/ui/status-pill";
import { formatDate, formatKm, vehicleLabel } from "@/lib/format";
import type { VehicleWithCounts } from "@/lib/data/vehicles";

/**
 * One car, as it appears in a list.
 *
 * The progress bar carries the only number that matters at a glance:
 * how much of this car has actually moved. Everything else -- what it
 * cost, what it has made back -- lives in the reports, where there is
 * room to label it properly.
 */
export function VehicleCard({ vehicle }: { vehicle: VehicleWithCounts }) {
  const moved =
    vehicle.parts_total > 0
      ? Math.round((vehicle.parts_sold / vehicle.parts_total) * 100)
      : 0;

  return (
    <Link href={`/vehicles/${vehicle.id}`} className="block">
      <Card className="p-3.5 transition-transform duration-150 ease-out-soft active:scale-[0.99] active:bg-surface-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[16px] font-semibold leading-snug text-ink">
              {vehicleLabel(vehicle)}
            </h2>
            <p className="tnum mt-0.5 text-[12.5px] text-ink-muted">
              {vehicle.stock_number}
              {vehicle.vin ? ` · VIN …${vehicle.vin.slice(-6)}` : ""}
              {vehicle.exterior_colour ? ` · ${vehicle.exterior_colour}` : ""}
            </p>
          </div>
          <VehicleStatusPill status={vehicle.status} />
        </div>

        <div className="mt-3 flex items-center gap-4 text-[12.5px] text-ink-muted">
          <span className="tnum">{formatKm(vehicle.mileage_km)}</span>
          <span className="tnum">In {formatDate(vehicle.purchase_date)}</span>
        </div>

        {vehicle.parts_total > 0 ? (
          <div className="mt-3">
            <div className="flex items-baseline justify-between text-[12.5px]">
              <span className="tnum text-ink-muted">
                <span className="font-semibold text-ink">{vehicle.parts_available}</span> on
                the shelf · {vehicle.parts_sold} sold
              </span>
              <span className="tnum text-ink-subtle">{moved}% moved</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-sunk">
              <div
                className="h-full rounded-full bg-available transition-[width] duration-300 ease-out-soft"
                style={{ width: `${moved}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="mt-2.5 rounded-lg bg-reserved-soft px-2.5 py-1.5 text-[12.5px] text-reserved">
            No parts generated yet — open this vehicle to build its list.
          </p>
        )}
      </Card>
    </Link>
  );
}
