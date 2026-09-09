"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

export const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      "text-[13px] font-medium text-ink-muted leading-none select-none",
      className,
    )}
    {...props}
  />
));
Label.displayName = "Label";

const controlBase =
  "w-full rounded-lg border border-line-strong bg-surface px-3 text-ink " +
  "placeholder:text-ink-subtle transition-[border-color,box-shadow] " +
  "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 " +
  "disabled:opacity-50 disabled:bg-surface-2";

export type InputProps = React.ComponentProps<"input"> & { invalid?: boolean };

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        controlBase,
        "h-11",
        invalid && "border-danger focus:border-danger focus:ring-danger/25",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(controlBase, "min-h-[88px] py-2.5 leading-relaxed", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

/** Native select. Deliberate: the OS picker is faster on a phone than any JS menu. */
export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.ComponentProps<"select">
>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(controlBase, "h-11 appearance-none pr-9", className)}
      {...props}
    >
      {children}
    </select>
    <svg
      viewBox="0 0 20 20"
      className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 8 4 4 4-4" />
    </svg>
  </div>
));
NativeSelect.displayName = "NativeSelect";

/**
 * A labelled field. `hint` explains, `error` overrides it -- so a field
 * never shows contradictory guidance.
 */
export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  className,
  children,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <Label htmlFor={htmlFor}>
          {label}
          {required && <span className="text-danger"> *</span>}
        </Label>
      )}
      {children}
      {error ? (
        <p className="text-[12.5px] text-danger">{error}</p>
      ) : hint ? (
        <p className="text-[12.5px] text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Money input. Shows a $ affix, keeps the raw string while typing (so
 * "1." is not fought with), and hands cents up on change.
 */
export const MoneyInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<"input">, "onChange" | "value"> & {
    value: string;
    onValueChange: (raw: string) => void;
  }
>(({ className, value, onValueChange, ...props }, ref) => (
  <div className="relative">
    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle">
      $
    </span>
    <input
      ref={ref}
      inputMode="decimal"
      autoComplete="off"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      className={cn(controlBase, "tnum h-11 pl-7", className)}
      {...props}
    />
  </div>
));
MoneyInput.displayName = "MoneyInput";
