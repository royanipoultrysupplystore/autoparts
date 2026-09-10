"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * The spinner shown while a screen is on its way.
 *
 * `loading.tsx` covers the wait once the new route starts rendering, but
 * there is a gap before that: the tap lands, the request goes out, and
 * nothing on screen has changed yet. On a phone that gap is exactly long
 * enough to read as "it ignored me", which is what makes people tap
 * twice.
 *
 * It waits 180ms before appearing. Most navigations finish inside that,
 * and a spinner that flashes for a tenth of a second looks worse than no
 * spinner at all -- it reads as a glitch rather than as progress. Only a
 * wait long enough to notice gets acknowledged.
 *
 * State lives in a module-level store rather than component state.
 * Navigation is an external system, and this is the shape React wants
 * for one: subscribe, read a snapshot, let the store push updates.
 */
const navStore = {
  visible: false,
  listeners: new Set<() => void>(),
  appear: null as ReturnType<typeof setTimeout> | null,

  subscribe(onChange: () => void) {
    navStore.listeners.add(onChange);
    return () => navStore.listeners.delete(onChange);
  },

  getSnapshot: () => navStore.visible,
  getServerSnapshot: () => false,

  set(visible: boolean) {
    if (navStore.visible === visible) return;
    navStore.visible = visible;
    navStore.listeners.forEach((l) => l());
  },

  start() {
    if (navStore.appear) clearTimeout(navStore.appear);
    // The grace period: say nothing about a wait nobody notices.
    navStore.appear = setTimeout(() => navStore.set(true), 180);
  },

  finish() {
    if (navStore.appear) {
      clearTimeout(navStore.appear);
      navStore.appear = null;
    }
    navStore.set(false);
  },
};

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const visible = useSyncExternalStore(
    navStore.subscribe,
    navStore.getSnapshot,
    navStore.getServerSnapshot,
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

      navStore.start();
    }

    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  // The route has changed, so the navigation is over.
  useEffect(() => {
    navStore.finish();
  }, [pathname, searchParams]);

  return (
    <div
      aria-hidden={!visible}
      role="status"
      className="pointer-events-none fixed inset-0 z-[100] grid place-items-center"
      style={{
        opacity: visible ? 1 : 0,
        transition: `opacity ${visible ? 160 : 220}ms var(--ms-ease-out)`,
      }}
    >
      {/* A breath of scrim: enough to lift the spinner off a busy list,
          not enough to feel like a modal has opened. */}
      <div
        className="absolute inset-0 bg-bg/35 backdrop-blur-[1px]"
        style={{
          opacity: visible ? 1 : 0,
          transition: "opacity 200ms var(--ms-ease-out)",
        }}
      />

      <div
        className={
          "glass relative grid size-[68px] place-items-center rounded-[22px] border " +
          "shadow-[0_12px_36px_-10px_rgb(26_25_23/0.3)]"
        }
        style={{
          transform: visible ? "scale(1)" : "scale(0.88)",
          transition: `transform ${visible ? 220 : 160}ms var(--ms-ease-spring)`,
        }}
      >
        <Spinner />
      </div>

      <span className="sr-only">Loading</span>
    </div>
  );
}

/**
 * An arc that both rotates and changes length, rather than a ring of
 * fixed size going round. The varying sweep is what stops it reading as
 * a static image and makes the motion feel alive.
 */
function Spinner() {
  return (
    <svg viewBox="0 0 44 44" className="size-9 animate-spinner-rotate" fill="none">
      {/* The track it runs on, barely there. */}
      <circle
        cx="22"
        cy="22"
        r="18"
        stroke="currentColor"
        strokeWidth="3.5"
        className="text-accent/15"
      />
      <circle
        cx="22"
        cy="22"
        r="18"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        className="animate-spinner-dash text-accent"
      />
    </svg>
  );
}
