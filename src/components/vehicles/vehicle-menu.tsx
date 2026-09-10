"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { EllipsisVertical, Pencil, Scissors, Trash } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { deleteVehicle } from "@/lib/actions/vehicles";

/**
 * Everything you can do to a vehicle, in the header where it is looked
 * for.
 *
 * Delete used to live at the foot of the page, below the parts list --
 * which on a freshly added car is 239 rows. It was there, and nobody was
 * ever going to find it. Destructive actions should be hard to hit by
 * accident, not hard to find on purpose; the confirmation step is what
 * makes them safe, not burying them.
 */
export function VehicleMenu({
  vehicleId,
  label,
  hasParts,
}: {
  vehicleId: string;
  label: string;
  hasParts: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
            If the car is finished, edit it and mark it{" "}
            <strong>depleted</strong> or <strong>scrapped</strong> instead —
            that keeps its history in the reports.
          </>
        ),
        confirmLabel: "Delete for good",
      });
      if (!yes) return;

      startTransition(async () => {
        const result = await deleteVehicle(vehicleId);
        if (!result.ok) {
          toast.error("Not deleted", { description: result.error, duration: 9000 });
          return;
        }
        toast.success(`Deleted ${label}`);
        router.replace("/vehicles");
        router.refresh();
      });
    })();
  }

  const itemClass =
    "flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2.5 " +
    "text-[15px] outline-none transition-colors duration-100 " +
    "data-[highlighted]:bg-accent/10";

  return (
    <>
      {element}

      <DropdownMenu.Root open={open} onOpenChange={setOpen}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label="Vehicle options"
            disabled={pending}
            className={cn(
              "tap flex items-center justify-center rounded-lg text-ink-muted",
              "transition-transform duration-150 ease-out-soft active:scale-90 active:bg-surface-2",
              "data-[state=open]:bg-surface-2",
            )}
          >
            <EllipsisVertical className="size-5" />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className={cn(
              "z-50 min-w-[228px] overflow-hidden rounded-xl p-1.5",
              "glass border shadow-[0_16px_48px_-12px_rgb(26_25_23/0.28)]",
              "origin-[var(--radix-dropdown-menu-content-transform-origin)]",
              "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
              "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
              "duration-150 ease-out-soft",
            )}
          >
            <DropdownMenu.Item asChild className={cn(itemClass, "text-ink")}>
              <Link href={`/vehicles/${vehicleId}/edit`}>
                <Pencil className="size-[18px] text-ink-muted" />
                Edit details
              </Link>
            </DropdownMenu.Item>

            {hasParts && (
              <DropdownMenu.Item asChild className={cn(itemClass, "text-ink")}>
                <Link href={`/vehicles/${vehicleId}/trim`}>
                  <Scissors className="size-[18px] text-ink-muted" />
                  Trim the parts list
                </Link>
              </DropdownMenu.Item>
            )}

            <DropdownMenu.Separator className="my-1.5 h-px bg-line" />

            <DropdownMenu.Item
              onSelect={remove}
              className={cn(
                itemClass,
                "text-danger data-[highlighted]:bg-danger-soft",
              )}
            >
              <Trash className="size-[18px]" />
              {pending ? "Deleting…" : "Delete vehicle"}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  );
}
