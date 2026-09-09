"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { cn } from "@/lib/utils";

export const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer size-[22px] shrink-0 rounded-[6px] border-2 border-line-strong bg-surface",
      "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
      "data-[state=checked]:border-accent data-[state=checked]:bg-accent",
      "data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent",
      "disabled:opacity-45",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-accent-text">
      {props.checked === "indeterminate" ? (
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
          <path d="M6 12h12" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="3.25" strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12.5 4.5 4.5L19 7" />
        </svg>
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = "Checkbox";

/** Whole-row toggle: the entire 44px row is the tap target, not just the box. */
export function CheckRow({
  checked,
  onCheckedChange,
  children,
  className,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "tap flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2",
        "active:bg-surface-2",
        checked ? "bg-surface" : "bg-surface opacity-55",
        disabled && "pointer-events-none opacity-40",
        className,
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        disabled={disabled}
      />
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}
