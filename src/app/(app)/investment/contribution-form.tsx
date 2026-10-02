"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Plus } from "lucide-react";
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
import { addContribution } from "@/lib/actions/investment";
import { todayInVancouver } from "@/lib/format";

type Option = { id: string; label: string };

/**
 * Record money a partner put in.
 *
 * Who is never defaulted: picking the wrong name by not looking would
 * credit one partner with another's money, and that is exactly the
 * argument this screen exists to settle.
 */
export function ContributionForm({ partners }: { partners: Option[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [amount, setAmount] = useState("");
  const [partnerId, setPartnerId] = useState("");

  function submit(formData: FormData) {
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await addContribution({ ok: false }, formData);

      if (!result.ok) {
        setError(result.error ?? null);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      toast.success("Investment recorded");
      setOpen(false);
      setAmount("");
      setPartnerId("");
      router.refresh();
    });
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
            <SheetTitle>Record an investment</SheetTitle>
          </SheetHeader>

          <form action={submit} className="flex min-h-0 flex-1 flex-col">
            <SheetBody className="space-y-4">
              {error && (
                <div className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-3">
                  <CircleAlert className="mt-0.5 size-[18px] shrink-0 text-danger" />
                  <p className="text-[13.5px] text-danger">{error}</p>
                </div>
              )}

              <Field label="Who put it in" htmlFor="partner_id" required error={fieldErrors.partner_id}>
                <SimpleSelect
                  id="partner_id"
                  name="partner_id"
                  value={partnerId}
                  onValueChange={setPartnerId}
                  placeholder="Choose a partner"
                  options={partners.map((p) => ({ value: p.id, label: p.label }))}
                />
              </Field>

              <Field label="Amount" htmlFor="amount" required error={fieldErrors.amount}>
                <MoneyInput
                  id="amount"
                  name="amount"
                  value={amount}
                  onValueChange={setAmount}
                  inputMode="decimal"
                  className="h-[52px] text-[20px] font-semibold"
                />
              </Field>

              <Field label="When" htmlFor="contributed_on">
                <Input
                  id="contributed_on"
                  name="contributed_on"
                  type="date"
                  defaultValue={todayInVancouver()}
                />
              </Field>

              <Field label="What for" htmlFor="note">
                <Textarea
                  id="note"
                  name="note"
                  placeholder="Auction money for the 2014 Civic"
                  className="min-h-[70px]"
                />
              </Field>

              <div className="pb-2" />
            </SheetBody>

            <SheetFooter>
              <Button type="submit" size="lg" block disabled={pending || !amount || !partnerId}>
                {pending ? "Saving…" : "Record investment"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
