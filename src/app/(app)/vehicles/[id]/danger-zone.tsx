"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash } from "lucide-react";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { deleteVehicle } from "@/lib/actions/vehicles";

/**
 * Deleting a vehicle takes every part with it. It is confirmed here,
 * refused outright if the vehicle has recorded sales, and logged either
 * way with the name of whoever pressed it.
 */
export function VehicleDangerZone({
  vehicleId,
  label,
}: {
  vehicleId: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { confirm, element } = useConfirmDialog();

  function remove() {
    void (async () => {
      const yes = await confirm({
        title: `Delete ${label}?`,
        body: (
          <>
            This deletes the vehicle and <strong>every part on it</strong>. It
            cannot be undone, and it will be recorded in the activity log with
            your name on it.
            <br />
            <br />
            If the car is finished, mark it <strong>depleted</strong> or{" "}
            <strong>scrapped</strong> instead — that keeps its history in the
            reports.
          </>
        ),
        confirmLabel: "Delete for good",
      });
      if (!yes) return;

      startTransition(async () => {
        const result = await deleteVehicle(vehicleId);
        if (!result.ok) {
          toast.error("Not deleted", { description: result.error, duration: 8000 });
          return;
        }
        toast.success(`Deleted ${label}`);
        router.replace("/vehicles");
        router.refresh();
      });
    })();
  }

  return (
    <>
      {element}
      <div className="border-t border-line pt-4">
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="tap flex w-full items-center justify-center gap-2 rounded-xl border border-danger/30 px-4 py-3 text-[14px] font-medium text-danger active:bg-danger-soft"
        >
          <Trash className="size-[18px]" />
          {pending ? "Deleting…" : "Delete this vehicle"}
        </button>
      </div>
    </>
  );
}
