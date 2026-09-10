import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function Card({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function SectionHeading({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 px-1", className)}>
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-subtle">
        {children}
      </h2>
      {action}
    </div>
  );
}

/** A single number with its label. Figures are tabular so columns line up. */
export function Stat({
  label,
  value,
  sub,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "positive" | "negative" | "muted";
  className?: string;
}) {
  const toneClass = {
    default: "text-ink",
    positive: "text-available",
    negative: "text-danger",
    muted: "text-ink-muted",
  }[tone];

  return (
    <div className={cn("rounded-xl border border-line bg-surface p-3.5", className)}>
      <div className="text-[12px] font-medium uppercase tracking-[0.05em] text-ink-subtle">
        {label}
      </div>
      <div className={cn("tnum mt-1.5 text-[22px] font-semibold leading-none", toneClass)}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[12.5px] text-ink-muted">{sub}</div>}
    </div>
  );
}

/** Skeletons, never spinners: the shape of the answer arrives before the answer. */
export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={cn("skeleton rounded-md", className)} style={style} aria-hidden="true" />
  );
}

export function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3"
        >
          <Skeleton className="size-11 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-[58%]" />
            <Skeleton className="h-3 w-[38%]" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * Empty states say what to do next. "No results" is not an empty state,
 * it is a dead end.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: React.ReactNode;
  action?: { label: string; onClick?: () => void; href?: string };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center",
        className,
      )}
    >
      {icon && <div className="mb-3 text-ink-subtle">{icon}</div>}
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {body && <p className="mt-1.5 max-w-[38ch] text-[13.5px] text-ink-muted">{body}</p>}
      {action &&
        (action.href ? (
          <Button asChild className="mt-4" size="md">
            <a href={action.href}>{action.label}</a>
          </Button>
        ) : (
          <Button className="mt-4" size="md" onClick={action.onClick}>
            {action.label}
          </Button>
        ))}
    </div>
  );
}

/** Label/value line for detail sheets. */
export function DetailRow({
  label,
  value,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-2", className)}>
      <dt className="shrink-0 text-[13px] text-ink-muted">{label}</dt>
      <dd className="tnum min-w-0 text-right text-[14px] font-medium text-ink">{value}</dd>
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-line", className)} />;
}
