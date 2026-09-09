"use client";

import { memo, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PartIcon, categoryColour } from "@/lib/icons/part-icons";
import { SIDE_LABELS } from "@/lib/format";
import { toast } from "@/components/ui/toaster";
import { trimVehicleParts } from "@/lib/actions/parts";
import type { Part } from "@/types/db";

/**
 * "Trim the list".
 *
 * The catalog generates every part an ICE car can have -- well over two
 * hundred rows. Ticking them one at a time is not a job anybody will do
 * twice, so the fast paths are the point of this screen:
 *
 *   - whole-category toggles in a sticky header you meet as you scroll
 *   - "high value only", for a car that arrived mostly flattened
 *   - collapse, so the 13 categories fit on one thumb-scroll
 *
 * Deselecting marks a row for deletion; nothing is written until Save,
 * and Save sends only the ids being removed.
 */

export type TrimPart = Pick<Part, "id" | "name" | "category" | "icon_key" | "side"> & {
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

  function toggleOne(id: string) {
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

      toast.success(
        result.removed === 0
          ? `Kept the whole list for ${vehicleName}`
          : `Trimmed ${result.removed} part${result.removed === 1 ? "" : "s"} off ${vehicleName}`,
        { description: `${keptCount} parts are on the shelf.` },
      );
      router.replace(`/vehicles/${vehicleId}`);
      router.refresh();
    });
  }

  const allCollapsed = collapsed.size === groups.length;

  return (
    <>
      {/* Fast paths, above the list, where they are seen first. */}
      <div className="sticky top-0 z-20 border-b border-line bg-bg/95 px-3 py-2.5 backdrop-blur-md">
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
              <div className="sticky top-[57px] z-10 -mx-3 flex items-center gap-2 bg-bg/95 px-3 py-1.5 backdrop-blur-md">
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
                      onToggle={toggleOne}
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
        <div className="mb-2 flex items-baseline justify-between">
          <span className="tnum text-[13px] text-ink-muted">
            <span className="text-[15px] font-semibold text-ink">{keptCount}</span> of{" "}
            {parts.length} kept
          </span>
          {removed.size > 0 && (
            <span className="tnum text-[13px] text-danger">
              {removed.size} will be deleted
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
 * Memoised: toggling one row must not re-render the other 238.
 */
const TrimRow = memo(function TrimRow({
  part,
  kept,
  onToggle,
  first,
}: {
  part: TrimPart;
  kept: boolean;
  onToggle: (id: string) => void;
  first: boolean;
}) {
  const side = SIDE_LABELS[part.side];

  return (
    <label
      className={cn(
        "flex cursor-pointer select-none items-center gap-3 px-3 py-2.5 active:bg-surface-2",
        !first && "border-t border-line",
        !kept && "bg-surface-2/60",
      )}
      style={{ minHeight: 48 }}
    >
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
  );
});
