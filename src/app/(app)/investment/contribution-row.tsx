"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash } from "lucide-react";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { deleteContribution } from "@/lib/actions/investment";

export function ContributionRow({
  id,
  partner,
  amount,
  note,
}: {
  id: string;
  partner: string;
  amount: string;
  note: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { confirm, element } = useConfirmDialog();

  function remove() {
    void (async () => {
      const yes = await confirm({
        title: `Delete ${partner}'s ${amount}?`,
        body: (
          <>
            It comes off {partner}&apos;s total and every partner&apos;s share
            changes. This is recorded in the activity log.
          </>
        ),
        confirmLabel: "Delete",
      });
      if (!yes) return;

      startTransition(async () => {
        const result = await deleteContribution(id);
        if (!result.ok) {
          toast.error("Not deleted", { description: result.error });
          return;
        }
        toast.success("Entry deleted");
        router.refresh();
      });
    })();
  }

  return (
    <>
      {element}
      <div className="flex items-center gap-3 px-3.5 py-2.5">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-medium text-ink">{partner}</span>
          {note && (
            <span className="mt-0.5 block truncate text-[12.5px] text-ink-muted">{note}</span>
          )}
        </span>

        <span className="tnum shrink-0 text-[15px] font-semibold text-ink">{amount}</span>

        <button
          type="button"
          onClick={remove}
          disabled={pending}
          aria-label={`Delete ${partner}'s ${amount}`}
          className="-mr-1.5 flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-subtle active:bg-danger-soft active:text-danger"
        >
          <Trash className="size-4" />
        </button>
      </div>
    </>
  );
}
