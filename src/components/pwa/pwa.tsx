"use client";

import { useEffect, useState } from "react";
import { Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

/**
 * Registers the service worker and offers the install prompt.
 *
 * The app goes on a home screen, so there is no App Store review to wait
 * on and one build covers both phones. Chrome and Edge fire
 * `beforeinstallprompt`, so those get a real button. iOS Safari does not,
 * so it gets the Share-sheet instructions instead -- which is the only
 * way to install a PWA there, and not something a user guesses.
 */

const DISMISS_KEY = "ms-install-dismissed";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Registered after load so it never competes with the first paint.
    const register = () => {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}

export function InstallPrompt() {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Already installed, or already told us to go away.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS reports installed state on navigator, not via display-mode.
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      // Private mode: just show it. One banner is not a problem.
    }

    if (standalone || dismissed) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS never fires that event, so detect it and offer instructions.
    const isIos =
      /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);

    if (isIos && isSafari) {
      // Give the app a moment before asking for anything.
      const t = setTimeout(() => {
        setShowIosHelp(true);
        setVisible(true);
      }, 4000);
      return () => {
        clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", onPrompt);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Nothing to do; it will offer again next time.
    }
  }

  async function install() {
    if (!event) return;
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") {
      toast.success("Added to your home screen");
    }
    dismiss();
  }

  if (!visible) return null;

  return (
    <div
      className={cn(
        "pb-safe fixed inset-x-0 bottom-[calc(66px+env(safe-area-inset-bottom,0px))] z-40",
        "mx-auto max-w-[640px] px-3",
        "animate-in slide-in-from-bottom-4 fade-in duration-300",
      )}
      role="complementary"
      aria-label="Install this app"
    >
      <div className="rounded-xl border border-line bg-surface p-3.5 shadow-[var(--shadow-raised)]">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-semibold text-ink">
              Put this on your home screen
            </p>
            {showIosHelp ? (
              <p className="mt-1 flex flex-wrap items-center gap-x-1 text-[13px] leading-relaxed text-ink-muted">
                Tap
                <Share className="inline size-4 shrink-0 text-accent" aria-label="the Share button" />
                then
                <SquarePlus className="inline size-4 shrink-0 text-accent" aria-hidden="true" />
                <span className="font-medium text-ink">Add to Home Screen</span>.
              </p>
            ) : (
              <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
                Opens full screen, straight to search — no browser bar in the way.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={dismiss}
            aria-label="Not now"
            className="-mr-1 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-subtle active:bg-surface-2"
          >
            <X className="size-4" />
          </button>
        </div>

        {!showIosHelp && (
          <Button size="md" block className="mt-3" onClick={() => void install()}>
            Add to home screen
          </Button>
        )}
      </div>
    </div>
  );
}
