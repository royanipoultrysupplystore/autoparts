"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CircleAlert, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Error boundary for the app.
 *
 * Says what happened in the language of the yard, offers the one action
 * that usually fixes it, and never shows a stack trace to a partner
 * standing in the rain.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Kept so it lands in the browser console and in Vercel's logs.
    console.error(error);
  }, [error]);

  const isPermission =
    error.message.includes("FORBIDDEN_FINANCE") ||
    error.message.includes("insufficient_privilege") ||
    error.message.includes("restricted to owners and partners");

  const isAuth = error.message.includes("NOT_AUTHENTICATED");

  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <CircleAlert className="size-6" />
      </div>

      {isPermission ? (
        <>
          <h1 className="mt-4 text-[18px] font-semibold text-ink">
            That screen is for owners and partners
          </h1>
          <p className="mt-2 max-w-[34ch] text-[14px] leading-relaxed text-ink-muted">
            Costs and profit reports are limited. You can still search, price,
            and sell every part in the yard.
          </p>
          <Button asChild className="mt-5" size="lg">
            <Link href="/search">Go to search</Link>
          </Button>
        </>
      ) : isAuth ? (
        <>
          <h1 className="mt-4 text-[18px] font-semibold text-ink">
            Your session has expired
          </h1>
          <p className="mt-2 max-w-[34ch] text-[14px] leading-relaxed text-ink-muted">
            Sign in again and you will land back where you were.
          </p>
          <Button asChild className="mt-5" size="lg">
            <a href="/login">Sign in</a>
          </Button>
        </>
      ) : (
        <>
          <h1 className="mt-4 text-[18px] font-semibold text-ink">
            Something went wrong on our end
          </h1>
          <p className="mt-2 max-w-[36ch] text-[14px] leading-relaxed text-ink-muted">
            Nothing you did caused this and nothing was saved. Try again — if it
            keeps happening, check your signal first.
          </p>
          <div className="mt-5 flex w-full max-w-[300px] flex-col gap-2.5">
            <Button size="lg" block onClick={reset}>
              <RefreshCw className="size-[18px]" />
              Try again
            </Button>
            <Button asChild variant="secondary" size="lg" block>
              <Link href="/">Back to the dashboard</Link>
            </Button>
          </div>
          {error.digest && (
            <p className="mt-6 font-mono text-[11px] text-ink-subtle">
              Reference {error.digest}
            </p>
          )}
        </>
      )}
    </main>
  );
}
