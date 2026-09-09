"use client";

import { Toaster as Sonner, toast } from "sonner";

/**
 * Toasts land at the top on mobile: the bottom is where the tab bar and
 * the primary sheet actions live, and a toast must never cover a button
 * someone is reaching for.
 */
export function Toaster() {
  return (
    <Sonner
      position="top-center"
      offset={12}
      duration={4200}
      gap={8}
      toastOptions={{
        classNames: {
          toast:
            "!bg-surface !text-ink !border !border-line !rounded-xl !shadow-[var(--shadow-raised)] !text-[13.5px]",
          title: "!font-semibold",
          description: "!text-ink-muted",
          actionButton: "!bg-accent !text-accent-text !rounded-md",
          cancelButton: "!bg-surface-2 !text-ink !rounded-md",
          error: "!border-danger/40",
          success: "!border-available/40",
        },
      }}
    />
  );
}

export { toast };
