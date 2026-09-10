"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Select.
 *
 * This replaces the native <select>. A native control hands the OS a
 * picker, which is fast, but it also gives up every bit of control over
 * how the thing feels -- and on a desktop browser the first click often
 * only focuses the element, so the menu takes two taps to appear.
 *
 * Radix opens on pointer-down instead: the panel is up before the finger
 * leaves the glass. The rest is presentation -- a blurred, translucent
 * surface that lets the form show through, motion that starts fast and
 * settles rather than easing linearly, and a checkmark on the current
 * value so it reads at a glance in bad light.
 */

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;
export const SelectGroup = SelectPrimitive.Group;

export const SelectTrigger = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & {
    invalid?: boolean;
  }
>(({ className, children, invalid, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      "flex h-11 w-full items-center justify-between gap-2 rounded-lg",
      "border border-line-strong bg-surface px-3 text-left text-[16px] text-ink",
      "transition-[border-color,box-shadow,transform] duration-150",
      "data-[placeholder]:text-ink-subtle",
      "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25",
      "data-[state=open]:border-accent data-[state=open]:ring-2 data-[state=open]:ring-accent/25",
      "active:scale-[0.995]",
      "disabled:opacity-50",
      invalid && "border-danger focus:border-danger focus:ring-danger/25",
      className,
    )}
    {...props}
  >
    <span className="min-w-0 flex-1 truncate">{children}</span>
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="size-4 shrink-0 text-ink-subtle transition-transform duration-200 data-[state=open]:rotate-180" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = "SelectTrigger";

export const SelectContent = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      sideOffset={6}
      className={cn(
        "relative z-50 max-h-[min(22rem,var(--radix-select-content-available-height))]",
        "min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl",
        // The glass: a translucent surface over a blur, with a hairline
        // highlight so it reads as a raised pane rather than a flat box.
        "border border-white/20 bg-surface/80 backdrop-blur-xl backdrop-saturate-150",
        "dark:border-white/10 dark:bg-surface/75",
        "shadow-[0_16px_48px_-12px_rgb(26_25_23/0.28),0_0_0_1px_rgb(26_25_23/0.04)]",
        "origin-[var(--radix-select-content-transform-origin)]",
        "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
        "data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1",
        "duration-150 ease-out",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.Viewport className="max-h-[inherit] overflow-y-auto overscroll-contain p-1.5">
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = "SelectContent";

export const SelectItem = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item> & {
    hint?: React.ReactNode;
  }
>(({ className, children, hint, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-pointer select-none items-center gap-3 rounded-lg",
      "py-2.5 pl-3 pr-9 text-[15px] text-ink outline-none",
      "transition-colors duration-100",
      "data-[highlighted]:bg-accent/10 data-[highlighted]:text-ink",
      "data-[state=checked]:font-medium",
      "data-[disabled]:pointer-events-none data-[disabled]:opacity-45",
      className,
    )}
    style={{ minHeight: 44 }}
    {...props}
  >
    <span className="min-w-0 flex-1">
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      {hint && (
        <span className="mt-0.5 block text-[12.5px] leading-tight text-ink-subtle">
          {hint}
        </span>
      )}
    </span>

    <SelectPrimitive.ItemIndicator className="absolute right-3 flex items-center justify-center">
      <Check className="size-[18px] text-accent" strokeWidth={2.5} />
    </SelectPrimitive.ItemIndicator>
  </SelectPrimitive.Item>
));
SelectItem.displayName = "SelectItem";

/**
 * The common shape: a list of options, a value, a change handler. Saves
 * repeating the trigger/content/item scaffolding at every call site.
 */
export function SimpleSelect<T extends string>({
  value,
  onValueChange,
  options,
  placeholder,
  id,
  name,
  className,
  disabled,
}: {
  value: T | "";
  onValueChange: (value: T) => void;
  options: { value: T; label: string; hint?: string }[];
  placeholder?: string;
  id?: string;
  name?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value || undefined}
      onValueChange={(v) => onValueChange(v as T)}
      name={name}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={className}>
        <SelectValue placeholder={placeholder ?? "Choose…"} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} hint={o.hint}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
