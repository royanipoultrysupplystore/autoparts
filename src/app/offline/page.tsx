import { WifiOff } from "lucide-react";
import { Logo } from "@/components/brand";

/**
 * The offline screen, precached by the service worker.
 *
 * Deliberately static and dependency-free: it has to render with no
 * network, no session, and no data. It tells the truth -- inventory is
 * shared and live, so there is nothing honest to show while the phone is
 * out of signal -- and gets out of the way.
 */
export const dynamic = "force-static";

export const metadata = { title: "No connection" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo size={44} />

      <div className="mt-6 flex size-14 items-center justify-center rounded-full bg-surface-2 text-ink-muted">
        <WifiOff className="size-7" />
      </div>

      <h1 className="mt-5 text-[19px] font-semibold text-ink">No connection</h1>

      <p className="mt-2 max-w-[34ch] text-[14px] leading-relaxed text-ink-muted">
        The shelf is shared between all four of you, so it only shows live
        numbers. Get a bar of signal and it will load straight away — the app
        itself is already on this phone.
      </p>

      {/*
        A real document navigation, not next/link: a client-side
        transition is precisely what cannot work with no network, and
        "Try again" has to mean "fetch the page again".
      */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/"
        className="tap mt-6 inline-flex items-center justify-center rounded-lg bg-accent px-6 text-[15px] font-medium text-accent-text"
      >
        Try again
      </a>

      <p className="mt-8 text-[12px] text-ink-subtle">
        Mahmood Shah Auto Recycler · Vancouver, BC
      </p>
    </main>
  );
}
