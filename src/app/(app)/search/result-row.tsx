"use client";

import { memo } from "react";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { PartIconTile } from "@/lib/icons/part-icons";
import { ConditionBadge, StatusPill } from "@/components/ui/status-pill";
import { formatMoney } from "@/lib/money";
import { SIDE_LABELS, formatKm, timeUntil } from "@/lib/format";
import type { SearchResult } from "@/types/db";

/**
 * One search result.
 *
 * Everything a partner needs to answer "do you have a front bumper for a
 * 2016 Civic" without opening anything: what it is, which car it came
 * off, what shape it is in, what it costs, and where it physically is.
 *
 * Memoised, because a realtime update to one row must not re-render the
 * other forty-nine.
 */
export const ResultRow = memo(function ResultRow({
  result,
  onOpen,
  justChanged,
}: {
  result: SearchResult;
  onOpen: (result: SearchResult) => void;
  /** Set briefly when another partner changed this row under our feet. */
  justChanged?: boolean;
}) {
  const side = SIDE_LABELS[result.side];
  const gone = result.status === "sold" || result.status === "scrapped";

  const detail = [
    formatKm(result.mileage_km),
    result.exterior_colour,
  ]
    .filter((v) => v && v !== "—")
    .join(" · ");

  return (
    <button
      type="button"
      onClick={() => onOpen(result)}
      className={cn(
        "flex w-full items-start gap-3 px-3 py-3 text-left transition-colors",
        "active:bg-surface-2",
        gone && "bg-surface-2/60",
        justChanged && "animate-in fade-in bg-accent-soft/60",
      )}
    >
      <PartIconTile
        iconKey={result.icon_key}
        category={result.category}
        className={cn(gone && "opacity-55")}
      />

      <span className="min-w-0 flex-1">
        {/* Line 1: what it is */}
        <span
          className={cn(
            "block truncate text-[16px] font-medium leading-snug",
            gone ? "text-ink-subtle" : "text-ink",
          )}
        >
          {result.name}
          {side && <span className="font-normal text-ink-subtle"> · {side}</span>}
        </span>

        {/* Line 2: which car */}
        <span className="mt-0.5 block truncate text-[13px] leading-snug text-ink-muted">
          {result.year} {result.make} {result.model}
          {result.trim ? ` ${result.trim}` : ""}
          {result.vin_last6 && (
            <span className="tnum text-ink-subtle"> · …{result.vin_last6}</span>
          )}
        </span>

        {/* Line 3: condition, mileage, colour, and where it physically is */}
        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <ConditionBadge condition={result.condition} />
          {detail && (
            <span className="tnum truncate text-[12px] text-ink-subtle">{detail}</span>
          )}
          {result.shelf_location && (
            <span className="inline-flex min-w-0 items-center gap-1 text-[12px] text-ink-subtle">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{result.shelf_location}</span>
            </span>
          )}
        </span>

        {result.status === "reserved" && result.reserved_until && (
          <span className="mt-1 block text-[12px] text-reserved">
            On hold{result.reserved_for_name ? ` for ${result.reserved_for_name}` : ""} ·
            expires {timeUntil(result.reserved_until)}
          </span>
        )}
      </span>

      <span className="flex shrink-0 flex-col items-end gap-1.5">
        <span
          className={cn(
            "tnum text-[16px] font-semibold leading-none",
            gone ? "text-ink-subtle line-through" : "text-ink",
          )}
        >
          {result.asking_price_cents > 0 ? formatMoney(result.asking_price_cents) : "—"}
        </span>
        <StatusPill status={result.status} size="sm" />
      </span>
    </button>
  );
});
