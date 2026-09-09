import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, Phone, Search as SearchIcon } from "lucide-react";
import {
  STOREFRONT_ENABLED,
  getPublicVehicleFacets,
  searchPublicParts,
} from "@/lib/data/public-shop";
import { PartIcon, categoryColour } from "@/lib/icons/part-icons";
import { ConditionBadge } from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/primitives";
import { Logo } from "@/components/brand";
import { formatMoney } from "@/lib/money";
import { CONDITION_LABELS, SIDE_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Used auto parts · Vancouver, BC",
  description:
    "Tested used parts pulled from write-off vehicles in Vancouver. Search by part or by car, then get in touch.",
};

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  // The flag is checked here, not in middleware, so the route simply does
  // not exist until the partners are ready to face the public.
  if (!STOREFRONT_ENABLED) notFound();

  const params = await searchParams;
  const query = params.q ?? "";
  const page = Math.max(0, Number(params.page) || 0);

  const [{ parts, total }, facets] = await Promise.all([
    searchPublicParts(query, page),
    getPublicVehicleFacets(),
  ]);

  const phone = process.env.NEXT_PUBLIC_SHOP_CONTACT_PHONE;
  const email = process.env.NEXT_PUBLIC_SHOP_CONTACT_EMAIL;

  return (
    <div className="min-h-dvh">
      {/* ------------------------------------------------------ Header */}
      <header className="border-b border-line bg-surface">
        <div className="mx-auto max-w-[1100px] px-4 py-5">
          <div className="flex items-center gap-3">
            <Logo size={36} />
            <div>
              <p className="text-[17px] font-semibold leading-tight text-ink">
                Mahmood Shah Auto Recycler
              </p>
              <p className="text-[13px] text-ink-muted">
                Used auto parts · Vancouver, BC
              </p>
            </div>
          </div>

          {/* Search, GET form: works with no JavaScript at all. */}
          <form action="/shop" method="get" className="mt-5">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-subtle" />
              <input
                type="search"
                name="q"
                defaultValue={query}
                placeholder="civic mirror, front bumper, alternator…"
                aria-label="Search parts"
                enterKeyHint="search"
                className="h-[52px] w-full rounded-xl border border-line-strong bg-bg pl-11 pr-28 text-[16px] text-ink placeholder:text-ink-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
              />
              <button
                type="submit"
                className="absolute right-2 top-2 h-9 rounded-lg bg-accent px-4 text-[14px] font-medium text-accent-text"
              >
                Search
              </button>
            </div>
          </form>

          {facets.length > 0 && (
            <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
              {facets.map((f) => (
                <Link
                  key={f.label}
                  href={`/shop?q=${encodeURIComponent(f.query)}`}
                  className="shrink-0 rounded-full border border-line-strong bg-bg px-3.5 py-2 text-[13px] font-medium text-ink-muted"
                >
                  {f.label}
                  <span className="tnum ml-1.5 text-ink-subtle">{f.count}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* ------------------------------------------------------ Results */}
      <main className="mx-auto max-w-[1100px] px-4 py-6">
        {query && (
          <p className="tnum mb-4 text-[13.5px] text-ink-muted">
            {total} {total === 1 ? "part" : "parts"} for &ldquo;{query}&rdquo;
          </p>
        )}

        {parts.length === 0 ? (
          <EmptyState
            icon={<SearchIcon className="size-7" />}
            title={query ? `Nothing listed for “${query}”` : "Nothing listed yet"}
            body={
              query
                ? "We part out cars every week, so it is worth asking — a lot of stock is on the shelf before it is listed."
                : "Parts are being added. Get in touch and tell us what you are after."
            }
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {parts.map((p) => {
              const colour = categoryColour(p.category);
              const side = SIDE_LABELS[p.side];

              return (
                <li key={p.id}>
                  <article className="flex h-full flex-col rounded-xl border border-line bg-surface p-4">
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "flex size-12 shrink-0 items-center justify-center rounded-lg",
                          colour.bg,
                          colour.fg,
                        )}
                      >
                        <PartIcon iconKey={p.icon_key} category={p.category} size={26} />
                      </span>

                      <div className="min-w-0 flex-1">
                        <h2 className="text-[16px] font-semibold leading-snug text-ink">
                          {p.name}
                          {side && (
                            <span className="font-normal text-ink-muted"> · {side}</span>
                          )}
                        </h2>
                        <p className="mt-0.5 text-[13.5px] text-ink-muted">
                          {p.year} {p.make} {p.model}
                          {p.trim ? ` ${p.trim}` : ""}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <ConditionBadge condition={p.condition} />
                      <span className="text-[12.5px] text-ink-muted">
                        {CONDITION_LABELS[p.condition]}
                      </span>
                      {p.exterior_colour && (
                        <span className="text-[12.5px] text-ink-subtle">
                          · {p.exterior_colour}
                        </span>
                      )}
                    </div>

                    {/* Price is never hidden. No cart: contact to buy. */}
                    <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                      <span className="tnum text-[20px] font-semibold text-ink">
                        {formatMoney(p.public_price_cents)}
                      </span>
                      {phone && (
                        <a
                          href={`tel:${phone}`}
                          className="rounded-lg bg-accent px-3.5 py-2.5 text-[13.5px] font-medium text-accent-text"
                        >
                          Ask about this
                        </a>
                      )}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}

        {/* Pagination as plain links, so crawlers and no-JS both work. */}
        {total > 48 && (
          <nav className="mt-6 flex items-center justify-between" aria-label="Pages">
            {page > 0 ? (
              <Link
                href={`/shop?q=${encodeURIComponent(query)}&page=${page - 1}`}
                className="rounded-lg border border-line-strong bg-surface px-4 py-2.5 text-[14px] font-medium text-ink"
              >
                Previous
              </Link>
            ) : (
              <span />
            )}
            <span className="tnum text-[13px] text-ink-subtle">
              Page {page + 1} of {Math.ceil(total / 48)}
            </span>
            {(page + 1) * 48 < total ? (
              <Link
                href={`/shop?q=${encodeURIComponent(query)}&page=${page + 1}`}
                className="rounded-lg border border-line-strong bg-surface px-4 py-2.5 text-[14px] font-medium text-ink"
              >
                Next
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </main>

      {/* ------------------------------------------------------ Contact */}
      <footer className="mt-8 border-t border-line bg-surface">
        <div className="mx-auto max-w-[1100px] px-4 py-8">
          <h2 className="text-[16px] font-semibold text-ink">Getting a part</h2>
          <p className="mt-1.5 max-w-[60ch] text-[14px] leading-relaxed text-ink-muted">
            There is no online checkout. Call or message about the part you need
            and we will confirm it is still on the shelf before you drive over.
            Everything is pulled from write-off vehicles and sold as-is, in the
            condition shown.
          </p>

          <div className="mt-4 flex flex-wrap gap-2.5">
            {phone && (
              <a
                href={`tel:${phone}`}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-3 text-[14.5px] font-medium text-accent-text"
              >
                <Phone className="size-[18px]" />
                {phone}
              </a>
            )}
            {email && (
              <a
                href={`mailto:${email}`}
                className="inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 py-3 text-[14.5px] font-medium text-ink"
              >
                <Mail className="size-[18px]" />
                {email}
              </a>
            )}
          </div>

          <p className="mt-6 text-[12px] text-ink-subtle">
            Mahmood Shah Auto Recycler · Vancouver, British Columbia · all prices
            in Canadian dollars
          </p>
        </div>
      </footer>
    </div>
  );
}
