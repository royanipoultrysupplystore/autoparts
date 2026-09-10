"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, CircleAlert, Plus } from "lucide-react";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Textarea } from "@/components/ui/field";
import { SimpleSelect } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { createExpense, createReceiptUploadUrl } from "@/lib/actions/expenses";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { EXPENSE_CATEGORIES } from "@/lib/vehicle-options";
import { todayInVancouver } from "@/lib/format";
import { useProfile } from "@/components/profile-provider";
import { cn } from "@/lib/utils";

type Option = { id: string; label: string };

/**
 * A select cannot carry an empty string as a value, so "no vehicle" needs
 * a sentinel. It is translated back to "" before the form is submitted.
 */
const NO_VEHICLE = "__none";

/**
 * Quick-add expense.
 *
 * Scope is implied, not asked: it defaults to a business expense, and
 * choosing a vehicle turns it into a vehicle cost. One less decision to
 * make standing in the yard.
 */
export function ExpenseForm({
  vehicles,
  members,
  defaultVehicleId,
}: {
  vehicles: Option[];
  members: Option[];
  defaultVehicleId?: string;
}) {
  const router = useRouter();
  const profile = useProfile();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [amount, setAmount] = useState("");
  const [vehicleId, setVehicleId] = useState(defaultVehicleId ?? "");
  const [chosenCategory, setChosenCategory] = useState("misc");
  const [paidBy, setPaidBy] = useState(profile.id);
  const [receiptPath, setReceiptPath] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const scope = vehicleId ? "vehicle" : "business";
  const categories = EXPENSE_CATEGORIES.filter(
    (c) => c.scope === "both" || c.scope === scope,
  );

  // Picking a vehicle can make the chosen category illegal (rent is not a
  // vehicle cost). Derived, not corrected in an effect, so the select can
  // never render a value that is not in its own option list.
  const category = categories.some((c) => c.value === chosenCategory)
    ? chosenCategory
    : "misc";

  /**
   * Submitted directly rather than through useActionState: the success
   * path has to close the sheet, clear the form, and refresh the list,
   * and doing that from an effect watching a result flag means a render
   * pass where the sheet is still open showing stale values.
   */
  function submit(formData: FormData) {
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await createExpense({ ok: false }, formData);

      if (!result.ok) {
        setError(result.error ?? null);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      toast.success("Expense recorded");
      setOpen(false);
      setAmount("");
      setReceiptPath("");
      setError(null);
      router.refresh();
    });
  }

  async function uploadReceipt(file: File) {
    setUploading(true);
    try {
      const target = await createReceiptUploadUrl(file.name);
      if (!target.ok) {
        toast.error("Could not start the upload", { description: target.error });
        return;
      }

      const supabase = getSupabaseBrowser();
      const { error } = await supabase.storage
        .from("receipts")
        .uploadToSignedUrl(target.path, target.token, file);

      if (error) {
        toast.error("Receipt did not upload", { description: error.message });
        return;
      }

      setReceiptPath(target.path);
      toast.success("Receipt attached");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="subtle" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Add
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent tall>
          <SheetHeader>
            <SheetTitle>Record an expense</SheetTitle>
          </SheetHeader>

          <form action={submit} className="flex min-h-0 flex-1 flex-col">
            <input type="hidden" name="receipt_url" value={receiptPath} />

            <SheetBody className="space-y-4">
              {error && (
                <div className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-3">
                  <CircleAlert className="mt-0.5 size-[18px] shrink-0 text-danger" />
                  <p className="text-[13.5px] text-danger">{error}</p>
                </div>
              )}

              <Field
                label="Amount"
                htmlFor="amount"
                required
                error={fieldErrors.amount}
              >
                <MoneyInput
                  id="amount"
                  name="amount"
                  value={amount}
                  onValueChange={setAmount}
                  autoFocus
                  className="h-[52px] text-[20px] font-semibold"
                />
              </Field>

              <Field
                label="Against a vehicle?"
                htmlFor="vehicle_id"
                hint={
                  scope === "vehicle"
                    ? "Counts as a direct cost on that car's P&L."
                    : "Counts as overhead in the monthly report."
                }
              >
                <SimpleSelect
                  id="vehicle_id"
                  name="vehicle_id"
                  value={vehicleId || NO_VEHICLE}
                  onValueChange={(v) => setVehicleId(v === NO_VEHICLE ? "" : v)}
                  options={[
                    { value: NO_VEHICLE, label: "No — general business expense" },
                    ...vehicles.map((v) => ({ value: v.id, label: v.label })),
                  ]}
                />
              </Field>

              <Field label="What for" htmlFor="category">
                <SimpleSelect
                  id="category"
                  name="category"
                  value={category}
                  onValueChange={setChosenCategory}
                  options={categories.map((c) => ({ value: c.value, label: c.label }))}
                />
              </Field>

              <div className="grid grid-cols-2 gap-2.5">
                <Field label="When" htmlFor="expense_date">
                  <Input
                    id="expense_date"
                    name="expense_date"
                    type="date"
                    defaultValue={todayInVancouver()}
                  />
                </Field>

                <Field label="Who paid" htmlFor="paid_by">
                  <SimpleSelect
                    id="paid_by"
                    name="paid_by"
                    value={paidBy}
                    onValueChange={setPaidBy}
                    options={members.map((m) => ({ value: m.id, label: m.label }))}
                  />
                </Field>
              </div>

              <Field label="Note" htmlFor="note">
                <Textarea
                  id="note"
                  name="note"
                  placeholder="Tow from the auction yard"
                  className="min-h-[70px]"
                />
              </Field>

              <Field label="Receipt">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadReceipt(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className={cn(
                    "tap flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-3 text-[14px] font-medium transition-colors",
                    receiptPath
                      ? "border-available bg-available-soft text-available"
                      : "border-line-strong bg-surface text-ink-muted active:bg-surface-2",
                  )}
                >
                  <Camera className="size-[18px]" />
                  {uploading
                    ? "Uploading…"
                    : receiptPath
                      ? "Receipt attached"
                      : "Photograph the receipt"}
                </button>
              </Field>

              <div className="pb-2" />
            </SheetBody>

            <SheetFooter>
              <Button
                type="submit"
                size="lg"
                block
                disabled={pending || uploading || !amount}
              >
                {pending ? "Saving…" : "Record expense"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
