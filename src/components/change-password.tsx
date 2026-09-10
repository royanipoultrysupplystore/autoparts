"use client";

import { useState, useTransition } from "react";
import { KeyRound } from "lucide-react";
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
import { Field, Input } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { getSupabaseBrowser } from "@/lib/supabase/client";

/**
 * Changing your own password.
 *
 * Goes straight to Supabase from the browser with the session already in
 * hand -- no server action, and the new password never passes through
 * this app's own code. Everyone gets a temporary password from the owner
 * when their account is made, so this is the first thing they should do.
 */
export function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && password !== confirm;
  const ready = password.length >= 8 && password === confirm;

  function submit() {
    startTransition(async () => {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        toast.error("Not changed", { description: error.message });
        return;
      }

      toast.success("Password changed", {
        description: "Use the new one next time you sign in.",
      });
      setPassword("");
      setConfirm("");
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-surface-2"
      >
        <KeyRound className="size-5 shrink-0 text-ink-muted" />
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] text-ink">Change my password</span>
          <span className="block text-[12.5px] text-ink-subtle">
            Do this once, after your first sign-in
          </span>
        </span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Change your password</SheetTitle>
            <SheetDescription>At least 8 characters.</SheetDescription>
          </SheetHeader>

          <SheetBody className="space-y-4">
            <Field
              label="New password"
              htmlFor="new_password"
              error={tooShort ? "At least 8 characters." : null}
            >
              <Input
                id="new_password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                invalid={tooShort}
                autoFocus
              />
            </Field>

            <Field
              label="Type it again"
              htmlFor="confirm_password"
              error={mismatch ? "These do not match." : null}
            >
              <Input
                id="confirm_password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                invalid={mismatch}
              />
            </Field>

            <div className="pb-2" />
          </SheetBody>

          <SheetFooter>
            <div className="flex gap-2.5">
              <Button variant="secondary" size="lg" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button size="lg" block onClick={submit} disabled={pending || !ready}>
                {pending ? "Changing…" : "Change password"}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
