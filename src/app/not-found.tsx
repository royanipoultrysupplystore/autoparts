import Link from "next/link";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo size={40} />

      <h1 className="mt-6 text-[19px] font-semibold text-ink">
        That page isn&apos;t here
      </h1>
      <p className="mt-2 max-w-[34ch] text-[14px] leading-relaxed text-ink-muted">
        The vehicle or part may have been deleted, or the link is wrong.
        Searching is usually faster than hunting for it.
      </p>

      <div className="mt-6 flex w-full max-w-[300px] flex-col gap-2.5">
        <Button asChild size="lg" block>
          <Link href="/search">Search for a part</Link>
        </Button>
        <Button asChild variant="secondary" size="lg" block>
          <Link href="/vehicles">See every vehicle</Link>
        </Button>
      </div>
    </main>
  );
}
