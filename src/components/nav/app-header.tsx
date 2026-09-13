import Link from "next/link";
import { ChevronLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Page header. Sticky, thin, and never home to a primary action -- those
 * belong at the bottom where the thumb is.
 *
 * `back` is for a screen you drilled into. `close` is for one you landed
 * on -- a tab you tapped by mistake -- and it goes home rather than into
 * whatever the history happens to hold. The tab bar was the only way off
 * those screens, and being told twice that they felt like dead ends is
 * enough: a screen should say how to leave it without the user having to
 * know where else to go.
 */
export function AppHeader({
  title,
  subtitle,
  back,
  close,
  action,
  below,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  back?: { href: string; label?: string };
  /** Shown in the same slot as `back`, as an X. Use one or the other. */
  close?: { href: string; label?: string };
  action?: React.ReactNode;
  /**
   * Rendered inside the same sticky block, under the title. Anything
   * that has to stay on screen with the header -- filter chips, a month
   * picker -- goes here rather than being a second sticky element, which
   * would just slide underneath this one.
   */
  below?: React.ReactNode;
  className?: string;
}) {
  // One slot, one control: a chevron if you drilled in, an X if you did not.
  const leave = back ?? close;

  return (
    <header
      className={cn(
        "pt-safe glass glass-bottom sticky top-0 z-30 border-b",
        className,
      )}
    >
      <div className="flex items-center gap-1 px-2 py-2.5">
        {leave && (
          <Link
            href={leave.href}
            className="tap -ml-1 flex items-center justify-center rounded-lg text-ink-muted active:bg-surface-2"
            aria-label={leave.label ?? (back ? "Back" : "Close")}
          >
            {back ? (
              <ChevronLeft className="size-6" strokeWidth={2} />
            ) : (
              <X className="size-[22px]" strokeWidth={2} />
            )}
          </Link>
        )}
        <div className={cn("min-w-0 flex-1", !leave && "pl-2")}>
          <h1 className="truncate text-[17px] font-semibold leading-tight tracking-[-0.01em] text-ink">
            {title}
          </h1>
          {subtitle && (
            <p className="truncate text-[12.5px] leading-tight text-ink-muted">{subtitle}</p>
          )}
        </div>
        {action && <div className="shrink-0 pr-1">{action}</div>}
      </div>
      {below}
    </header>
  );
}
