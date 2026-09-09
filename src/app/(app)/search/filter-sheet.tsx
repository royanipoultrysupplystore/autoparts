"use client";

import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { CONDITIONS } from "@/lib/vehicle-options";
import { STATUS_LABELS } from "@/lib/format";
import type { PartCondition, PartStatus } from "@/types/db";

export type Filters = {
  makes: string[];
  models: string[];
  yearMin: string;
  yearMax: string;
  conditions: PartCondition[];
  categories: string[];
  statuses: PartStatus[];
};

export const EMPTY_FILTERS: Filters = {
  makes: [],
  models: [],
  yearMin: "",
  yearMax: "",
  conditions: [],
  categories: [],
  statuses: ["available"],
};

export function countActiveFilters(f: Filters): number {
  return (
    f.makes.length +
    f.models.length +
    (f.yearMin ? 1 : 0) +
    (f.yearMax ? 1 : 0) +
    f.conditions.length +
    f.categories.length +
    // The default is available-only; anything else counts as a choice.
    (f.statuses.length === 1 && f.statuses[0] === "available" ? 0 : 1)
  );
}

const ALL_STATUSES: PartStatus[] = ["available", "reserved", "sold", "kept", "scrapped"];

export function FilterSheet({
  filters,
  onApply,
  options,
}: {
  filters: Filters;
  onApply: (f: Filters) => void;
  options: { makes: string[]; models: string[]; categories: string[] };
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Filters>(filters);

  const active = countActiveFilters(filters);

  function openSheet() {
    setDraft(filters);
    setOpen(true);
  }

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        className={cn(
          "tap flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
          active > 0
            ? "border-accent bg-accent text-accent-text"
            : "border-line-strong bg-surface text-ink-muted active:bg-surface-2",
        )}
      >
        <SlidersHorizontal className="size-4" />
        Filters
        {active > 0 && (
          <span className="tnum rounded-full bg-accent-text/20 px-1.5 text-[11px]">
            {active}
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent tall>
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>

          <SheetBody className="space-y-5">
            {/* Status first: it is the one people change most. */}
            <Field label="Status">
              <div className="flex flex-wrap gap-2">
                {ALL_STATUSES.map((s) => (
                  <Chip
                    key={s}
                    label={STATUS_LABELS[s]}
                    selected={draft.statuses.includes(s)}
                    onClick={() =>
                      setDraft((d) => {
                        const next = toggle(d.statuses, s);
                        // Never leave the list empty -- that returns nothing
                        // and reads as a broken screen.
                        return { ...d, statuses: next.length ? next : ["available"] };
                      })
                    }
                  />
                ))}
              </div>
            </Field>

            <Field label="Condition">
              <div className="flex flex-wrap gap-2">
                {CONDITIONS.map((c) => (
                  <Chip
                    key={c.value}
                    label={c.label}
                    selected={draft.conditions.includes(c.value)}
                    onClick={() =>
                      setDraft((d) => ({ ...d, conditions: toggle(d.conditions, c.value) }))
                    }
                  />
                ))}
              </div>
            </Field>

            <Field label="Year range">
              <div className="flex items-center gap-2">
                <Input
                  inputMode="numeric"
                  placeholder="From"
                  className="tnum"
                  value={draft.yearMin}
                  onChange={(e) => setDraft((d) => ({ ...d, yearMin: e.target.value }))}
                />
                <span className="text-ink-subtle">–</span>
                <Input
                  inputMode="numeric"
                  placeholder="To"
                  className="tnum"
                  value={draft.yearMax}
                  onChange={(e) => setDraft((d) => ({ ...d, yearMax: e.target.value }))}
                />
              </div>
            </Field>

            {options.makes.length > 0 && (
              <Field label="Make">
                <div className="flex flex-wrap gap-2">
                  {options.makes.map((m) => (
                    <Chip
                      key={m}
                      label={m}
                      selected={draft.makes.includes(m)}
                      onClick={() => setDraft((d) => ({ ...d, makes: toggle(d.makes, m) }))}
                    />
                  ))}
                </div>
              </Field>
            )}

            {options.models.length > 0 && (
              <Field label="Model">
                <div className="flex flex-wrap gap-2">
                  {options.models.map((m) => (
                    <Chip
                      key={m}
                      label={m}
                      selected={draft.models.includes(m)}
                      onClick={() => setDraft((d) => ({ ...d, models: toggle(d.models, m) }))}
                    />
                  ))}
                </div>
              </Field>
            )}

            <Field label="Category" htmlFor="category-filter">
              <NativeSelect
                id="category-filter"
                value={draft.categories[0] ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    categories: e.target.value ? [e.target.value] : [],
                  }))
                }
              >
                <option value="">Every category</option>
                {options.categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <div className="pb-2" />
          </SheetBody>

          <SheetFooter>
            <div className="flex gap-2.5">
              <Button
                variant="secondary"
                size="lg"
                onClick={() => setDraft(EMPTY_FILTERS)}
                disabled={countActiveFilters(draft) === 0}
              >
                <X className="size-[18px]" />
                Clear
              </Button>
              <Button
                size="lg"
                block
                onClick={() => {
                  onApply(draft);
                  setOpen(false);
                }}
              >
                Show results
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "rounded-full border px-3 py-2 text-[13px] font-medium transition-colors",
        selected
          ? "border-accent bg-accent text-accent-text"
          : "border-line-strong bg-surface text-ink-muted active:bg-surface-2",
      )}
    >
      {label}
    </button>
  );
}
