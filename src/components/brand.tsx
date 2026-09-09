import { cn } from "@/lib/utils";

/**
 * The mark: a wrench crossing a gear tooth ring, drawn in the same line
 * language as the part icons so the whole app looks authored by one hand.
 */
export function Logo({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="8" className="fill-accent" />
      <g
        stroke="currentColor"
        className="text-accent-text"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="16" cy="16" r="7.5" />
        <circle cx="16" cy="16" r="2.6" />
        <path d="M16 8.5v2.2" />
        <path d="M16 21.3v2.2" />
        <path d="M8.5 16h2.2" />
        <path d="M21.3 16h2.2" />
        <path d="m10.7 10.7 1.6 1.6" />
        <path d="m19.7 19.7 1.6 1.6" />
        <path d="m21.3 10.7-1.6 1.6" />
        <path d="m12.3 19.7-1.6 1.6" />
      </g>
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Logo size={28} />
      <span className="text-[15px] font-semibold leading-none tracking-[-0.01em] text-ink">
        Mahmood Shah
        <span className="ml-1.5 font-normal text-ink-subtle">Auto Recycler</span>
      </span>
    </div>
  );
}

export function WordmarkLarge({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col items-center text-center", className)}>
      <Logo size={56} />
      <h1 className="mt-4 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink">
        Mahmood Shah Auto Recycler
      </h1>
      <p className="mt-1.5 text-[13.5px] text-ink-muted">
        Parts inventory · Vancouver, BC
      </p>
    </div>
  );
}
