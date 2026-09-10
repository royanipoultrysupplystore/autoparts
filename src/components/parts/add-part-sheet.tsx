"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Search as SearchIcon, X } from "lucide-react";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, NativeSelect } from "@/components/ui/field";
import { PartIcon, categoryColour } from "@/lib/icons/part-icons";
import { toast } from "@/components/ui/toaster";
import { addPart } from "@/lib/actions/parts";
import { CONDITIONS } from "@/lib/vehicle-options";
import { SIDE_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CatalogOption, PartCondition, PartSide } from "@/types/db";

/**
 * Adding a part the generator did not create.
 *
 * Two ways in, because both happen in a real yard:
 *
 *   - from the catalog, when the car has something the trim screen took
 *     away, or a second one of a part that normally comes as one
 *   - as a one-off, for something the catalog has never heard of: a
 *     towing package, a snow plough mount, an aftermarket stereo
 *
 * A custom part carries no catalog_id, so it is exempt from the unique
 * "one per vehicle/catalog/side" rule -- you can add as many as the car
 * actually had.
 */

const ALL_SIDES: PartSide[] = [
  "none", "left", "right", "front", "rear",
  "front_left", "front_right", "rear_left", "rear_right",
];

export function AddPartSheet({
  vehicleId,
  catalog,
  categories,
}: {
  vehicleId: string;
  catalog: CatalogOption[];
  categories: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [mode, setMode] = useState<"catalog" | "custom">("catalog");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<CatalogOption | null>(null);

  const [customName, setCustomName] = useState("");
  const [customCategory, setCustomCategory] = useState(categories[0] ?? "Interior");

  const [side, setSide] = useState<PartSide>("none");
  const [condition, setCondition] = useState<PartCondition>("B");
  const [price, setPrice] = useState("");
  const [shelf, setShelf] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog.slice(0, 40);

    const tokens = q.split(/\s+/);
    return catalog
      .filter((c) => {
        const hay = `${c.name} ${c.category}`.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      })
      .slice(0, 40);
  }, [catalog, query]);

  function reset() {
    setMode("catalog");
    setQuery("");
    setPicked(null);
    setCustomName("");
    setSide("none");
    setCondition("B");
    setPrice("");
    setShelf("");
  }

  function choose(entry: CatalogOption) {
    setPicked(entry);
    // Start on the side this part usually comes in, so the common case
    // is one tap rather than two.
    setSide(entry.default_sides[0] ?? "none");
  }

  const ready =
    mode === "catalog" ? picked !== null : customName.trim().length > 0;

  function submit() {
    startTransition(async () => {
      const result = await addPart(vehicleId, {
        catalogId: mode === "catalog" ? picked!.id : null,
        name: mode === "catalog" ? picked!.name : customName.trim(),
        category: mode === "catalog" ? picked!.category : customCategory,
        iconKey: mode === "catalog" ? picked!.icon_key : "generic-part",
        side,
        condition,
        priceInput: price,
        shelfLocation: shelf.trim() || null,
      });

      if (!result.ok) {
        toast.error("Not added", { description: result.error });
        return;
      }

      const label = mode === "catalog" ? picked!.name : customName.trim();
      toast.success(`Added ${label}`, {
        description: SIDE_LABELS[side] || undefined,
      });
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="secondary"
        size="md"
        block
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Plus className="size-[18px]" />
        Add a part
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent tall>
          <SheetHeader>
            <SheetTitle>Add a part</SheetTitle>
            <SheetDescription>
              Something the trim screen removed, a second one, or something the
              catalog has never heard of.
            </SheetDescription>
          </SheetHeader>

          <SheetBody className="space-y-4">
            {/* Which kind */}
            <div className="grid grid-cols-2 gap-2">
              {(["catalog", "custom"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m);
                    setPicked(null);
                  }}
                  className={cn(
                    "tap rounded-lg border text-[14px] font-medium transition-colors",
                    mode === m
                      ? "border-accent bg-accent text-accent-text"
                      : "border-line-strong bg-surface text-ink-muted active:bg-surface-2",
                  )}
                >
                  {m === "catalog" ? "From the catalog" : "One-off part"}
                </button>
              ))}
            </div>

            {mode === "catalog" ? (
              picked ? (
                <div className="flex items-center gap-3 rounded-xl border border-accent-border bg-accent-soft px-3.5 py-3">
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg",
                      categoryColour(picked.category).bg,
                      categoryColour(picked.category).fg,
                    )}
                  >
                    <PartIcon iconKey={picked.icon_key} category={picked.category} size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-ink">
                      {picked.name}
                    </span>
                    <span className="block text-[12.5px] text-ink-muted">
                      {picked.category}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setPicked(null)}
                    aria-label="Choose a different part"
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg text-accent active:bg-surface-2"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-ink-subtle" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="bumper, alternator, seat…"
                      className="pl-10"
                      autoFocus
                      autoCapitalize="none"
                      autoCorrect="off"
                    />
                  </div>

                  <div className="overflow-hidden rounded-xl border border-line">
                    {matches.length === 0 ? (
                      <p className="px-3.5 py-6 text-center text-[13.5px] text-ink-muted">
                        Nothing in the catalog matches that.
                        <br />
                        <button
                          type="button"
                          onClick={() => {
                            setMode("custom");
                            setCustomName(query);
                          }}
                          className="mt-2 font-medium text-accent underline"
                        >
                          Add &ldquo;{query.trim()}&rdquo; as a one-off instead
                        </button>
                      </p>
                    ) : (
                      matches.map((c, i) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => choose(c)}
                          className={cn(
                            "flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-surface-2",
                            i > 0 && "border-t border-line",
                          )}
                          style={{ minHeight: 48 }}
                        >
                          <PartIcon
                            iconKey={c.icon_key}
                            category={c.category}
                            size={20}
                            className="shrink-0 text-ink-muted"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14.5px] text-ink">
                              {c.name}
                            </span>
                            <span className="block truncate text-[12px] text-ink-subtle">
                              {c.category}
                            </span>
                          </span>
                          {c.is_high_value && (
                            <span className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-accent">
                              $$
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </>
              )
            ) : (
              <>
                <Field
                  label="What is it"
                  htmlFor="custom_name"
                  required
                  hint="Whatever you'd call it when a customer asks."
                >
                  <Input
                    id="custom_name"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="Tow hitch receiver"
                    autoCapitalize="sentences"
                    autoFocus
                  />
                </Field>

                <Field label="Files under" htmlFor="custom_category">
                  <NativeSelect
                    id="custom_category"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </>
            )}

            {/* Shared details, once there is something to describe */}
            {ready && (
              <>
                <Field label="Which side" htmlFor="add_side">
                  <NativeSelect
                    id="add_side"
                    value={side}
                    onChange={(e) => setSide(e.target.value as PartSide)}
                  >
                    {ALL_SIDES.map((s) => (
                      <option key={s} value={s}>
                        {s === "none" ? "Not sided" : SIDE_LABELS[s]}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>

                <div className="grid grid-cols-2 gap-2.5">
                  <Field label="Condition" htmlFor="add_condition">
                    <NativeSelect
                      id="add_condition"
                      value={condition}
                      onChange={(e) => setCondition(e.target.value as PartCondition)}
                    >
                      {CONDITIONS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>

                  <Field label="Asking price" htmlFor="add_price">
                    <MoneyInput id="add_price" value={price} onValueChange={setPrice} />
                  </Field>
                </div>

                <Field label="Shelf location" htmlFor="add_shelf">
                  <Input
                    id="add_shelf"
                    value={shelf}
                    onChange={(e) => setShelf(e.target.value)}
                    placeholder="Rack 3, bin B"
                  />
                </Field>
              </>
            )}

            <div className="pb-2" />
          </SheetBody>

          <SheetFooter>
            <div className="flex gap-2.5">
              <Button variant="secondary" size="lg" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button size="lg" block onClick={submit} disabled={pending || !ready}>
                {pending ? (
                  "Adding…"
                ) : (
                  <>
                    <Check className="size-[18px]" />
                    Add to this vehicle
                  </>
                )}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
