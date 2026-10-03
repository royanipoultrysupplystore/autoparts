"use client";

import { useMemo, useState } from "react";
import { Car, Check, ChevronDown, Search as SearchIcon, X } from "lucide-react";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { SearchVehicle } from "@/types/db";

export function vehicleShortLabel(v: SearchVehicle): string {
  return `${v.year} ${v.make} ${v.model}`;
}

/**
 * Pick the car first, then search inside it.
 *
 * With a dozen cars in the yard, "mirror" comes back as a mirror from
 * every one of them and the partner scrolls for the Civic the customer
 * is asking about. Choosing the car up front makes every search after it
 * a search of that one car.
 */
export function VehiclePicker({
  vehicles,
  selected,
  onSelect,
}: {
  vehicles: SearchVehicle[];
  selected: SearchVehicle | null;
  onSelect: (vehicle: SearchVehicle | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

  // Every word typed must appear somewhere in the car's description, so
  // "civic 08", "0017" and "blue" all narrow the list.
  const shown = useMemo(() => {
    const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return vehicles;
    return vehicles.filter((v) => {
      const text = [
        v.stock_number,
        v.year,
        String(v.year).slice(2),
        v.make,
        v.model,
        v.trim,
        v.exterior_colour,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [filter, vehicles]);

  function choose(v: SearchVehicle | null) {
    onSelect(v);
    setOpen(false);
    setFilter("");
  }

  return (
    <>
      {selected ? (
        <span className="flex h-11 shrink-0 items-center rounded-full border border-accent bg-accent text-accent-text">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-full items-center gap-1.5 pl-3.5 pr-1 text-[13px] font-medium"
          >
            <Car className="size-4" />
            <span className="max-w-[46vw] truncate">
              {vehicleShortLabel(selected)} · {selected.stock_number}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onSelect(null)}
            aria-label="Search all cars"
            className="flex size-11 items-center justify-center rounded-full"
          >
            <X className="size-4" />
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="tap flex shrink-0 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3.5 text-[13px] font-medium text-ink active:bg-surface-2"
        >
          <Car className="size-4" />
          All cars
          <ChevronDown className="size-4 text-ink-subtle" />
        </button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent tall>
          <SheetHeader>
            <SheetTitle>Which car?</SheetTitle>
            <SheetDescription>Searches will look only at the car you pick.</SheetDescription>
          </SheetHeader>

          <div className="px-4 pb-2">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-ink-subtle" />
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="civic, 0017, blue…"
                aria-label="Find a car"
                className={cn(
                  "h-12 w-full rounded-xl border border-line-strong bg-surface pl-10 pr-3",
                  "text-[16px] text-ink placeholder:text-ink-subtle",
                  "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25",
                  "[&::-webkit-search-cancel-button]:hidden",
                )}
              />
            </div>
          </div>

          <SheetBody className="pb-4">
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              <button
                type="button"
                onClick={() => choose(null)}
                className="flex min-h-[52px] w-full items-center gap-3 px-3.5 py-2.5 text-left active:bg-surface-2"
              >
                <span className="min-w-0 flex-1 text-[15px] font-medium text-ink">
                  All cars
                  <span className="block text-[12.5px] font-normal text-ink-subtle">
                    Search every part in the yard
                  </span>
                </span>
                {!selected && <Check className="size-5 shrink-0 text-accent" />}
              </button>

              {shown.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => choose(v)}
                  className="flex min-h-[52px] w-full items-center gap-3 border-t border-line px-3.5 py-2.5 text-left active:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-ink">
                      {vehicleShortLabel(v)}
                      {v.trim ? ` ${v.trim}` : ""}
                    </span>
                    <span className="block truncate text-[12.5px] text-ink-subtle">
                      {v.stock_number}
                      {v.exterior_colour ? ` · ${v.exterior_colour}` : ""}
                    </span>
                  </span>
                  {selected?.id === v.id && <Check className="size-5 shrink-0 text-accent" />}
                </button>
              ))}
            </div>

            {shown.length === 0 && (
              <p className="px-1 pt-3 text-[13px] text-ink-muted">
                No car matches “{filter.trim()}”. Try the make, the model, or the stock
                number.
              </p>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
