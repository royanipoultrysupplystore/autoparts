"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, RefreshCw, UserPlus } from "lucide-react";
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
import { addTeamMember } from "@/lib/actions/team";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/db";

/**
 * Adding someone to the yard.
 *
 * There is no invitation email. Supabase's built-in mail is rate limited
 * and lands in spam often enough that a partner standing in front of you
 * would be left waiting on something that may never arrive. So the owner
 * sets a temporary password and says it out loud, which for a handful of
 * people in one yard is both faster and more reliable. The new person
 * changes it from More once they are in.
 */

const ROLES: { value: UserRole; label: string; hint: string }[] = [
  {
    value: "partner",
    label: "Partner",
    hint: "Everything: costs, profit, expenses, deleting",
  },
  {
    value: "staff",
    label: "Staff",
    hint: "Search, sell and edit parts. No costs, no reports",
  },
  {
    value: "owner",
    label: "Owner",
    hint: "Everything, plus managing this team list",
  },
];

/** Readable at a glance and read out loud without ambiguity. */
function suggestPassword(): string {
  const words = ["yard", "shelf", "torque", "spanner", "rack", "bumper", "engine", "wrench"];
  const word = words[Math.floor(Math.random() * words.length)];
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  return `${word}-${digits}`;
}

export function AddMemberSheet() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<UserRole>("staff");
  const [password, setPassword] = useState(suggestPassword);

  const ready = fullName.trim().length > 0 && email.trim().length > 3 && password.length >= 8;

  function reset() {
    setFullName("");
    setEmail("");
    setPhone("");
    setRole("staff");
    setPassword(suggestPassword());
  }

  async function copyDetails() {
    const text = `${email.trim()}\n${password}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied", { description: "Email and password, ready to send." });
    } catch {
      toast("Could not copy", { description: "Write them down instead." });
    }
  }

  function submit() {
    startTransition(async () => {
      const result = await addTeamMember({
        email: email.trim(),
        fullName,
        role,
        password,
        phone,
      });

      if (!result.ok) {
        toast.error("Not added", { description: result.error, duration: 8000 });
        return;
      }

      toast.success(`${fullName.trim()} can sign in now`, {
        description: `${email.trim()} · ${password}`,
        duration: 12000,
      });
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" variant="subtle" onClick={() => { reset(); setOpen(true); }}>
        <UserPlus className="size-4" />
        Add
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent tall>
          <SheetHeader>
            <SheetTitle>Add someone to the yard</SheetTitle>
            <SheetDescription>
              They sign in with this email and password. Tell them in person.
            </SheetDescription>
          </SheetHeader>

          <SheetBody className="space-y-4">
            <Field label="Name" htmlFor="member_name" required>
              <Input
                id="member_name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ahmad Rahimi"
                autoCapitalize="words"
                autoFocus
              />
            </Field>

            <Field
              label="Email"
              htmlFor="member_email"
              required
              hint="This is their username. It does not have to receive mail."
            >
              <Input
                id="member_email"
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ahmad@example.com"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </Field>

            <Field label="Phone" htmlFor="member_phone" hint="Optional. Shown on the team list.">
              <Input
                id="member_phone"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="604-555-0100"
              />
            </Field>

            <Field label="What they can do">
              <div className="space-y-2">
                {ROLES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRole(r.value)}
                    aria-pressed={role === r.value}
                    className={cn(
                      "flex w-full flex-col items-start rounded-xl border px-3.5 py-3 text-left",
                      "transition-[background-color,border-color,transform] duration-150 ease-out-soft",
                      "active:scale-[0.99]",
                      role === r.value
                        ? "border-accent bg-accent-soft"
                        : "border-line-strong bg-surface",
                    )}
                  >
                    <span
                      className={cn(
                        "text-[15px] font-semibold",
                        role === r.value ? "text-accent" : "text-ink",
                      )}
                    >
                      {r.label}
                    </span>
                    <span className="mt-0.5 text-[12.5px] leading-snug text-ink-muted">
                      {r.hint}
                    </span>
                  </button>
                ))}
              </div>
            </Field>

            <Field
              label="Temporary password"
              htmlFor="member_password"
              hint="At least 8 characters. They can change it once they are in."
            >
              <div className="flex gap-2">
                <Input
                  id="member_password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => setPassword(suggestPassword())}
                  aria-label="Suggest another password"
                  className="shrink-0"
                >
                  <RefreshCw className="size-[18px]" />
                </Button>
              </div>
            </Field>

            {email.trim() && (
              <button
                type="button"
                onClick={copyDetails}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong px-4 py-3 text-[13.5px] font-medium text-ink-muted active:bg-surface-2"
              >
                <Copy className="size-4" />
                Copy the email and password
              </button>
            )}

            <div className="pb-2" />
          </SheetBody>

          <SheetFooter>
            <div className="flex gap-2.5">
              <Button variant="secondary" size="lg" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button size="lg" block onClick={submit} disabled={pending || !ready}>
                {pending ? "Adding…" : "Add to the team"}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
