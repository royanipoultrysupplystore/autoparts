"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Boxes,
  Clock,
  MapPin,
  Pencil,
  ReceiptText,
  Trash,
  TriangleAlert,
  Undo2,
} from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Field, Input, MoneyInput, Textarea } from "@/components/ui/field";
import { SimpleSelect } from "@/components/ui/select";
import { ConditionBadge, StatusPill } from "@/components/ui/status-pill";
import { DetailRow, Divider } from "@/components/ui/primitives";
import { PartIconTile } from "@/lib/icons/part-icons";
import { toast } from "@/components/ui/toaster";
import { centsToInput, formatMoney, parseMoneyToCents } from "@/lib/money";
import {
  CONDITION_LABELS,
  formatDate,
  formatDateTime,
  partTitle,
  timeAgo,
  timeUntil,
} from "@/lib/format";
import {
  CONDITIONS,
  PAYMENT_LABEL,
  PAYMENT_METHODS,
  SALE_CHANNELS,
} from "@/lib/vehicle-options";
import {
  correctSale,
  getLiveSale,
  releaseReservation,
  reservePart,
  returnSale,
  sellPart,
  type LiveSale,
} from "@/lib/actions/sales";
import {
  deletePart,
  getAssemblyCompanions,
  includePartsWith,
  updatePart,
} from "@/lib/actions/parts";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { useFinanceAccess, useProfile } from "@/components/profile-provider";
import { cn } from "@/lib/utils";
import type {
  AssemblyCompanion,
  PartCondition,
  PartSide,
  PartStatus,
  PaymentMethod,
  SaleChannel,
} from "@/types/db";

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

type Mode = "detail" | "sell" | "reserve" | "edit" | "amend" | "sweep";

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

  // A sold part carries a sale, and the sale is what you correct or hand
  // back. It is fetched here rather than threaded through every list that
  // opens this sheet -- the search results, the vehicle screen -- none of
  // which have any reason to carry sale rows around.
  // What went out bolted to this part, once it has just been sold.
  const [companions, setCompanions] = useState<AssemblyCompanion[]>([]);

  // And what WOULD go with it, asked up front -- so a complete engine can
  // say it is a complete engine before anybody commits to selling it.
  // "Engine assembly" is the catalog's name for it, not a yard's.
  const [wouldTake, setWouldTake] = useState<number>(0);

  useEffect(() => {
    if (part.status !== "available" && part.status !== "reserved") return;

    let alive = true;
    void getAssemblyCompanions(part.id).then((found) => {
      if (alive) setWouldTake(found.length);
    });
    return () => {
      alive = false;
    };
  }, [part.id, part.status]);

  const [sale, setSale] = useState<LiveSale | null>(null);
  const [saleLoaded, setSaleLoaded] = useState(part.status !== "sold");

  // Also called after a correction, so going back to the detail view
  // shows the figure that was just saved rather than the one it replaced.
  const loadSale = useCallback(async () => {
    const found = await getLiveSale(part.id);
    setSale(found);
    setSaleLoaded(true);
  }, [part.id]);

  useEffect(() => {
    if (part.status !== "sold") return;

    let alive = true;
    void getLiveSale(part.id).then((found) => {
      if (!alive) return;
      setSale(found);
      setSaleLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [part.id, part.status]);

  // Only the long forms want the full screen. The sell view is two fields
  // and should sit at the bottom, close to the thumb, rather than
  // stretching over the whole phone.
  return (
    <SheetContent tall={mode === "edit" || mode === "amend"}>
      {mode === "detail" && (
        <DetailView
          part={part}
          sale={sale}
          saleLoaded={saleLoaded}
          wouldTake={wouldTake}
          setMode={setMode}
          onOpenChange={onOpenChange}
          onChanged={onChanged}
        />
      )}
      {mode === "amend" && sale && (
        <AmendView
          part={part}
          sale={sale}
          onBack={() => setMode("detail")}
          onChanged={onChanged}
          onCorrected={loadSale}
        />
      )}
      {mode === "sell" && (
        <SellView
          part={part}
          onBack={() => setMode("detail")}
          onOpenChange={onOpenChange}
          onChanged={onChanged}
          onSweep={(found) => {
            setCompanions(found);
            setMode("sweep");
          }}
        />
      )}
      {mode === "sweep" && (
        <SweepView
          part={part}
          companions={companions}
          onDone={() => onOpenChange(false)}
          onChanged={onChanged}
        />
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
  sale,
  saleLoaded,
  wouldTake,
  setMode,
  onOpenChange,
  onChanged,
}: {
  part: SheetPart;
  sale: LiveSale | null;
  saleLoaded: boolean;
  /** How many parts would leave with this one. Zero for almost everything. */
  wouldTake: number;
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

  function takeBack() {
    void (async () => {
      const yes = await confirm({
        title: `Give back ${sale ? formatMoney(sale.sale_price_cents) : "the money"}?`,
        body: (
          <>
            <strong>{part.name}</strong> goes back on the shelf and stops
            counting as revenue everywhere it appears.
            <br />
            <br />
            The sale is kept and marked returned — who sold it, for how much,
            and that you took it back. Nothing is erased.
          </>
        ),
        confirmLabel: "Returned & refunded",
      });
      if (!yes) return;

      startTransition(async () => {
        const result = await returnSale(part.id);

        if (!result.ok) {
          toast.error(
            result.reason === "not_allowed"
              ? "That sale is the owner's to reverse"
              : result.reason === "not_sold"
                ? "This part is not on a live sale"
                : "Not returned",
            { description: result.reason === "not_allowed" ? undefined : result.reason },
          );
          return;
        }

        toast.success(`${part.name} is back on the shelf`, {
          description: "The refund has come off the reports.",
        });
        onChanged?.(part.id, "available");
        onOpenChange(false);
        router.refresh();
      });
    })();
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
          <div className="mb-3 rounded-xl bg-sold-soft px-3.5 py-3">
            <div className="flex items-start gap-2.5">
              <ReceiptText className="mt-0.5 size-[18px] shrink-0 text-sold" />
              <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-sold">
                {!saleLoaded ? (
                  <p className="opacity-80">Looking up the sale…</p>
                ) : sale ? (
                  <>
                    <p className="font-semibold">
                      Sold for {formatMoney(sale.sale_price_cents)}
                      {sale.buyer_name ? ` to ${sale.buyer_name}` : ""}
                    </p>
                    <p className="opacity-90">
                      {formatDate(sale.sale_date)} · {sale.sold_by_name} ·{" "}
                      {PAYMENT_LABEL[sale.payment_method]}
                    </p>
                  </>
                ) : (
                  <p>This part is sold.</p>
                )}
              </div>
            </div>

            {sale && sale.may_amend && (
              <div className="mt-2.5 flex flex-wrap gap-2 pl-[28px]">
                <button
                  type="button"
                  onClick={() => setMode("amend")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-sold/30 bg-surface px-3 py-2 text-[13px] font-medium text-ink active:bg-surface-2"
                >
                  <Pencil className="size-3.5" />
                  Correct the sale
                </button>
                <button
                  type="button"
                  onClick={takeBack}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-sold/30 bg-surface px-3 py-2 text-[13px] font-medium text-ink active:bg-surface-2"
                >
                  <Undo2 className="size-3.5" />
                  Returned &amp; refunded
                </button>
              </div>
            )}

            {sale && !sale.may_amend && (
              <p className="mt-2 pl-[28px] text-[12.5px] leading-relaxed text-sold/80">
                Corrections and returns on an older sale are the owner&apos;s to
                make.
              </p>
            )}
          </div>
        )}

        {wouldTake > 0 && (
          <div className="mb-3 flex items-start gap-2.5 rounded-xl bg-accent-soft px-3.5 py-3">
            <Boxes className="mt-0.5 size-[18px] shrink-0 text-accent" />
            <p className="text-[13px] leading-relaxed text-accent">
              <strong className="font-semibold">This is the complete unit.</strong>{" "}
              Selling it takes {wouldTake} more part{wouldTake === 1 ? "" : "s"} off
              the shelf with it — you&apos;ll tick which ones after the sale.
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
              {wouldTake > 0 ? "Sell the whole unit" : "Mark sold"}
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
  onSweep,
}: {
  part: SheetPart;
  onBack: () => void;
  onOpenChange: (open: boolean) => void;
  onChanged?: (id: string, status: PartStatus) => void;
  /** Called instead of closing, when the part took others with it. */
  onSweep: (companions: AssemblyCompanion[]) => void;
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
        router.refresh();

        // An engine leaves with its head and its oil pan still bolted on.
        // Ask before taking them off the shelf -- the yard knows what
        // actually came off the car, and this list is only a guess.
        const companions = await getAssemblyCompanions(part.id);
        if (companions.length > 0) {
          onSweep(companions);
          return;
        }

        onOpenChange(false);
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

// =====================================================================
// Amend -- the sale happened, the numbers on it were wrong
// =====================================================================
function AmendView({
  part,
  sale,
  onBack,
  onChanged,
  onCorrected,
}: {
  part: SheetPart;
  sale: LiveSale;
  onBack: () => void;
  onChanged?: (partId: string, status: PartStatus) => void;
  onCorrected: () => Promise<void>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [price, setPrice] = useState(centsToInput(sale.sale_price_cents));
  const [payment, setPayment] = useState<PaymentMethod>(sale.payment_method);
  const [channel, setChannel] = useState<SaleChannel>(sale.channel);
  const [saleDate, setSaleDate] = useState(sale.sale_date);
  const [buyer, setBuyer] = useState(sale.buyer_name ?? "");
  const [notes, setNotes] = useState(sale.notes ?? "");

  const cents = parseMoneyToCents(price);
  const difference = (cents ?? sale.sale_price_cents) - sale.sale_price_cents;

  function submit() {
    startTransition(async () => {
      const result = await correctSale(part.id, {
        price,
        payment,
        channel,
        saleDate,
        buyerName: buyer.trim() || null,
        notes: notes.trim() || null,
      });

      if (!result.ok) {
        toast.error(
          result.reason === "not_allowed"
            ? "That sale is the owner's to correct"
            : result.reason === "bad_price"
              ? "Enter a price"
              : "Not saved",
          { description: result.reason === "not_allowed" ? undefined : result.reason },
        );
        return;
      }

      toast.success("Sale corrected", {
        description:
          difference === 0
            ? undefined
            : `${difference > 0 ? "Up" : "Down"} ${formatMoney(Math.abs(difference))} on the reports.`,
      });
      onChanged?.(part.id, "sold");
      await onCorrected();
      router.refresh();
      onBack();
    });
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Correct the sale</SheetTitle>
        <SheetDescription>
          {partTitle(part.name, part.side)} · sold by {sale.sold_by_name}{" "}
          {timeAgo(sale.sold_at)}
        </SheetDescription>
      </SheetHeader>

      <SheetBody className="space-y-4">
        <div className="rounded-xl bg-surface-2 px-3.5 py-3">
          <p className="text-[13px] leading-relaxed text-ink-muted">
            This fixes what was written down. If the part came back and the money
            went out, close this and use{" "}
            <strong className="font-medium text-ink">Returned &amp; refunded</strong>{" "}
            instead — that puts it back on the shelf.
          </p>
        </div>

        <Field label="Sold for" htmlFor="amend_price">
          <MoneyInput
            id="amend_price"
            value={price}
            onValueChange={setPrice}
            inputMode="decimal"
            className="h-14 text-[24px] font-semibold"
          />
        </Field>

        {difference !== 0 && cents !== null && (
          <p
            className={cn(
              "-mt-2 text-[13px]",
              difference > 0 ? "text-available" : "text-danger",
            )}
          >
            {difference > 0 ? "+" : "−"}
            {formatMoney(Math.abs(difference))} against what was recorded (
            {formatMoney(sale.sale_price_cents)}).
          </p>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Paid with" htmlFor="amend_payment">
            <SimpleSelect
              id="amend_payment"
              value={payment}
              onValueChange={setPayment}
              options={PAYMENT_METHODS.map((m) => ({ value: m.value, label: m.label }))}
            />
          </Field>

          <Field label="Sold on" htmlFor="amend_date">
            <Input
              id="amend_date"
              type="date"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Where from" htmlFor="amend_channel">
          <SimpleSelect
            id="amend_channel"
            value={channel}
            onValueChange={setChannel}
            options={SALE_CHANNELS.map((c) => ({ value: c.value, label: c.label }))}
          />
        </Field>

        <Field label="Buyer" htmlFor="amend_buyer">
          <Input
            id="amend_buyer"
            value={buyer}
            onChange={(e) => setBuyer(e.target.value)}
            placeholder="Optional"
            autoCapitalize="words"
          />
        </Field>

        <Field label="Notes" htmlFor="amend_notes">
          <Textarea
            id="amend_notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Knocked $20 off, small scuff."
            className="min-h-[70px]"
          />
        </Field>

        <p className="pb-2 text-[12.5px] leading-relaxed text-ink-subtle">
          Both figures go into the activity log, so the change is visible rather
          than silent.
        </p>
      </SheetBody>

      <SheetFooter>
        <div className="flex gap-2.5">
          <Button variant="secondary" size="lg" onClick={onBack} disabled={pending}>
            Cancel
          </Button>
          <Button size="lg" block onClick={submit} disabled={pending || cents === null}>
            {pending ? "Saving…" : "Save the correction"}
          </Button>
        </div>
      </SheetFooter>
    </>
  );
}

// =====================================================================
// Sweep -- what left the yard attached to the part just sold
// =====================================================================
function SweepView({
  part,
  companions,
  onDone,
  onChanged,
}: {
  part: SheetPart;
  companions: AssemblyCompanion[];
  onDone: () => void;
  onChanged?: (id: string, status: PartStatus) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Everything ticked to begin with: the common case is that the whole
  // lump went out on the pallet. Untick what stayed behind.
  const [going, setGoing] = useState<Set<string>>(
    () => new Set(companions.map((c) => c.id)),
  );

  const held = companions.filter((c) => c.status === "reserved");
  const shelfValue = companions
    .filter((c) => going.has(c.id))
    .reduce((n, c) => n + c.asking_price_cents, 0);

  function toggle(id: string) {
    setGoing((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirm() {
    startTransition(async () => {
      const ids = [...going];
      const result = await includePartsWith(part.id, ids);

      if (!result.ok) {
        toast.error("The shelf was not updated", {
          description: `${result.error} — ${part.name} is still sold.`,
          duration: 9000,
        });
        onDone();
        return;
      }

      if ((result.included ?? 0) > 0) {
        for (const id of ids) onChanged?.(id, "included");
        toast.success(
          `${result.included} part${result.included === 1 ? "" : "s"} left with ${part.name}`,
          { description: "They are off the shelf and out of search." },
        );
      }

      router.refresh();
      onDone();
    });
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>What went with it?</SheetTitle>
        <SheetDescription>
          {part.name} is sold. These were still on the shelf.
        </SheetDescription>
      </SheetHeader>

      <SheetBody className="space-y-3">
        <p className="rounded-xl bg-surface-2 px-3.5 py-3 text-[13px] leading-relaxed text-ink-muted">
          Ticked parts come off the shelf and out of search. They are not
          recorded as sales — nobody paid for them separately; their money is
          in the price of {part.name}. Untick anything you actually kept.
        </p>

        {held.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-xl bg-reserved-soft px-3.5 py-3">
            <Clock className="mt-0.5 size-[18px] shrink-0 text-reserved" />
            <p className="text-[13px] leading-relaxed text-reserved">
              {held.length === 1 ? "One of these is" : `${held.length} of these are`} on
              hold for a buyer. Taking{" "}
              {held.length === 1 ? "it" : "them"} off the shelf breaks that promise.
            </p>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          {companions.map((c, i) => {
            const ticked = going.has(c.id);
            return (
              <label
                key={c.id}
                className={cn(
                  "flex cursor-pointer select-none items-center gap-3 px-3 py-2.5 active:bg-surface-2",
                  i > 0 && "border-t border-line",
                )}
                style={{ minHeight: 48 }}
              >
                <Checkbox checked={ticked} onCheckedChange={() => toggle(c.id)} />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-[15px] leading-snug",
                      ticked ? "text-ink" : "text-ink-subtle",
                    )}
                  >
                    {partTitle(c.name, c.side)}
                  </span>
                  <span className="block text-[12px] leading-tight text-ink-subtle">
                    {c.status === "reserved" ? "On hold · " : ""}
                    {formatMoney(c.asking_price_cents)}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        <p className="pb-2 text-[12.5px] leading-relaxed text-ink-subtle">
          {going.size === 0
            ? "Nothing ticked — the shelf stays as it is."
            : `${going.size} of ${companions.length} coming off the shelf, ${formatMoney(shelfValue)} of asking price.`}
        </p>
      </SheetBody>

      <SheetFooter>
        <div className="flex gap-2.5">
          <Button variant="secondary" size="lg" onClick={onDone} disabled={pending}>
            Leave them
          </Button>
          <Button size="lg" block onClick={confirm} disabled={pending}>
            {pending
              ? "Updating…"
              : going.size === 0
                ? "Done"
                : `Take ${going.size} off the shelf`}
          </Button>
        </div>
      </SheetFooter>
    </>
  );
}
