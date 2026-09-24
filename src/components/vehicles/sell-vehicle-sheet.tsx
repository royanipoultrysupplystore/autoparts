"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, CircleAlert } from "lucide-react";
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
import { Field, Input, MoneyInput, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { centsToInput, formatMoney, parseMoneyToCents } from "@/lib/money";
import { todayInVancouver } from "@/lib/format";
import { sellVehicle } from "@/lib/actions/vehicles";

/**
 * Selling a car whole.
 *
 * A car bought to repair and resell earns its money in one sale, not two
 * hundred, and there was nowhere to record that except the edit form --
 * where you had to know to change the status to "Sold whole" and then
 * scroll to a section that only appeared once you had. Nobody was going
 * to find that, so it may as well not have existed.
 *
 * This is the same job as marking a part sold, and it sits where that
 * does: one button on the thing being sold.
 */
export function SellVehicleSheet({
  vehicleId,
  label,
  investedCents,
  currentPriceCents,
}: {
  vehicleId: string;
  label: string;
  /** Landed cost plus everything spent repairing it, so the margin is live. */
  investedCents: number;
  currentPriceCents: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [price, setPrice] = useState(centsToInput(currentPriceCents) || "");
  const [soldOn, setSoldOn] = useState(todayInVancouver());
  const [soldTo, setSoldTo] = useState("");
  const [notes, setNotes] = useState("");

  const cents = parseMoneyToCents(price);
  const profit = (cents ?? 0) - investedCents;

  function submit() {
    if (cents === null || cents <= 0) {
      setError("Enter what the car sold for.");
      return;
    }
    setError(null);

    startTransition(async () => {
      const result = await sellVehicle(vehicleId, {
        price,
        soldOn,
        soldTo: soldTo.trim() || null,
        notes: notes.trim() || null,
      });

      if (!result.ok) {
        setError(result.error ?? "Not saved.");
        return;
      }

      toast.success(`${label} is sold`, {
        description: `${formatMoney(cents)} — ${
          profit >= 0 ? `${formatMoney(profit)} ahead` : `${formatMoney(-profit)} down`
        } on what went into it.`,
      });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button size="lg" block onClick={() => setOpen(true)}>
        <BadgeCheck className="size-5" />
        Sell the whole car
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Sell {label}</SheetTitle>
            <SheetDescription>
              Records the sale of the whole car, not its parts.
            </SheetDescription>
          </SheetHeader>

          <SheetBody className="space-y-4">
            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-3">
                <CircleAlert className="mt-0.5 size-[18px] shrink-0 text-danger" />
                <p className="text-[13.5px] text-danger">{error}</p>
              </div>
            )}

            <Field label="Sold for" htmlFor="vehicle_sale_price" required>
              <MoneyInput
                id="vehicle_sale_price"
                value={price}
                onValueChange={setPrice}
                inputMode="decimal"
                className="h-16 text-[30px] font-semibold"
              />
            </Field>

            {cents !== null && cents > 0 && (
              <div
                className={`flex items-baseline justify-between rounded-lg px-3.5 py-3 ${
                  profit >= 0
                    ? "bg-available-soft text-available"
                    : "bg-danger-soft text-danger"
                }`}
              >
                <span className="text-[13px] font-medium">
                  {profit >= 0 ? "Ahead by" : "Down by"}
                </span>
                <span className="tnum text-[17px] font-semibold">
                  {formatMoney(Math.abs(profit))}
                </span>
              </div>
            )}

            <p className="text-[12.5px] leading-relaxed text-ink-subtle">
              {formatMoney(investedCents)} has gone into this car — what it cost to
              buy, plus every repair, inspection and transport expense recorded
              against it.
            </p>

            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Sold on" htmlFor="vehicle_sold_on">
                <Input
                  id="vehicle_sold_on"
                  type="date"
                  value={soldOn}
                  onChange={(e) => setSoldOn(e.target.value)}
                />
              </Field>

              <Field label="Sold to" htmlFor="vehicle_sold_to">
                <Input
                  id="vehicle_sold_to"
                  value={soldTo}
                  onChange={(e) => setSoldTo(e.target.value)}
                  placeholder="Buyer"
                  autoCapitalize="words"
                />
              </Field>
            </div>

            <Field label="Notes" htmlFor="vehicle_sale_notes">
              <Textarea
                id="vehicle_sale_notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Sold on Marketplace, picked up Saturday."
                className="min-h-[70px]"
              />
            </Field>

            <div className="pb-2" />
          </SheetBody>

          <SheetFooter>
            <div className="flex gap-2.5">
              <Button
                variant="secondary"
                size="lg"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button size="lg" block onClick={submit} disabled={pending || !price}>
                {pending ? "Saving…" : "Record the sale"}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
