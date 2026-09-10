import { Skeleton } from "@/components/ui/primitives";

/**
 * Page-level skeletons.
 *
 * Every screen in this app reads live shared data, so every navigation is
 * a round trip. Next.js will show one of these the instant a link is
 * tapped, which is the difference between "it is working" and "it is
 * broken" -- the wait is the same either way.
 *
 * They mirror the real layout rather than showing a generic spinner, so
 * the page does not jump around when the content lands.
 */

function HeaderSkeleton({ withSub = true }: { withSub?: boolean }) {
  return (
    <div className="pt-safe glass sticky top-0 z-30 border-b">
      <div className="flex items-center gap-2 px-3 py-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-4 w-[45%]" />
          {withSub && <Skeleton className="h-3 w-[28%]" />}
        </div>
      </div>
    </div>
  );
}

/** A vehicle card: title, meta line, progress bar. */
export function VehicleCardSkeleton() {
  return (
    <div className="rounded-xl border border-line bg-surface p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-[55%]" />
          <Skeleton className="h-3 w-[38%]" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <div className="mt-3 flex gap-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
    </div>
  );
}

export function HomeSkeleton() {
  return (
    <>
      <HeaderSkeleton withSub={false} />
      <div className="space-y-4 px-3 py-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-[52px] w-full rounded-xl" />
        <div className="flex items-center justify-between px-1">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3.5 w-20" />
        </div>
        <div className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <VehicleCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </>
  );
}

export function VehicleListSkeleton() {
  return (
    <>
      <HeaderSkeleton />
      <div className="flex gap-2 border-b border-line px-3 py-2.5">
        {[56, 92, 74, 80].map((w, i) => (
          <Skeleton key={i} className="h-9 rounded-full" style={{ width: w }} />
        ))}
      </div>
      <div className="space-y-2.5 px-3 py-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <VehicleCardSkeleton key={i} />
        ))}
      </div>
    </>
  );
}

/** The vehicle detail screen: identity card, money tiles, parts. */
export function VehicleDetailSkeleton() {
  return (
    <>
      <HeaderSkeleton />
      <div className="space-y-5 px-3 py-4">
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <Skeleton className="h-3.5 w-[60%]" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <div className="mt-4 space-y-3 border-t border-line pt-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-3.5 w-28" />
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-[92px] rounded-xl" />
          ))}
        </div>

        <Skeleton className="h-11 w-full rounded-lg" />

        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="mb-1.5 h-3.5 w-36" />
              <div className="overflow-hidden rounded-xl border border-line bg-surface">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div
                    key={j}
                    className="flex items-center gap-2.5 border-b border-line px-3 py-3 last:border-0"
                  >
                    <Skeleton className="size-5 rounded" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-14" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/** A part-result row: icon tile, three lines, price and pill. */
export function ResultRowsSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 border-b border-line px-3 py-3 last:border-0"
        >
          <Skeleton className="size-11 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-[62%]" />
            <Skeleton className="h-3 w-[45%]" />
            <Skeleton className="h-3 w-[52%]" />
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SearchSkeleton() {
  return (
    <>
      <div className="pt-safe glass sticky top-0 z-30 border-b">
        <div className="px-3 pb-2 pt-2.5">
          <Skeleton className="h-[52px] w-full rounded-xl" />
        </div>
        <div className="flex gap-2 px-3 pb-2.5">
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-32 rounded-full" />
        </div>
      </div>
      <div className="px-3 py-3">
        <Skeleton className="mb-2 h-3 w-24" />
        <ResultRowsSkeleton />
      </div>
    </>
  );
}

export function ReportsSkeleton() {
  return (
    <>
      <HeaderSkeleton />
      <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <Skeleton className="size-6 rounded" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="size-6 rounded" />
      </div>
      <div className="space-y-4 px-3 py-4">
        <Skeleton className="h-3.5 w-40" />
        <div className="grid grid-cols-2 gap-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[92px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[210px] w-full rounded-xl" />
        <Skeleton className="h-[150px] w-full rounded-xl" />
      </div>
    </>
  );
}

/** A stack of list rows: expenses, activity, catalog, team. */
export function ListSkeleton({
  rows = 8,
  withHeader = true,
}: {
  rows?: number;
  withHeader?: boolean;
}) {
  return (
    <>
      {withHeader && <HeaderSkeleton />}
      <div className="space-y-4 px-3 py-4">
        <div className="grid grid-cols-2 gap-2.5">
          <Skeleton className="h-[92px] rounded-xl" />
          <Skeleton className="h-[92px] rounded-xl" />
        </div>
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          {Array.from({ length: rows }).map((_, i) => (
            <div
              key={i}
              className="flex items-start gap-3 border-b border-line px-3.5 py-3 last:border-0"
            >
              <Skeleton className="size-8 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3.5 w-[58%]" />
                <Skeleton className="h-3 w-[36%]" />
              </div>
              <Skeleton className="h-4 w-16 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/** A long form: the vehicle add/edit screens. */
export function FormSkeleton() {
  return (
    <>
      <HeaderSkeleton />
      <div className="space-y-5 px-3 py-4">
        {Array.from({ length: 3 }).map((_, s) => (
          <div key={s} className="space-y-2">
            <Skeleton className="h-3.5 w-28" />
            <div className="space-y-4 rounded-xl border border-line bg-surface p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-11 w-full rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        ))}
        <Skeleton className="h-[52px] w-full rounded-lg" />
      </div>
    </>
  );
}
