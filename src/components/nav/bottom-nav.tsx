"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Search, Car, Plus, Receipt, ChartColumn, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Thumb-first navigation. Fixed to the bottom, each tab a 44px+ target,
 * with Add raised where the thumb naturally rests. Expenses and Reports
 * are simply absent for anyone but the owner -- not disabled, absent, so
 * a staff account sees four tabs and an owner six.
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
  /** Owner-only. Money is not a tab everyone gets. */
  finance?: boolean;
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
    href: "/expenses",
    label: "Expenses",
    icon: Receipt,
    match: (p) => p.startsWith("/expenses"),
    finance: true,
  },
  {
    href: "/reports",
    label: "Reports",
    icon: ChartColumn,
    match: (p) => p.startsWith("/reports"),
    finance: true,
  },
  {
    href: "/more",
    label: "More",
    icon: Menu,
    match: (p) => p.startsWith("/more"),
  },
];

export function BottomNav({ showMoney }: { showMoney: boolean }) {
  const pathname = usePathname();
  const tabs = showMoney ? TABS : TABS.filter((t) => !t.finance);

  return (
    <nav
      className="pb-safe glass glass-top fixed inset-x-0 bottom-0 z-40 border-t"
      aria-label="Main"
    >
      <ul className="mx-auto flex max-w-[640px] items-stretch">
        {tabs.map((tab) => (
          <li
            key={tab.href}
            className={
              tab.primary ? "flex min-w-0 flex-1 justify-center" : "min-w-0 flex-1"
            }
          >
            <Link
              href={tab.href}
              prefetch
              aria-label={tab.primary ? "Add vehicle" : undefined}
              aria-current={tab.match(pathname) ? "page" : undefined}
              className={
                tab.primary
                  ? "flex flex-col items-center justify-center gap-0.5 px-0.5 pb-1.5 pt-1.5"
                  : "tap flex h-full min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 pb-1.5 pt-2"
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
        <span className="w-full truncate text-center text-[10px] font-medium leading-tight text-ink-subtle">
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
          "w-full truncate text-center text-[10px] leading-tight transition-colors duration-150",
          lit ? "font-semibold text-accent" : "font-medium text-ink-subtle",
        )}
      >
        {tab.label}
      </span>
    </>
  );
}
