"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const KEY = "ms-theme";

/**
 * Light is the default and stays the default -- this app is read outdoors.
 * Dark is here for the partner doing paperwork at 11pm.
 *
 * The theme lives on <html> as a class, set before first paint by the
 * inline script in the root layout so a cold start never flashes white.
 * That makes the DOM the source of truth, not React state -- so this
 * subscribes to it as an external store rather than mirroring it into
 * state inside an effect.
 */
const themeStore = {
  listeners: new Set<() => void>(),

  subscribe(onChange: () => void) {
    themeStore.listeners.add(onChange);
    return () => themeStore.listeners.delete(onChange);
  },

  getSnapshot(): boolean {
    return document.documentElement.classList.contains("dark");
  },

  // Light on the server: it is the default, and the inline script
  // corrects it before anything is painted.
  getServerSnapshot(): boolean {
    return false;
  },

  set(dark: boolean) {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem(KEY, dark ? "dark" : "light");
    } catch {
      // Private mode. The choice just will not survive a reload.
    }
    themeStore.listeners.forEach((l) => l());
  },
};

export function ThemeToggle({ className }: { className?: string }) {
  const dark = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getSnapshot,
    themeStore.getServerSnapshot,
  );

  return (
    <button
      type="button"
      onClick={() => themeStore.set(!dark)}
      className={cn(
        "tap flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-left active:bg-surface-2",
        className,
      )}
      aria-pressed={dark}
    >
      <span className="flex items-center gap-3">
        {dark ? (
          <Moon className="size-5 text-ink-muted" />
        ) : (
          <Sun className="size-5 text-ink-muted" />
        )}
        <span className="text-[14.5px] text-ink">Dark mode</span>
      </span>
      <span
        className={cn(
          "relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors",
          dark ? "bg-accent" : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-[3px] size-5 rounded-full bg-white shadow transition-[left]",
            dark ? "left-[23px]" : "left-[3px]",
          )}
        />
      </span>
    </button>
  );
}
