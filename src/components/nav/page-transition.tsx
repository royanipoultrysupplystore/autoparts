"use client";

import { usePathname } from "next/navigation";

/**
 * A short rise-and-fade as each screen arrives.
 *
 * Keyed on the pathname, so React remounts the subtree on every
 * navigation and the animation replays. Without it a new screen simply
 * blinks into existence, which is the single biggest thing that makes a
 * web app feel like a web page rather than an app.
 *
 * 220ms and 6px: enough to see the screen arrive, not enough to wait for.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="animate-page-in">
      {children}
    </div>
  );
}
