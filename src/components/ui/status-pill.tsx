import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "@/lib/format";
import type { PartStatus, VehicleStatus } from "@/types/db";

/**
 * Status is always a filled pill, never coloured text -- colour alone is
 * not a signal you can rely on in daylight, or if you are colour blind,
 * so the pill carries the word too.
 */

const PART_TONE: Record<PartStatus, string> = {
  available: "bg-available-soft text-available",
  reserved: "bg-reserved-soft text-reserved",
  sold: "bg-sold-soft text-sold",
  kept: "bg-kept-soft text-kept",
  scrapped: "bg-scrapped-soft text-scrapped",
};

export function StatusPill({
  status,
  size = "md",
  className,
}: {
  status: PartStatus;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full font-semibold tracking-[0.01em]",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-[12px]",
        PART_TONE[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

const VEHICLE_TONE: Record<VehicleStatus, string> = {
  incoming: "bg-accent-soft text-accent",
  parting_out: "bg-available-soft text-available",
  depleted: "bg-sold-soft text-sold",
  scrapped: "bg-scrapped-soft text-scrapped",
};

const VEHICLE_LABEL: Record<VehicleStatus, string> = {
  incoming: "Incoming",
  parting_out: "Parting out",
  depleted: "Depleted",
  scrapped: "Scrapped",
};

export function VehicleStatusPill({
  status,
  className,
}: {
  status: VehicleStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[12px] font-semibold",
        VEHICLE_TONE[status],
        className,
      )}
    >
      {VEHICLE_LABEL[status]}
    </span>
  );
}

/** Grade badge for part condition. Neutral tones; damaged is the exception. */
export function ConditionBadge({
  condition,
  className,
}: {
  condition: "A" | "B" | "C" | "damaged";
  className?: string;
}) {
  const tone =
    condition === "damaged"
      ? "bg-scrapped-soft text-scrapped"
      : "bg-surface-2 text-ink-muted border border-line";
  return (
    <span
      className={cn(
        "inline-flex size-[22px] shrink-0 items-center justify-center rounded-md text-[11px] font-bold",
        condition === "damaged" && "w-auto px-1.5",
        tone,
        className,
      )}
      title={condition === "damaged" ? "Damaged" : `Condition ${condition}`}
    >
      {condition === "damaged" ? "DMG" : condition}
    </span>
  );
}
