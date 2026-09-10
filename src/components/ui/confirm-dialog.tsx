"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Confirmation for destructive actions. Every delete in this app goes
 * through here, and every one of them also lands in the activity log.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  destructive = true,
  busy = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-[rgb(20_18_16/0.45)] backdrop-blur-[3px]",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-[400px]",
            "-translate-x-1/2 -translate-y-1/2 rounded-2xl border p-5",
            "glass shadow-[var(--shadow-raised)]",
            "duration-200 ease-out-soft",
            "data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=closed]:fade-out-0",
          )}
        >
          <DialogPrimitive.Title className="text-[16px] font-semibold text-ink">
            {title}
          </DialogPrimitive.Title>
          {body && (
            <DialogPrimitive.Description asChild>
              <div className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">{body}</div>
            </DialogPrimitive.Description>
          )}
          <div className="mt-5 flex gap-2.5">
            <Button
              variant="secondary"
              block
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              {cancelLabel}
            </Button>
            <Button
              variant={destructive ? "danger" : "primary"}
              block
              onClick={() => void onConfirm()}
              disabled={busy}
            >
              {busy ? "Working…" : confirmLabel}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Hook form: `const confirm = useConfirm()` then `await confirm({...})`. */
export function useConfirmDialog() {
  const [state, setState] = React.useState<{
    open: boolean;
    props: Omit<React.ComponentProps<typeof ConfirmDialog>, "open" | "onOpenChange" | "onConfirm">;
    resolve?: (value: boolean) => void;
  }>({ open: false, props: { title: "" } });

  const confirm = React.useCallback(
    (props: Omit<React.ComponentProps<typeof ConfirmDialog>, "open" | "onOpenChange" | "onConfirm">) =>
      new Promise<boolean>((resolve) => setState({ open: true, props, resolve })),
    [],
  );

  const element = (
    <ConfirmDialog
      {...state.props}
      open={state.open}
      onOpenChange={(open) => {
        if (!open) {
          state.resolve?.(false);
          setState((s) => ({ ...s, open: false }));
        }
      }}
      onConfirm={() => {
        state.resolve?.(true);
        setState((s) => ({ ...s, open: false }));
      }}
    />
  );

  return { confirm, element };
}
