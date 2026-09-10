"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * The bar across the top during a navigation.
 *
 * `loading.tsx` covers the wait once the new route starts rendering, but
 * there is a gap before that: the tap lands, the request goes out, and
 * nothing on screen has changed yet. On a phone that gap is exactly long
 * enough to read as "it ignored me", which is what makes people tap
 * twice.
 *
 * The App Router exposes no router events, so the two ends of a
 * navigation are detected here: a click on an internal link starts the
 * bar, and the pathname changing finishes it.
 *
 * Progress lives in a module-level store rather than component state.
 * Navigation is an external system, and this is the shape React wants
 * for one: subscribe, read a snapshot, and let the store push updates.
 * A single number carries it -- 0 means hidden -- so the snapshot stays
 * a stable primitive.
 */
const progressStore = {
  value: 0,
  listeners: new Set<() => void>(),
  creep: null as ReturnType<typeof setInterval> | null,
  hide: null as ReturnType<typeof setTimeout> | null,

  subscribe(onChange: () => void) {
    progressStore.listeners.add(onChange);
    return () => progressStore.listeners.delete(onChange);
  },

  getSnapshot: () => progressStore.value,
  getServerSnapshot: () => 0,

  set(value: number) {
    progressStore.value = value;
    progressStore.listeners.forEach((l) => l());
  },

  start() {
    if (progressStore.creep) clearInterval(progressStore.creep);
    if (progressStore.hide) clearTimeout(progressStore.hide);

    progressStore.set(8);

    // Decelerating: quick enough to look responsive, then slowing, and
    // never arriving on its own. Honest about waiting on a network.
    progressStore.creep = setInterval(() => {
      const p = progressStore.value;
      if (p >= 90) return;
      progressStore.set(p + Math.max(0.4, (90 - p) / 14));
    }, 90);
  },

  finish() {
    if (progressStore.creep) {
      clearInterval(progressStore.creep);
      progressStore.creep = null;
    }
    if (progressStore.value === 0) return;

    progressStore.set(100);
    progressStore.hide = setTimeout(() => progressStore.set(0), 260);
  },
};

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const progress = useSyncExternalStore(
    progressStore.subscribe,
    progressStore.getSnapshot,
    progressStore.getServerSnapshot,
  );

  // Start on any click that is going to navigate.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      // Let modified clicks fall through to the browser.
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }

      progressStore.start();
    }

    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  // The route has changed, so the navigation is over.
  useEffect(() => {
    progressStore.finish();
  }, [pathname, searchParams]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]"
      style={{
        opacity: progress > 0 ? 1 : 0,
        transition: "opacity 200ms ease-out",
      }}
    >
      <div
        className="h-full bg-accent"
        style={{
          width: `${progress}%`,
          transition: "width 220ms cubic-bezier(0.16, 1, 0.3, 1)",
          boxShadow: "0 0 10px 1px var(--accent), 0 0 4px var(--accent)",
        }}
      />
    </div>
  );
}
