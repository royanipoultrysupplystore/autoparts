"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search as SearchIcon, X } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { Card, EmptyState, SkeletonRows } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { PartSheet, type SheetPart } from "@/components/parts/part-sheet";
import { ResultRow } from "./result-row";
import { EMPTY_FILTERS, FilterSheet, countActiveFilters, type Filters } from "./filter-sheet";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";
import type { PartStatus, SearchResult } from "@/types/db";

/** The subset of a parts row that a realtime UPDATE hands back. */
type PartsRealtimeRow = {
  id: string;
  status: PartStatus;
  asking_price_cents: number;
  reserved_for_name: string | null;
  reserved_until: string | null;
};

const PAGE_SIZE = 50;
const DEBOUNCE_MS = 180;

/**
 * The screen that matters most.
 *
 * Searching runs straight from the browser against the `search_parts`
 * RPC -- no Next round trip -- so results land while the partner is still
 * mid-sentence with the customer. Realtime keeps the list honest: when
 * somebody else sells a part you are looking at, the row greys out under
 * your finger instead of letting you promise it twice.
 */
export function SearchScreen({
  options,
  initialQuery,
}: {
  options: { makes: string[]; models: string[]; categories: string[] };
  initialQuery: string;
}) {
  const supabase = useMemo(() => getSupabaseBrowser(), []);

  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState<Set<string>>(new Set());

  const [openPart, setOpenPart] = useState<SheetPart | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  // Guards against a slow early request landing after a faster later one.
  const requestId = useRef(0);

  const runSearch = useCallback(
    async (q: string, f: Filters, offset: number) => {
      const id = ++requestId.current;
      if (offset === 0) setLoading(true);
      else setLoadingMore(true);

      const { data, error } = await supabase.rpc("search_parts", {
        p_query: q.trim(),
        p_makes: f.makes.length ? f.makes : null,
        p_models: f.models.length ? f.models : null,
        p_year_min: f.yearMin ? Number(f.yearMin) : null,
        p_year_max: f.yearMax ? Number(f.yearMax) : null,
        p_conditions: f.conditions.length ? f.conditions : null,
        p_categories: f.categories.length ? f.categories : null,
        p_statuses: f.statuses,
        p_limit: PAGE_SIZE,
        p_offset: offset,
      });

      // A stale response must never overwrite a fresher one.
      if (id !== requestId.current) return;

      if (error) {
        setError(error.message);
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      const rows = (data ?? []) as SearchResult[];
      setError(null);
      setTotal(rows[0]?.total_count ?? (offset === 0 ? 0 : total));
      setResults((prev) => (offset === 0 ? rows : [...prev, ...rows]));
      setLoading(false);
      setLoadingMore(false);
    },
    [supabase, total],
  );

  // Debounced search on every keystroke and filter change.
  useEffect(() => {
    const t = setTimeout(() => void runSearch(query, filters, 0), DEBOUNCE_MS);
    return () => clearTimeout(t);
    // runSearch is intentionally omitted: it closes over `total`, and
    // re-running on every count change would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filters]);

  // ------------------------------------------------------------------
  // Realtime. A status change on another phone lands here.
  // ------------------------------------------------------------------
  useEffect(() => {
    const channel = supabase
      .channel("parts-live")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "parts" },
        (payload: { new: PartsRealtimeRow }) => {
          const next = payload.new;

          setResults((rows) => {
            const i = rows.findIndex((r) => r.id === next.id);
            if (i === -1) return rows;

            const before = rows[i];
            if (
              before.status === next.status &&
              before.asking_price_cents === next.asking_price_cents
            ) {
              return rows;
            }

            // Tell the partner what just moved under them. Their own
            // actions never reach here: the optimistic update has already
            // set the same status, so the early return above catches it.
            if (before.status !== next.status && next.status === "sold") {
              toast(`${before.name} just sold`, {
                description: "Someone else recorded it. The list is up to date.",
              });
            }

            setChanged((c) => new Set(c).add(next.id));
            setTimeout(
              () =>
                setChanged((c) => {
                  const s = new Set(c);
                  s.delete(next.id);
                  return s;
                }),
              2200,
            );

            const copy = [...rows];
            copy[i] = {
              ...before,
              status: next.status,
              asking_price_cents: next.asking_price_cents,
              reserved_for_name: next.reserved_for_name,
              reserved_until: next.reserved_until,
            };
            return copy;
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase]);

  function openSheet(result: SearchResult) {
    setOpenPart({
      id: result.id,
      name: result.name,
      category: result.category,
      icon_key: result.icon_key,
      side: result.side,
      condition: result.condition,
      status: result.status,
      asking_price_cents: result.asking_price_cents,
      shelf_location: result.shelf_location,
      reserved_for_name: result.reserved_for_name,
      reserved_until: result.reserved_until,
      vehicle_id: result.vehicle_id,
      stock_number: result.stock_number,
      year: result.year,
      make: result.make,
      model: result.model,
      trim: result.trim,
    });
    setSheetOpen(true);
  }

  /** Optimistic local flip, so the row changes before the server answers. */
  function applyLocalStatus(partId: string, status: PartStatus) {
    setResults((rows) =>
      rows.map((r) => (r.id === partId ? { ...r, status } : r)),
    );
    setOpenPart((p) => (p && p.id === partId ? { ...p, status } : p));
  }

  const activeFilters = countActiveFilters(filters);
  const showingAvailableOnly =
    filters.statuses.length === 1 && filters.statuses[0] === "available";

  return (
    <>
      {/* ------------------------------------------------ Search bar */}
      <div className="pt-safe sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur-md">
        <div className="px-3 pb-2 pt-2.5">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-subtle" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              // Autofocused: this screen is opened mid-conversation.
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="search"
              placeholder="civic mirror, front bumper…"
              aria-label="Search every part in the yard"
              className={cn(
                "h-[52px] w-full rounded-xl border border-line-strong bg-surface pl-11 pr-11",
                "text-[17px] text-ink placeholder:text-ink-subtle",
                "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25",
                "[&::-webkit-search-cancel-button]:hidden",
              )}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-ink-subtle active:bg-surface-2"
              >
                <X className="size-5" />
              </button>
            )}
          </div>
        </div>

        {/* Filter row. The available-only toggle is right here, not buried. */}
        <div className="no-scrollbar flex items-center gap-2 overflow-x-auto px-3 pb-2.5">
          <FilterSheet filters={filters} onApply={setFilters} options={options} />

          <button
            type="button"
            onClick={() =>
              setFilters((f) => ({
                ...f,
                statuses: showingAvailableOnly
                  ? ["available", "reserved", "sold"]
                  : ["available"],
              }))
            }
            className={cn(
              "tap shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
              showingAvailableOnly
                ? "border-accent bg-accent text-accent-text"
                : "border-line-strong bg-surface text-ink-muted active:bg-surface-2",
            )}
          >
            {showingAvailableOnly ? "Available only" : "Including sold"}
          </button>

          {activeFilters > 0 && (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="tap shrink-0 rounded-full px-3 text-[13px] font-medium text-ink-muted"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ------------------------------------------------- Results */}
      <div className="px-3 py-3">
        {!loading && !error && results.length > 0 && (
          <p className="tnum mb-2 px-1 text-[12.5px] text-ink-subtle">
            {total} {total === 1 ? "part" : "parts"}
            {showingAvailableOnly ? " on the shelf" : ""}
          </p>
        )}

        {loading ? (
          <SkeletonRows count={7} />
        ) : error ? (
          <Card className="p-4">
            <p className="text-[14px] font-medium text-danger">Search is not responding</p>
            <p className="mt-1 text-[13px] text-ink-muted">{error}</p>
            <Button
              className="mt-3"
              variant="secondary"
              size="sm"
              onClick={() => void runSearch(query, filters, 0)}
            >
              Try again
            </Button>
          </Card>
        ) : results.length === 0 ? (
          query.trim() ? (
            <EmptyState
              icon={<SearchIcon className="size-7" />}
              title={`Nothing on the shelf for “${query.trim()}”`}
              body={
                showingAvailableOnly
                  ? "It may have already sold. Turn on sold parts to check, or try fewer words — searching “bumper” finds more than “front bumper cover 2016”."
                  : "Try fewer words. Searching “bumper” finds more than “front bumper cover 2016”."
              }
              action={
                showingAvailableOnly
                  ? {
                      label: "Include sold parts",
                      onClick: () =>
                        setFilters((f) => ({
                          ...f,
                          statuses: ["available", "reserved", "sold"],
                        })),
                    }
                  : { label: "Clear the search", onClick: () => setQuery("") }
              }
            />
          ) : activeFilters > 0 ? (
            <EmptyState
              icon={<SearchIcon className="size-7" />}
              title="No parts match those filters"
              body="Loosen one of them, or clear them all and start from the search box."
              action={{ label: "Clear filters", onClick: () => setFilters(EMPTY_FILTERS) }}
            />
          ) : (
            <EmptyState
              icon={<SearchIcon className="size-7" />}
              title="Nothing in the yard yet"
              body="Once a vehicle is added and its parts list is trimmed, everything on the shelf shows up here."
              action={{ label: "Add a vehicle", href: "/vehicles/new" }}
            />
          )
        ) : (
          <>
            <Card className="divide-y divide-line overflow-hidden">
              {results.map((r) => (
                <ResultRow
                  key={r.id}
                  result={r}
                  onOpen={openSheet}
                  justChanged={changed.has(r.id)}
                />
              ))}
            </Card>

            {results.length < total && (
              <Button
                variant="secondary"
                block
                size="md"
                className="mt-3"
                disabled={loadingMore}
                onClick={() => void runSearch(query, filters, results.length)}
              >
                {loadingMore ? "Loading…" : `Show more (${total - results.length} left)`}
              </Button>
            )}
          </>
        )}
      </div>

      <PartSheet
        part={openPart}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onChanged={applyLocalStatus}
      />

      {/* Keeps the last row clear of the tab bar. */}
      <div className="h-2" />
      <span className="sr-only" aria-live="polite">
        {loading ? "Searching" : `${total} results`}
      </span>
    </>
  );
}
