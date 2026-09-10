import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Page header. Sticky, thin, and never home to a primary action -- those
 * belong at the bottom where the thumb is.
 */
export function AppHeader({
  title,
  subtitle,
  back,
  action,
  below,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  back?: { href: string; label?: string };
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
  return (
    <header
      className={cn(
        "pt-safe glass glass-bottom sticky top-0 z-30 border-b",
        className,
      )}
    >
      <div className="flex items-center gap-1 px-2 py-2.5">
        {back && (
          <Link
            href={back.href}
            className="tap -ml-1 flex items-center justify-center rounded-lg text-ink-muted active:bg-surface-2"
            aria-label={back.label ?? "Back"}
          >
            <ChevronLeft className="size-6" strokeWidth={2} />
          </Link>
        )}
        <div className={cn("min-w-0 flex-1", !back && "pl-2")}>
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
