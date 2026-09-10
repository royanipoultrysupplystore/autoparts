"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

/**
 * Bottom sheet.
 *
 * Sheets rise from the bottom because that is where the thumb is. Primary
 * actions live in the footer, never the header, for the same reason.
 */

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

const Overlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-[rgb(20_18_16/0.45)] backdrop-blur-[3px]",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
      "duration-200 ease-out-soft",
      className,
    )}
    {...props}
  />
));
Overlay.displayName = "SheetOverlay";

export const SheetContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /** Fills the screen minus a top inset. Use for long forms and trim lists. */
    tall?: boolean;
  }
>(({ className, children, tall, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <Overlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 flex flex-col",
        "glass rounded-t-[20px] border-t shadow-[var(--shadow-sheet)]",
        "mx-auto w-full max-w-[640px]",
        tall ? "top-8 sm:top-12" : "max-h-[92dvh]",
        "duration-[260ms] ease-out-soft",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
        className,
      )}
      {...props}
    >
      {/* Grab handle: tells the user this thing drags down. */}
      <div className="flex shrink-0 justify-center pt-2.5 pb-1">
        <div className="h-1 w-10 rounded-full bg-line-strong/70" />
      </div>
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = "SheetContent";

export function SheetHeader({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("shrink-0 px-4 pb-3 pt-1", className)}>{children}</div>
  );
}

export const SheetTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-[17px] font-semibold leading-tight text-ink", className)}
    {...props}
  />
));
SheetTitle.displayName = "SheetTitle";

export const SheetDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("mt-1 text-[13.5px] text-ink-muted", className)}
    {...props}
  />
));
SheetDescription.displayName = "SheetDescription";

/** Scrolling middle. Everything long goes in here. */
export function SheetBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 pb-2", className)}>
      {children}
    </div>
  );
}

/** Sticky footer for the primary actions. Sits above the home indicator. */
export function SheetFooter({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "pb-safe glass shrink-0 border-t px-4 pb-3 pt-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
