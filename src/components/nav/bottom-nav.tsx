"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Search, Car, Plus, ChartColumn, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Thumb-first navigation. Five destinations, fixed to the bottom, each a
 * 44px+ target, with Add raised in the middle where the thumb naturally
 * rests. Reports is simply absent for staff -- not disabled, absent.
 *
 * Every screen behind these tabs reads live data, so a tap is always a
 * round trip. `usePathname` only changes once that finishes, which left
 * roughly half a second where the tap appeared to have done nothing.
 * `useLinkStatus` reports the pending state immediately, so the tab
 * lights up under the finger and the icon shows it is working.
 */

type Tab = {
  href: string;
  label: string;
  icon: typeof Search;
  match: (path: string) => boolean;
  primary?: boolean;
};

const TABS: Tab[] = [
  {
    href: "/search",
    label: "Search",
    icon: Search,
    match: (p) => p === "/search" || p.startsWith("/search/"),
  },
  {
    href: "/vehicles",
    label: "Vehicles",
    icon: Car,
    match: (p) => p.startsWith("/vehicles"),
  },
  {
    href: "/vehicles/new",
    label: "Add",
    icon: Plus,
    match: (p) => p === "/vehicles/new",
    primary: true,
  },
  {
    href: "/reports",
    label: "Reports",
    icon: ChartColumn,
    match: (p) => p.startsWith("/reports"),
  },
  {
    href: "/more",
    label: "More",
    icon: Menu,
    match: (p) => p.startsWith("/more"),
  },
];

export function BottomNav({ showReports }: { showReports: boolean }) {
  const pathname = usePathname();
  const tabs = showReports ? TABS : TABS.filter((t) => t.href !== "/reports");

  return (
    <nav
      className="pb-safe glass fixed inset-x-0 bottom-0 z-40 border-t"
      aria-label="Main"
    >
      <ul className="mx-auto flex max-w-[640px] items-stretch">
        {tabs.map((tab) => (
          <li
            key={tab.href}
            className={tab.primary ? "flex flex-1 justify-center" : "flex-1"}
          >
            <Link
              href={tab.href}
              prefetch
              aria-label={tab.primary ? "Add vehicle" : undefined}
              aria-current={tab.match(pathname) ? "page" : undefined}
              className={
                tab.primary
                  ? "flex flex-col items-center justify-center gap-1 px-2 pb-1.5 pt-1.5"
                  : "tap flex h-full flex-col items-center justify-center gap-1 px-2 pb-1.5 pt-2"
              }
            >
              <TabInner tab={tab} active={tab.match(pathname)} />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Must be a child of <Link> -- useLinkStatus reads the pending state of
 * the nearest one above it.
 */
function TabInner({ tab, active }: { tab: Tab; active: boolean }) {
  const { pending } = useLinkStatus();
  const Icon = tab.icon;

  // Treat a pending tap as active straight away, so the highlight moves
  // with the finger rather than a beat behind it.
  const lit = active || pending;

  if (tab.primary) {
    return (
      <>
        <span
          className={cn(
            "flex size-11 items-center justify-center rounded-full",
            "bg-accent text-accent-text shadow-[0_4px_14px_-3px_rgb(23_84_127/0.6)]",
            "transition-transform duration-150 ease-out-soft active:scale-90",
            pending && "scale-95",
          )}
        >
          <Icon
            className={cn("size-6 transition-transform", pending && "animate-spin-slow")}
            strokeWidth={2.25}
          />
        </span>
        <span className="text-[10.5px] font-medium leading-none text-ink-subtle">
          {tab.label}
        </span>
      </>
    );
  }

  return (
    <>
      <span className="relative flex items-center justify-center">
        <Icon
          className={cn(
            "size-[22px] transition-[color,transform] duration-150 ease-out-soft",
            lit ? "text-accent" : "text-ink-subtle",
            pending && "scale-90",
          )}
          strokeWidth={lit ? 2.25 : 1.75}
        />
        {/* A quiet ring while the next screen is on its way. */}
        {pending && (
          <span className="absolute -inset-1.5 animate-ping rounded-full border-2 border-accent/40" />
        )}
      </span>
      <span
        className={cn(
          "text-[10.5px] leading-none transition-colors duration-150",
          lit ? "font-semibold text-accent" : "font-medium text-ink-subtle",
        )}
      >
        {tab.label}
      </span>
    </>
  );
}
