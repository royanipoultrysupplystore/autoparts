"use client";

import { memo, useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeDollarSign, Check, ChevronDown, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PartIcon, categoryColour } from "@/lib/icons/part-icons";
import { SIDE_LABELS } from "@/lib/format";
import { centsToInput, formatMoney, parseMoneyToCents } from "@/lib/money";
import { toast } from "@/components/ui/toaster";
import { setPartPrices, trimVehicleParts } from "@/lib/actions/parts";
import type { Part } from "@/types/db";

/**
 * "Trim and price".
 *
 * The catalog generates every part an ICE car can have -- well over two
 * hundred rows. Ticking them one at a time is not a job anybody will do
 * twice, so the fast paths are the point of this screen:
 *
 *   - whole-category toggles in a sticky header you meet as you scroll
 *   - "high value only", for a car that arrived mostly flattened
 *   - collapse, so the 13 categories fit on one thumb-scroll
 *   - one price typed once, then applied to a category or to everything
 *
 * Deselecting marks a row for deletion; nothing is written until Save,
 * and Save sends only the ids being removed.
 *
 * Pricing lives here because this is the one moment somebody is already
 * looking at every part of a car at once. A part priced here arrives at
 * the sell screen with its figure filled in, still editable -- which is
 * the difference between a sale that takes one tap and one that takes a
 * guess.
 */

export type TrimPart = Pick<
  Part,
  "id" | "name" | "category" | "icon_key" | "side" | "asking_price_cents"
> & {
  is_high_value: boolean;
};

export function TrimList({
  vehicleId,
  parts,
  vehicleName,
}: {
  vehicleId: string;
  parts: TrimPart[];
  vehicleName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Removed, not kept: the list is almost always shorter, and it is what
  // gets sent to the server.
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Raw strings, not cents, so a half-typed "12." is not fought with.
  const [prices, setPrices] = useState<Map<string, string>>(
    () =>
      new Map(
        parts
          .filter((p) => p.asking_price_cents > 0)
          .map((p) => [p.id, centsToInput(p.asking_price_cents)]),
      ),
  );
  const [bulkPrice, setBulkPrice] = useState("");

  const groups = useMemo(() => {
    const map = new Map<string, TrimPart[]>();
    for (const p of parts) {
      const list = map.get(p.category);
      if (list) list.push(p);
      else map.set(p.category, [p]);
    }
    return [...map.entries()];
  }, [parts]);

  const keptCount = parts.length - removed.size;

  // What the car is worth on the shelf as it stands, so the number at the
  // bottom moves while they type.
  const pricedTotal = useMemo(() => {
    let total = 0;
    let count = 0;
    for (const p of parts) {
      if (removed.has(p.id)) continue;
      const cents = parseMoneyToCents(prices.get(p.id) ?? "") ?? 0;
      if (cents > 0) {
        total += cents;
        count += 1;
      }
    }
    return { total, count };
  }, [parts, prices, removed]);

  // Stable identities: with a price box on every row, a handler that is
  // rebuilt each render would re-render all 239 rows on every keystroke.
  const toggleOne = useCallback((id: string) => {
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setOnePrice = useCallback((id: string, value: string) => {
    setPrices((prev) => {
      const next = new Map(prev);
      if (value === "") next.delete(id);
      else next.set(id, value);
      return next;
    });
  }, []);

  function setCategory(category: string, keep: boolean) {
    setRemoved((prev) => {
      const next = new Set(prev);
      for (const p of parts) {
        if (p.category !== category) continue;
        if (keep) next.delete(p.id);
        else next.add(p.id);
      }
      return next;
    });
  }

  /** Puts the price from the bar onto every kept row in `ids`. */
  function applyBulk(ids: string[], label: string) {
    const cents = parseMoneyToCents(bulkPrice);
    if (cents === null || cents <= 0) {
      toast.error("Type a price first", {
        description: "The box at the top of the screen sets what gets applied.",
      });
      return;
    }

    const targets = ids.filter((id) => !removed.has(id));
    if (targets.length === 0) return;

    setPrices((prev) => {
      const next = new Map(prev);
      for (const id of targets) next.set(id, bulkPrice);
      return next;
    });

    toast.success(`${formatMoney(cents)} on ${targets.length} parts`, {
      description: label,
    });
  }

  function keepAll() {
    setRemoved(new Set());
  }

  function keepHighValueOnly() {
    setRemoved(new Set(parts.filter((p) => !p.is_high_value).map((p) => p.id)));
  }

  function toggleCollapse(category: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function toggleCollapseAll() {
    setCollapsed((prev) =>
      prev.size === groups.length ? new Set() : new Set(groups.map(([c]) => c)),
    );
  }

  function save() {
    startTransition(async () => {
      const result = await trimVehicleParts(vehicleId, [...removed]);

      if (!result.ok) {
        toast.error("Could not save the trim", { description: result.error });
        return;
      }

      // Only what survived the trim, and only what carries a figure.
      const entries = parts
        .filter((p) => !removed.has(p.id))
        .map((p) => ({ id: p.id, price: prices.get(p.id) ?? "" }))
        .filter((e) => (parseMoneyToCents(e.price) ?? 0) > 0);

      const priceResult = await setPartPrices(entries);

      if (!priceResult.ok) {
        toast.error("Trimmed, but the prices did not save", {
          description: `${priceResult.error} — you can price parts from the vehicle screen.`,
          duration: 9000,
        });
        router.replace(`/vehicles/${vehicleId}`);
        router.refresh();
        return;
      }

      const priced = priceResult.priced ?? 0;

      toast.success(
        result.removed === 0
          ? `Kept the whole list for ${vehicleName}`
          : `Trimmed ${result.removed} part${result.removed === 1 ? "" : "s"} off ${vehicleName}`,
        {
          description:
            priced > 0
              ? `${keptCount} parts on the shelf, ${priced} priced.`
              : `${keptCount} parts are on the shelf.`,
        },
      );
      router.replace(`/vehicles/${vehicleId}`);
      router.refresh();
    });
  }

  const allCollapsed = collapsed.size === groups.length;
  const keptIds = useMemo(
    () => parts.filter((p) => !removed.has(p.id)).map((p) => p.id),
    [parts, removed],
  );

  return (
    <>
      {/* Fast paths, above the list, where they are seen first. */}
      <div className="sticky top-0 z-20 space-y-2 border-b border-line bg-bg/95 px-3 py-2.5 backdrop-blur-md">
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          <QuickAction onClick={keepAll} icon={<Check className="size-4" />} label="Keep all" />
          <QuickAction
            onClick={keepHighValueOnly}
            icon={<Sparkles className="size-4" />}
            label="High value only"
          />
          <QuickAction
            onClick={toggleCollapseAll}
            icon={
              <ChevronDown
                className={cn("size-4 transition-transform", allCollapsed && "-rotate-90")}
              />
            }
            label={allCollapsed ? "Expand all" : "Collapse all"}
          />
        </div>

        {/* One price, typed once. The $ button on each category header
            stamps it down that category; this stamps it everywhere. */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[14px] text-ink-subtle">
              $
            </span>
            <input
              value={bulkPrice}
              onChange={(e) => setBulkPrice(e.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              placeholder="Price to apply"
              aria-label="Price to apply to a category or to every kept part"
              className={cn(
                "h-10 w-full rounded-lg border border-line-strong bg-surface pl-6 pr-3",
                "text-[15px] text-ink placeholder:text-ink-subtle",
                "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25",
              )}
            />
          </div>
          <button
            type="button"
            onClick={() => applyBulk(keptIds, "Every part you are keeping")}
            className={cn(
              "shrink-0 rounded-lg border border-line-strong bg-surface px-3 text-[13px]",
              "font-medium text-ink-muted active:bg-surface-2",
            )}
            style={{ height: 40 }}
          >
            Apply to all
          </button>
        </div>
      </div>

      <div className="px-3 py-3">
        {groups.map(([category, items]) => {
          const removedHere = items.filter((p) => removed.has(p.id)).length;
          const keptHere = items.length - removedHere;
          const isCollapsed = collapsed.has(category);
          const colour = categoryColour(category);

          return (
            <section key={category} className="mb-3">
              {/* Sticky category header: the whole-category control lives
                  here, so it is always within reach while scrolling. */}
              <div className="sticky top-[107px] z-10 -mx-3 flex items-center gap-1.5 bg-bg/95 px-3 py-1.5 backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => toggleCollapse(category)}
                  className="tap flex min-w-0 flex-1 items-center gap-2 text-left"
                  aria-expanded={!isCollapsed}
                >
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-ink-subtle transition-transform",
                      isCollapsed && "-rotate-90",
                    )}
                  />
                  <span className={cn("flex size-6 items-center justify-center rounded", colour.bg, colour.fg)}>
                    <PartIcon category={category} size={15} />
                  </span>
                  <span className="truncate text-[13px] font-semibold uppercase tracking-[0.04em] text-ink-subtle">
                    {category}
                  </span>
                  <span className="tnum shrink-0 text-[12.5px] text-ink-subtle">
                    {keptHere}/{items.length}
                  </span>
                </button>

                {keptHere > 0 && (
                  <button
                    type="button"
                    onClick={() => applyBulk(items.map((p) => p.id), category)}
                    aria-label={`Apply the price to every kept part in ${category}`}
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full border",
                      "border-line-strong bg-surface text-ink-muted active:bg-surface-2",
                    )}
                  >
                    <BadgeDollarSign className="size-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setCategory(category, keptHere === 0)}
                  className={cn(
                    "shrink-0 rounded-full border px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                    keptHere === 0
                      ? "border-accent bg-accent text-accent-text"
                      : "border-line-strong bg-surface text-ink-muted active:bg-surface-2",
                  )}
                >
                  {keptHere === 0 ? "Keep all" : "Drop all"}
                </button>
              </div>

              {!isCollapsed && (
                <div className="overflow-hidden rounded-xl border border-line bg-surface">
                  {items.map((p, i) => (
                    <TrimRow
                      key={p.id}
                      part={p}
                      kept={!removed.has(p.id)}
                      price={prices.get(p.id) ?? ""}
                      onToggle={toggleOne}
                      onPrice={setOnePrice}
                      first={i === 0}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Primary action at the bottom, above the tab bar. */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[640px] border-t border-line bg-surface px-3 pb-3 pt-3">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="tnum text-[13px] text-ink-muted">
            <span className="text-[15px] font-semibold text-ink">{keptCount}</span> of{" "}
            {parts.length} kept
          </span>
          {removed.size > 0 && (
            <span className="tnum text-[13px] text-danger">
              {removed.size} will be deleted
            </span>
          )}
          {pricedTotal.count > 0 && (
            <span className="tnum truncate text-[13px] text-ink-muted">
              {pricedTotal.count} priced ·{" "}
              <span className="font-semibold text-ink">{formatMoney(pricedTotal.total)}</span>
            </span>
          )}
        </div>
        <Button size="lg" block onClick={save} disabled={pending}>
          {pending
            ? "Saving…"
            : removed.size === 0
              ? `Keep all ${parts.length} parts`
              : `Keep ${keptCount} parts`}
        </Button>
      </div>

      {/* Clears the fixed footer. */}
      <div className="h-[104px]" />
    </>
  );
}

function QuickAction({
  onClick,
  icon,
  label,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3.5 py-2 text-[13px] font-medium text-ink-muted active:bg-surface-2"
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * Memoised: typing a price in one row must not re-render the other 238.
 * That only holds because every handler it receives is stable.
 */
const TrimRow = memo(function TrimRow({
  part,
  kept,
  price,
  onToggle,
  onPrice,
  first,
}: {
  part: TrimPart;
  kept: boolean;
  price: string;
  onToggle: (id: string) => void;
  onPrice: (id: string, value: string) => void;
  first: boolean;
}) {
  const side = SIDE_LABELS[part.side];

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2",
        !first && "border-t border-line",
        !kept && "bg-surface-2/60",
      )}
      style={{ minHeight: 52 }}
    >
      {/*
        The label covers the tick and the name only. A price box inside a
        <label> would toggle the row every time it was tapped.
      */}
      <label className="flex min-w-0 flex-1 cursor-pointer select-none items-center gap-3 py-0.5 active:opacity-70">
        <Checkbox checked={kept} onCheckedChange={() => onToggle(part.id)} />

        <PartIcon
          iconKey={part.icon_key}
          category={part.category}
          size={20}
          className={cn("shrink-0", kept ? "text-ink-muted" : "text-ink-subtle")}
        />

        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-[15px] leading-snug",
              kept ? "text-ink" : "text-ink-subtle line-through decoration-1",
            )}
          >
            {part.name}
          </span>
          {side && (
            <span className="block text-[12px] leading-tight text-ink-subtle">{side}</span>
          )}
        </span>

        {part.is_high_value && kept && (
          <span className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-accent">
            $$
          </span>
        )}
        {!kept && <X className="size-4 shrink-0 text-ink-subtle" />}
      </label>

      {kept && (
        <div className="relative w-[92px] shrink-0">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[13px] text-ink-subtle">
            $
          </span>
          <input
            value={price}
            onChange={(e) => onPrice(part.id, e.target.value.replace(/[^\d.]/g, ""))}
            inputMode="decimal"
            placeholder="—"
            aria-label={`Asking price for ${part.name}`}
            className={cn(
              "h-9 w-full rounded-lg border border-line-strong bg-surface pl-5 pr-2",
              "tnum text-right text-[14px] text-ink placeholder:text-ink-subtle",
              "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25",
            )}
          />
        </div>
      )}
    </div>
  );
});
