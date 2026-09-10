"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { EllipsisVertical, KeyRound, Power, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { changeMemberRole, resetMemberPassword, setMemberActive } from "@/lib/actions/team";
import type { UserRole } from "@/types/db";

/**
 * What the owner can do to one account.
 *
 * There is no delete. A person who leaves is switched off: they cannot
 * sign in, and every sale they ever recorded stays attributed to them in
 * the reports. Deleting the account would quietly rewrite months of
 * history to "Unassigned".
 */
export function MemberMenu({
  userId,
  name,
  role,
  isActive,
  isSelf,
}: {
  userId: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { confirm, element } = useConfirmDialog();

  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error("Not changed", { description: result.error, duration: 8000 });
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }

  function setRole(next: UserRole) {
    void (async () => {
      const yes = await confirm({
        title: `Make ${name} a ${next}?`,
        body:
          next === "staff"
            ? "They will lose access to costs, profit, expenses and every report. They can still search, sell and edit parts."
            : next === "owner"
              ? "They will be able to add and remove people from this team, including you."
              : "They will be able to see costs, profit and every report, and delete vehicles.",
        confirmLabel: `Make ${next}`,
        destructive: false,
      });
      if (!yes) return;
      run(() => changeMemberRole(userId, next), `${name} is now a ${next}`);
    })();
  }

  function toggleActive() {
    void (async () => {
      if (isActive) {
        const yes = await confirm({
          title: `Switch off ${name}?`,
          body: (
            <>
              They will not be able to sign in. Everything they have sold stays
              on the reports under their name — which is why this is better than
              deleting the account.
              <br />
              <br />
              You can switch them back on at any time.
            </>
          ),
          confirmLabel: "Switch off",
        });
        if (!yes) return;
      }
      run(
        () => setMemberActive(userId, !isActive),
        isActive ? `${name} is switched off` : `${name} can sign in again`,
      );
    })();
  }

  function submitPassword() {
    if (newPassword.length < 8) {
      toast.error("Too short", { description: "At least 8 characters." });
      return;
    }
    run(() => resetMemberPassword(userId, newPassword), `New password set for ${name}`);
    setResetting(false);
    setNewPassword("");
  }

  const itemClass =
    "flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2.5 " +
    "text-[15px] outline-none transition-colors duration-100 " +
    "data-[highlighted]:bg-accent/10";

  return (
    <>
      {element}

      {resetting && (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New temporary password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="h-11 flex-1 rounded-lg border border-line-strong bg-surface px-3 font-mono text-[15px] text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
          <button
            type="button"
            onClick={submitPassword}
            disabled={pending}
            className="tap shrink-0 rounded-lg bg-accent px-4 text-[14px] font-medium text-accent-text"
          >
            Set
          </button>
          <button
            type="button"
            onClick={() => {
              setResetting(false);
              setNewPassword("");
            }}
            className="tap shrink-0 rounded-lg px-3 text-[14px] text-ink-muted"
          >
            Cancel
          </button>
        </div>
      )}

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label={`Options for ${name}`}
            disabled={pending}
            className={cn(
              "tap flex shrink-0 items-center justify-center rounded-lg text-ink-muted",
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
              "z-50 min-w-[240px] overflow-hidden rounded-xl p-1.5",
              "glass border shadow-[0_16px_48px_-12px_rgb(26_25_23/0.28)]",
              "origin-[var(--radix-dropdown-menu-content-transform-origin)]",
              "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
              "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
              "duration-150 ease-out-soft",
            )}
          >
            <DropdownMenu.Label className="px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">
              Role
            </DropdownMenu.Label>

            {(["owner", "partner", "staff"] as UserRole[]).map((r) => (
              <DropdownMenu.Item
                key={r}
                disabled={r === role || isSelf}
                onSelect={() => setRole(r)}
                className={cn(itemClass, "text-ink data-[disabled]:opacity-40")}
              >
                <ShieldCheck
                  className={cn("size-[18px]", r === role ? "text-accent" : "text-ink-muted")}
                />
                <span className="flex-1 capitalize">{r}</span>
                {r === role && <span className="text-[12px] text-accent">current</span>}
              </DropdownMenu.Item>
            ))}

            <DropdownMenu.Separator className="my-1.5 h-px bg-line" />

            <DropdownMenu.Item
              onSelect={() => setResetting(true)}
              className={cn(itemClass, "text-ink")}
            >
              <KeyRound className="size-[18px] text-ink-muted" />
              Set a new password
            </DropdownMenu.Item>

            <DropdownMenu.Item
              disabled={isSelf}
              onSelect={toggleActive}
              className={cn(
                itemClass,
                "data-[disabled]:opacity-40",
                isActive
                  ? "text-danger data-[highlighted]:bg-danger-soft"
                  : "text-available",
              )}
            >
              <Power className="size-[18px]" />
              {isActive ? "Switch off" : "Switch back on"}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  );
}
