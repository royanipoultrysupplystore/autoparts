"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Car, Plus, ChartColumn, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Thumb-first navigation. Five destinations, fixed to the bottom, each a
 * 44px+ target, with Add raised in the middle where the thumb naturally
 * rests. Reports is simply absent for staff -- not disabled, absent.
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
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md"
      aria-label="Main"
    >
      <ul className="mx-auto flex max-w-[640px] items-stretch">
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;

          if (tab.primary) {
            return (
              <li key={tab.href} className="flex flex-1 justify-center">
                <Link
                  href={tab.href}
                  className="flex flex-col items-center justify-center gap-1 px-2 pb-1.5 pt-1.5"
                  aria-label="Add vehicle"
                >
                  <span
                    className={cn(
                      "flex size-11 items-center justify-center rounded-full",
                      "bg-accent text-accent-text shadow-[0_2px_10px_-2px_rgb(23_84_127/0.55)]",
                      "transition-transform active:scale-95",
                    )}
                  >
                    <Icon className="size-6" strokeWidth={2.25} />
                  </span>
                  <span className="text-[10.5px] font-medium leading-none text-ink-subtle">
                    {tab.label}
                  </span>
                </Link>
              </li>
            );
          }

          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "tap flex h-full flex-col items-center justify-center gap-1 px-2 pb-1.5 pt-2",
                  "transition-colors",
                  active ? "text-accent" : "text-ink-subtle active:text-ink",
                )}
              >
                <Icon className="size-[22px]" strokeWidth={active ? 2.25 : 1.75} />
                <span
                  className={cn(
                    "text-[10.5px] leading-none",
                    active ? "font-semibold" : "font-medium",
                  )}
                >
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
