"use client";

import { memo, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Store, Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, EmptyState } from "@/components/ui/primitives";
import { ConditionBadge, StatusPill } from "@/components/ui/status-pill";
import { PartIcon, categoryColour } from "@/lib/icons/part-icons";
import { MoneyInput } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { formatMoney, parseMoneyToCents } from "@/lib/money";
import { SIDE_LABELS } from "@/lib/format";
import { bulkSetPrices, publishParts } from "@/lib/actions/parts";
import { PartSheet, type SheetPart } from "@/components/parts/part-sheet";
import { AddPartSheet } from "@/components/parts/add-part-sheet";
import { useFinanceAccess } from "@/components/profile-provider";
import type { CatalogOption, Part, PartStatus } from "@/types/db";

type VehicleHead = {
  id: string;
  stock_number: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
};

export function VehicleParts({
  vehicle,
  parts,
  storefrontEnabled,
  catalog,
  categories,
}: {
  vehicle: VehicleHead;
  parts: Part[];
  storefrontEnabled: boolean;
  catalog: CatalogOption[];
  categories: string[];
}) {
  const router = useRouter();
  const finance = useFinanceAccess();
  const [pending, startTransition] = useTransition();

  const [openPart, setOpenPart] = useState<SheetPart | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPrice, setBulkPrice] = useState("");

  // Status flipped locally so the row greys out before the server answers.
  const [override, setOverride] = useState<Record<string, PartStatus>>({});

  const withStatus = useMemo(
    () => parts.map((p) => ({ ...p, status: override[p.id] ?? p.status })),
    [parts, override],
  );

  const groups = useMemo(() => {
    const map = new Map<string, typeof withStatus>();
    for (const p of withStatus) {
      const list = map.get(p.category);
      if (list) list.push(p);
      else map.set(p.category, [p]);
    }
    return [...map.entries()];
  }, [withStatus]);

  function openSheet(part: (typeof withStatus)[number]) {
    setOpenPart({
      id: part.id,
      name: part.name,
      category: part.category,
      icon_key: part.icon_key,
      side: part.side,
      condition: part.condition,
      status: part.status,
      asking_price_cents: part.asking_price_cents,
      shelf_location: part.shelf_location,
      notes: part.notes,
      reserved_for_name: part.reserved_for_name,
      reserved_until: part.reserved_until,
      vehicle_id: vehicle.id,
      stock_number: vehicle.stock_number,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim,
    });
    setSheetOpen(true);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectCategory(category: string) {
    const ids = withStatus
      .filter((p) => p.category === category && p.status !== "sold")
      .map((p) => p.id);
    const allIn = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allIn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function applyBulkPrice() {
    startTransition(async () => {
      const result = await bulkSetPrices([...selected], bulkPrice);
      if (!result.ok) {
        toast.error("Not priced", { description: result.error });
        return;
      }
      toast.success(
        `Priced ${selected.size} parts at ${formatMoney(parseMoneyToCents(bulkPrice) ?? 0)}`,
      );
      setSelected(new Set());
      setSelecting(false);
      setBulkPrice("");
      router.refresh();
    });
  }

  function publish(on: boolean) {
    startTransition(async () => {
      const result = await publishParts([...selected], on);
      if (!result.ok) {
        toast.error("Not published", { description: result.error });
        return;
      }
      toast.success(
        on
          ? `Published ${result.removed ?? selected.size} parts to the storefront`
          : `Removed ${result.removed ?? selected.size} parts from the storefront`,
      );
      setSelected(new Set());
      setSelecting(false);
      router.refresh();
    });
  }

  if (parts.length === 0) {
    return (
      <div className="space-y-3">
        <EmptyState
          title="No parts on this vehicle yet"
          body="The parts list is generated from the catalog when a vehicle is added. If it came up empty, generate it now."
          action={{ label: "Build the parts list", href: `/vehicles/${vehicle.id}/trim` }}
        />
        {finance && (
          <AddPartSheet
            vehicleId={vehicle.id}
            catalog={catalog}
            categories={categories}
          />
        )}
      </div>
    );
  }

  const selectable = withStatus.filter((p) => p.status !== "sold").length;

  return (
    <>
      {/* Selection toolbar */}
      <div className="mb-2.5 flex items-center justify-between gap-2 px-1">
        <span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-subtle">
          {parts.length} parts
        </span>
        {finance && selectable > 0 && (
          <button
            type="button"
            onClick={() => {
              setSelecting((s) => !s);
              setSelected(new Set());
            }}
            className="text-[13px] font-medium text-accent"
          >
            {selecting ? "Done" : "Select"}
          </button>
        )}
      </div>

      <div className="space-y-3">
        {groups.map(([category, items]) => {
          const isCollapsed = collapsed.has(category);
          const colour = categoryColour(category);
          const available = items.filter((p) => p.status === "available").length;

          return (
            <section key={category}>
              <div className="mb-1.5 flex items-center gap-2 px-1">
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (next.has(category)) next.delete(category);
                      else next.add(category);
                      return next;
                    })
                  }
                  className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
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
                    {available}/{items.length}
                  </span>
                </button>

                {selecting && (
                  <button
                    type="button"
                    onClick={() => selectCategory(category)}
                    className="shrink-0 rounded-full border border-line-strong bg-surface px-2.5 py-1 text-[12px] font-medium text-ink-muted active:bg-surface-2"
                  >
                    All
                  </button>
                )}
              </div>

              {!isCollapsed && (
                <Card className="overflow-hidden">
                  {items.map((p, i) => (
                    <PartRow
                      key={p.id}
                      part={p}
                      first={i === 0}
                      selecting={selecting}
                      selected={selected.has(p.id)}
                      onSelect={toggleSelect}
                      onOpen={() => openSheet(p)}
                    />
                  ))}
                </Card>
              )}
            </section>
          );
        })}
      </div>

      {/* Bulk action bar */}
      {selecting && selected.size > 0 && (
        <div className="pb-safe fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom,0px))] z-30 mx-auto max-w-[640px] border-t border-line bg-surface px-3 pb-3 pt-3 shadow-[var(--shadow-sheet)]">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="tnum text-[13.5px] font-medium text-ink">
              {selected.size} selected
            </span>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="flex items-center gap-1 text-[13px] text-ink-muted"
            >
              <X className="size-3.5" />
              Clear
            </button>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <MoneyInput
                value={bulkPrice}
                onValueChange={setBulkPrice}
                placeholder="Price all"
                aria-label="Price for all selected parts"
              />
            </div>
            <Button
              onClick={applyBulkPrice}
              disabled={pending || !bulkPrice}
              size="md"
            >
              <Tag className="size-[18px]" />
              Apply
            </Button>
          </div>

          {storefrontEnabled && (
            <div className="mt-2 flex gap-2">
              <Button variant="secondary" size="md" block onClick={() => publish(true)} disabled={pending}>
                <Store className="size-[18px]" />
                Publish
              </Button>
              <Button variant="ghost" size="md" block onClick={() => publish(false)} disabled={pending}>
                Unpublish
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Adding back something the trim removed, a second one of a part,
          or something the catalog never had. */}
      {finance && !selecting && (
        <div className="mt-4">
          <AddPartSheet
            vehicleId={vehicle.id}
            catalog={catalog}
            categories={categories}
          />
        </div>
      )}

      <PartSheet
        part={openPart}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onChanged={(id, status) => setOverride((o) => ({ ...o, [id]: status }))}
      />
    </>
  );
}

const PartRow = memo(function PartRow({
  part,
  first,
  selecting,
  selected,
  onSelect,
  onOpen,
}: {
  part: Part;
  first: boolean;
  selecting: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
  onOpen: () => void;
}) {
  const side = SIDE_LABELS[part.side];
  const dimmed = part.status === "sold" || part.status === "scrapped";

  const content = (
    <>
      {selecting ? (
        <Checkbox
          checked={selected}
          onCheckedChange={() => onSelect(part.id)}
          disabled={part.status === "sold"}
          className="shrink-0"
        />
      ) : (
        <PartIcon
          iconKey={part.icon_key}
          category={part.category}
          size={20}
          className={cn("shrink-0", dimmed ? "text-ink-subtle" : "text-ink-muted")}
        />
      )}

      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-[15px] leading-snug",
            dimmed ? "text-ink-subtle" : "text-ink",
          )}
        >
          {part.name}
          {side && <span className="text-ink-subtle"> · {side}</span>}
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-[12px] leading-tight text-ink-subtle">
          {part.shelf_location ? (
            <span className="truncate">{part.shelf_location}</span>
          ) : (
            <span className="italic">No shelf</span>
          )}
          {part.is_public && (
            <span className="shrink-0 rounded bg-accent-soft px-1 text-[10px] font-semibold uppercase text-accent">
              Live
            </span>
          )}
        </span>
      </span>

      <ConditionBadge condition={part.condition} />

      <span
        className={cn(
          "tnum w-[74px] shrink-0 text-right text-[14px] font-semibold",
          dimmed ? "text-ink-subtle" : "text-ink",
        )}
      >
        {part.asking_price_cents > 0 ? formatMoney(part.asking_price_cents) : "—"}
      </span>

      {part.status !== "available" && <StatusPill status={part.status} size="sm" />}
    </>
  );

  const className = cn(
    "flex w-full items-center gap-2.5 px-3 py-2.5 text-left",
    !first && "border-t border-line",
    dimmed && "bg-surface-2/50",
  );

  if (selecting) {
    return (
      <label className={cn(className, "cursor-pointer active:bg-surface-2")} style={{ minHeight: 52 }}>
        {content}
      </label>
    );
  }

  return (
    <button type="button" onClick={onOpen} className={cn(className, "active:bg-surface-2")} style={{ minHeight: 52 }}>
      {content}
    </button>
  );
});
