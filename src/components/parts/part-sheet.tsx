"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Clock, MapPin, Pencil, Trash, TriangleAlert } from "lucide-react";
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
import { SimpleSelect } from "@/components/ui/select";
import { ConditionBadge, StatusPill } from "@/components/ui/status-pill";
import { DetailRow, Divider } from "@/components/ui/primitives";
import { PartIconTile } from "@/lib/icons/part-icons";
import { toast } from "@/components/ui/toaster";
import { centsToInput, formatMoney, parseMoneyToCents } from "@/lib/money";
import { CONDITION_LABELS, formatDateTime, partTitle, timeAgo, timeUntil } from "@/lib/format";
import { CONDITIONS, PAYMENT_METHODS } from "@/lib/vehicle-options";
import { releaseReservation, reservePart, sellPart } from "@/lib/actions/sales";
import { deletePart, updatePart } from "@/lib/actions/parts";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { useFinanceAccess, useProfile } from "@/components/profile-provider";
import { cn } from "@/lib/utils";
import type { PartCondition, PartSide, PartStatus, PaymentMethod } from "@/types/db";

export type SheetPart = {
  id: string;
  name: string;
  category: string;
  icon_key: string;
  side: PartSide;
  condition: PartCondition;
  status: PartStatus;
  asking_price_cents: number;
  shelf_location: string | null;
  notes?: string | null;
  reserved_for_name?: string | null;
  reserved_until?: string | null;
  vehicle_id: string;
  stock_number: string;
  year: number;
  make: string;
  model: string;
  trim?: string | null;
};

type Mode = "detail" | "sell" | "reserve" | "edit";

export function PartSheet({
  part,
  open,
  onOpenChange,
  onChanged,
}: {
  part: SheetPart | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lets the caller update its own list optimistically. */
  onChanged?: (partId: string, status: PartStatus) => void;
}) {
  if (!part) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/*
        Radix unmounts the content when the sheet closes, and the key
        changes when a different part is tapped. Between them, the view
        state below is fresh on every open -- so there is no effect
        resetting it back to "detail", and no chance of a sheet opening
        on the sell form because that is where it was left last time.
      */}
      <PartSheetView
        key={part.id}
        part={part}
        onOpenChange={onOpenChange}
        onChanged={onChanged}
      />
    </Sheet>
  );
}

function PartSheetView({
  part,
  onOpenChange,
  onChanged,
}: {
  part: SheetPart;
  onOpenChange: (open: boolean) => void;
  onChanged?: (partId: string, status: PartStatus) => void;
}) {
  const [mode, setMode] = useState<Mode>("detail");

  // Only the edit form is long enough to want the full screen. The sell
  // view is two fields and should sit at the bottom, close to the thumb,
  // rather than stretching over the whole phone.
  return (
    <SheetContent tall={mode === "edit"}>
      {mode === "detail" && (
        <DetailView part={part} setMode={setMode} onOpenChange={onOpenChange} onChanged={onChanged} />
      )}
      {mode === "sell" && (
        <SellView part={part} onBack={() => setMode("detail")} onOpenChange={onOpenChange} onChanged={onChanged} />
      )}
      {mode === "reserve" && (
        <ReserveView part={part} onBack={() => setMode("detail")} onOpenChange={onOpenChange} onChanged={onChanged} />
      )}
      {mode === "edit" && <EditView part={part} onBack={() => setMode("detail")} />}
    </SheetContent>
  );
}

// =====================================================================
// Detail
// =====================================================================
function DetailView({
  part,
  setMode,
  onOpenChange,
  onChanged,
}: {
  part: SheetPart;
  setMode: (m: Mode) => void;
  onOpenChange: (open: boolean) => void;
  onChanged?: (id: string, status: PartStatus) => void;
}) {
  const router = useRouter();
  const finance = useFinanceAccess();
  const [pending, startTransition] = useTransition();
  const { confirm, element: confirmEl } = useConfirmDialog();

  const sellable = part.status === "available" || part.status === "reserved";

  function release() {
    startTransition(async () => {
      const result = await releaseReservation(part.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Hold released", { description: `${part.name} is back on the shelf.` });
      onChanged?.(part.id, "available");
      router.refresh();
    });
  }

  function remove() {
    void (async () => {
      const yes = await confirm({
        title: `Delete ${part.name}?`,
        body: (
          <>
            This removes the part from inventory for good. It will be recorded
            in the activity log with your name on it.
          </>
        ),
        confirmLabel: "Delete part",
      });
      if (!yes) return;

      startTransition(async () => {
        const result = await deletePart(part.id);
        if (!result.ok) {
          toast.error("Not deleted", { description: result.error });
          return;
        }
        toast.success(`Deleted ${part.name}`);
        onOpenChange(false);
        router.refresh();
      });
    })();
  }

  return (
    <>
      {confirmEl}
      <SheetHeader>
        <div className="flex items-start gap-3">
          <PartIconTile iconKey={part.icon_key} category={part.category} />
          <div className="min-w-0 flex-1">
            <SheetTitle>{partTitle(part.name, part.side)}</SheetTitle>
            <SheetDescription>
              {part.year} {part.make} {part.model}
              {part.trim ? ` ${part.trim}` : ""} · {part.stock_number}
            </SheetDescription>
          </div>
          <StatusPill status={part.status} />
        </div>
      </SheetHeader>

      <SheetBody>
        {part.status === "reserved" && (
          <div className="mb-3 flex items-start gap-2.5 rounded-xl bg-reserved-soft px-3.5 py-3">
            <Clock className="mt-0.5 size-[18px] shrink-0 text-reserved" />
            <div className="min-w-0 text-[13px] leading-relaxed text-reserved">
              <p className="font-semibold">
                On hold{part.reserved_for_name ? ` for ${part.reserved_for_name}` : ""}
              </p>
              {part.reserved_until && (
                <p className="opacity-90">
                  Expires {timeUntil(part.reserved_until)} · {formatDateTime(part.reserved_until)}
                </p>
              )}
            </div>
          </div>
        )}

        {part.status === "sold" && (
          <div className="mb-3 flex items-start gap-2.5 rounded-xl bg-sold-soft px-3.5 py-3">
            <TriangleAlert className="mt-0.5 size-[18px] shrink-0 text-sold" />
            <p className="text-[13px] leading-relaxed text-sold">
              This part is sold. Its record is history now and cannot be edited.
            </p>
          </div>
        )}

        <div className="rounded-xl border border-line bg-surface px-3.5 py-1">
          <dl className="divide-y divide-line">
            <DetailRow label="Asking price" value={formatMoney(part.asking_price_cents)} />
            <DetailRow label="Condition" value={CONDITION_LABELS[part.condition]} />
            <DetailRow
              label="Shelf"
              value={
                part.shelf_location ? (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3.5 text-ink-subtle" />
                    {part.shelf_location}
                  </span>
                ) : (
                  <span className="text-ink-subtle">Not recorded</span>
                )
              }
            />
            <DetailRow label="Category" value={part.category} />
          </dl>
        </div>

        {part.notes && (
          <p className="mt-3 rounded-xl bg-surface-2 px-3.5 py-3 text-[13.5px] leading-relaxed text-ink-muted">
            {part.notes}
          </p>
        )}

        <Divider className="my-3" />

        <div className="flex flex-wrap gap-2 pb-2">
          <Link
            href={`/vehicles/${part.vehicle_id}`}
            className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-[13px] font-medium text-ink-muted active:bg-surface-2"
          >
            Open vehicle
          </Link>
          {part.status !== "sold" && (
            <button
              type="button"
              onClick={() => setMode("edit")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-2 text-[13px] font-medium text-ink-muted active:bg-surface-2"
            >
              <Pencil className="size-3.5" />
              Edit
            </button>
          )}
          {part.status === "reserved" && (
            <button
              type="button"
              onClick={release}
              disabled={pending}
              className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-[13px] font-medium text-ink-muted active:bg-surface-2"
            >
              Release hold
            </button>
          )}
          {finance && part.status !== "sold" && (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-2 text-[13px] font-medium text-danger active:bg-danger-soft"
            >
              <Trash className="size-3.5" />
              Delete
            </button>
          )}
        </div>
      </SheetBody>

      {/* Primary actions at the bottom, large, thumb-reachable. */}
      {sellable && (
        <SheetFooter>
          <div className="flex gap-2.5">
            {part.status === "available" && (
              <Button
                variant="secondary"
                size="lg"
                block
                onClick={() => setMode("reserve")}
              >
                Reserve
              </Button>
            )}
            <Button size="lg" block onClick={() => setMode("sell")}>
              Mark sold
            </Button>
          </div>
        </SheetFooter>
      )}
    </>
  );
}

// =====================================================================
// Sell
//
// This is the screen a partner uses with a customer standing in front of
// them, often one-handed, sometimes in the rain. It asks two things:
// what it sold for, and how it was paid. Nothing else.
//
// Buyer name, phone number, and which listing they came from used to be
// here. They were never filled in honestly under those conditions --
// they were skipped, or guessed at, which is worse than not asking. The
// columns still exist for a future screen that has time for them.
// =====================================================================
function SellView({
  part,
  onBack,
  onOpenChange,
  onChanged,
}: {
  part: SheetPart;
  onBack: () => void;
  onOpenChange: (open: boolean) => void;
  onChanged?: (id: string, status: PartStatus) => void;
}) {
  const router = useRouter();
  const profile = useProfile();
  const [pending, startTransition] = useTransition();
  const priceRef = useRef<HTMLInputElement>(null);

  const [price, setPrice] = useState(centsToInput(part.asking_price_cents));
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [conflict, setConflict] = useState<{ message: string; detail?: string } | null>(null);

  // Focus and select the price on open, so the common case -- sold at
  // the asking price -- is one tap, and haggling is one overtype.
  useEffect(() => {
    const t = setTimeout(() => {
      priceRef.current?.focus();
      priceRef.current?.select();
    }, 60);
    return () => clearTimeout(t);
  }, []);

  const cents = parseMoneyToCents(price);
  const ready = cents !== null && cents >= 0 && !conflict;

  function submit() {
    if (!ready) return;
    setConflict(null);

    startTransition(async () => {
      const result = await sellPart({
        partId: part.id,
        priceInput: price,
        paymentMethod: payment,
        channel: "facebook",
        soldBy: profile.id,
      });

      if (result.ok) {
        toast.success(`Sold ${part.name}`, { description: formatMoney(cents ?? 0) });
        onChanged?.(part.id, "sold");
        onOpenChange(false);
        router.refresh();
        return;
      }

      if (result.kind === "conflict") {
        // Stay open: the partner is mid-conversation and needs to read this.
        setConflict({ message: result.message, detail: result.detail });
        onChanged?.(part.id, "sold");
        return;
      }

      toast.error(result.message, { description: result.detail });
    });
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Sell {partTitle(part.name, part.side)}</SheetTitle>
        <SheetDescription>
          {part.year} {part.make} {part.model} · asking{" "}
          {formatMoney(part.asking_price_cents)}
        </SheetDescription>
      </SheetHeader>

      <SheetBody className="space-y-5">
        {conflict && (
          <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-3">
            <p className="flex items-center gap-2 text-[14px] font-semibold text-danger">
              <TriangleAlert className="size-[18px] shrink-0" />
              {conflict.message}
            </p>
            {conflict.detail && (
              <p className="mt-1 pl-[26px] text-[13px] text-danger/85">
                {timeAgo(conflict.detail)}
              </p>
            )}
            <p className="mt-2 pl-[26px] text-[13px] leading-relaxed text-danger/85">
              Nothing was recorded. Tell the customer it&apos;s gone.
            </p>
          </div>
        )}

        <Field label="Sold for" htmlFor="sale_price">
          <MoneyInput
            ref={priceRef}
            id="sale_price"
            value={price}
            onValueChange={setPrice}
            inputMode="decimal"
            className="h-16 text-[30px] font-semibold"
          />
        </Field>

        <Field label="Paid with">
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPayment(p.value)}
                aria-pressed={payment === p.value}
                className={cn(
                  "flex h-14 items-center justify-center rounded-xl border text-[15px] font-medium",
                  "transition-[background-color,border-color,transform] duration-150 ease-out-soft",
                  "active:scale-[0.97]",
                  payment === p.value
                    ? "border-accent bg-accent text-accent-text"
                    : "border-line-strong bg-surface text-ink-muted",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </Field>

        <p className="pb-2 text-[12.5px] leading-relaxed text-ink-subtle">
          Recorded against{" "}
          <span className="font-medium text-ink-muted">{profile.full_name}</span>, today,
          in CAD.
        </p>
      </SheetBody>

      <SheetFooter>
        <div className="flex gap-2.5">
          <Button variant="secondary" size="lg" onClick={onBack} disabled={pending}>
            Back
          </Button>
          <Button
            variant="success"
            size="lg"
            block
            onClick={submit}
            disabled={pending || !ready}
          >
            {pending ? "Recording…" : `Sell for ${formatMoney(cents ?? 0)}`}
          </Button>
        </div>
      </SheetFooter>
    </>
  );
}

// =====================================================================
// Reserve
// =====================================================================
function ReserveView({
  part,
  onBack,
  onOpenChange,
  onChanged,
}: {
  part: SheetPart;
  onBack: () => void;
  onOpenChange: (open: boolean) => void;
  onChanged?: (id: string, status: PartStatus) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [buyerName, setBuyerName] = useState("");
  const [hours, setHours] = useState(48);
  const [conflict, setConflict] = useState<string | null>(null);

  function submit() {
    setConflict(null);
    startTransition(async () => {
      const result = await reservePart(part.id, buyerName.trim(), hours);

      if (result.ok) {
        toast.success(`Held for ${buyerName || "a buyer"}`, {
          description: `Comes back on the shelf automatically in ${hours} hours.`,
        });
        onChanged?.(part.id, "reserved");
        onOpenChange(false);
        router.refresh();
        return;
      }

      if (result.kind === "conflict") {
        setConflict(result.message);
        return;
      }
      toast.error(result.message, { description: result.detail });
    });
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Hold {partTitle(part.name, part.side)}</SheetTitle>
        <SheetDescription>
          {part.year} {part.make} {part.model} · {formatMoney(part.asking_price_cents)}
        </SheetDescription>
      </SheetHeader>

      <SheetBody className="space-y-4">
        {conflict && (
          <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-3">
            <p className="flex items-center gap-2 text-[14px] font-semibold text-danger">
              <TriangleAlert className="size-[18px] shrink-0" />
              {conflict}
            </p>
          </div>
        )}

        <Field label="Holding it for" htmlFor="hold_name" required>
          <Input
            id="hold_name"
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            placeholder="Buyer's name"
            autoCapitalize="words"
            autoFocus
          />
        </Field>

        <Field label="For how long" htmlFor="hold_hours">
          <div className="grid grid-cols-3 gap-2">
            {[24, 48, 72].map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHours(h)}
                className={cn(
                  "tap rounded-lg border text-[14px] font-medium transition-colors",
                  hours === h
                    ? "border-accent bg-accent text-accent-text"
                    : "border-line-strong bg-surface text-ink-muted active:bg-surface-2",
                )}
              >
                {h}h
              </button>
            ))}
          </div>
        </Field>

        <p className="text-[12.5px] leading-relaxed text-ink-subtle">
          If the buyer doesn&apos;t show, the part goes back on the shelf on its own
          when the hold runs out — and you get a note about it. Nobody has to
          remember to release it.
        </p>
      </SheetBody>

      <SheetFooter>
        <div className="flex gap-2.5">
          <Button variant="secondary" size="lg" onClick={onBack} disabled={pending}>
            Back
          </Button>
          <Button size="lg" block onClick={submit} disabled={pending || !!conflict}>
            {pending ? "Holding…" : `Hold for ${hours} hours`}
          </Button>
        </div>
      </SheetFooter>
    </>
  );
}

// =====================================================================
// Edit
// =====================================================================
function EditView({ part, onBack }: { part: SheetPart; onBack: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [price, setPrice] = useState(centsToInput(part.asking_price_cents));
  const [condition, setCondition] = useState<PartCondition>(part.condition);
  const [shelf, setShelf] = useState(part.shelf_location ?? "");
  const [notes, setNotes] = useState(part.notes ?? "");

  function submit() {
    startTransition(async () => {
      // parseMoneyToCents reads the digits out of the string rather than
      // multiplying a float, so 1.005 does not silently become 100 cents.
      const cents = parseMoneyToCents(price);
      const result = await updatePart(part.id, {
        asking_price_cents: cents ?? part.asking_price_cents,
        condition,
        shelf_location: shelf.trim() || null,
        notes: notes.trim() || null,
      });

      if (!result.ok) {
        toast.error("Not saved", { description: result.error });
        return;
      }
      toast.success("Saved");
      router.refresh();
      onBack();
    });
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Edit {partTitle(part.name, part.side)}</SheetTitle>
        <SheetDescription>{part.stock_number}</SheetDescription>
      </SheetHeader>

      <SheetBody className="space-y-4">
        <Field label="Asking price" htmlFor="edit_price">
          <MoneyInput id="edit_price" value={price} onValueChange={setPrice} />
        </Field>

        <Field label="Condition" htmlFor="edit_condition">
          <SimpleSelect
            id="edit_condition"
            value={condition}
            onValueChange={setCondition}
            options={CONDITIONS.map((c) => ({
              value: c.value,
              label: c.label,
              hint: c.hint,
            }))}
          />
        </Field>

        <Field
          label="Shelf location"
          htmlFor="edit_shelf"
          hint="However you actually describe it: Rack 3 bin B, container 2, still on the car."
        >
          <Input
            id="edit_shelf"
            value={shelf}
            onChange={(e) => setShelf(e.target.value)}
            placeholder="Rack 3, bin B"
          />
        </Field>

        <Field label="Notes" htmlFor="edit_notes">
          <Textarea
            id="edit_notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Small scuff on the lower corner."
            className="min-h-[70px]"
          />
        </Field>

        <div className="flex items-center gap-2 pb-2">
          <ConditionBadge condition={condition} />
          <span className="text-[12.5px] text-ink-subtle">
            Shown on every search result for this part.
          </span>
        </div>
      </SheetBody>

      <SheetFooter>
        <div className="flex gap-2.5">
          <Button variant="secondary" size="lg" onClick={onBack} disabled={pending}>
            Cancel
          </Button>
          <Button size="lg" block onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </SheetFooter>
    </>
  );
}
