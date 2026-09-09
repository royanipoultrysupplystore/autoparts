"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Car, Trash } from "lucide-react";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { deleteExpense } from "@/lib/actions/expenses";

export function ExpenseRow({
  id,
  category,
  amount,
  note,
  vehicleLabel,
  paidBy,
  hasReceipt,
}: {
  id: string;
  category: string;
  amount: string;
  note: string | null;
  vehicleLabel: string | null;
  paidBy: string | null;
  hasReceipt: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { confirm, element } = useConfirmDialog();

  function remove() {
    void (async () => {
      const yes = await confirm({
        title: `Delete this ${category.toLowerCase()} expense?`,
        body: (
          <>
            {amount} will come off the reports it appears in. This is recorded
            in the activity log.
          </>
        ),
        confirmLabel: "Delete",
      });
      if (!yes) return;

      startTransition(async () => {
        const result = await deleteExpense(id);
        if (!result.ok) {
          toast.error("Not deleted", { description: result.error });
          return;
        }
        toast.success("Expense deleted");
        router.refresh();
      });
    })();
  }

  return (
    <>
      {element}
      <div className="flex items-start gap-3 px-3.5 py-3">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[14.5px] font-medium text-ink">{category}</span>
            {hasReceipt && <Camera className="size-3.5 shrink-0 text-ink-subtle" />}
          </span>

          {vehicleLabel && (
            <span className="mt-0.5 flex items-center gap-1 text-[12.5px] text-accent">
              <Car className="size-3.5 shrink-0" />
              <span className="truncate">{vehicleLabel}</span>
            </span>
          )}

          {note && (
            <span className="mt-0.5 block truncate text-[12.5px] text-ink-muted">{note}</span>
          )}

          {paidBy && (
            <span className="mt-0.5 block text-[12px] text-ink-subtle">Paid by {paidBy}</span>
          )}
        </span>

        <span className="tnum shrink-0 text-[15px] font-semibold text-ink">{amount}</span>

        <button
          type="button"
          onClick={remove}
          disabled={pending}
          aria-label={`Delete ${category} expense`}
          className="-mr-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-subtle active:bg-danger-soft active:text-danger"
        >
          <Trash className="size-4" />
        </button>
      </div>
    </>
  );
}
