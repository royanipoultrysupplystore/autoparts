import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Mail, Phone } from "lucide-react";
import { STOREFRONT_ENABLED, getPublicPartBySlug } from "@/lib/data/public-shop";
import { PartIcon, categoryColour } from "@/lib/icons/part-icons";
import { ConditionBadge } from "@/components/ui/status-pill";
import { DetailRow } from "@/components/ui/primitives";
import { Logo } from "@/components/brand";
import { formatMoney } from "@/lib/money";
import { CONDITION_LABELS, SIDE_LABELS, partTitle } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * One published part, at a stable SEO slug like
 * /shop/2016-honda-civic-front-bumper-cover-v0147-1
 *
 * The slug is generated when the part is created, so these URLs are
 * correct from day one and never have to change.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!STOREFRONT_ENABLED) return { title: "Not found" };

  const { slug } = await params;
  const part = await getPublicPartBySlug(slug);
  if (!part) return { title: "Part not found" };

  const label = `${part.name} · ${part.year} ${part.make} ${part.model}`;

  return {
    title: label,
    description:
      `Used ${part.name.toLowerCase()} off a ${part.year} ${part.make} ${part.model}, ` +
      `condition ${part.condition}. ${formatMoney(part.public_price_cents)} in Vancouver, BC.`,
    alternates: { canonical: `/shop/${part.slug}` },
    openGraph: { title: label, type: "website" },
  };
}

export default async function PublicPartPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!STOREFRONT_ENABLED) notFound();

  const { slug } = await params;
  const part = await getPublicPartBySlug(slug);
  if (!part) notFound();

  const colour = categoryColour(part.category);
  const side = SIDE_LABELS[part.side];
  const phone = process.env.NEXT_PUBLIC_SHOP_CONTACT_PHONE;
  const email = process.env.NEXT_PUBLIC_SHOP_CONTACT_EMAIL;

  const enquiry = `Hi, is the ${partTitle(part.name, part.side)} off the ${part.year} ${part.make} ${part.model} still available?`;

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[760px] items-center gap-3 px-4 py-4">
          <Link
            href="/shop"
            className="tap flex items-center justify-center rounded-lg text-ink-muted"
            aria-label="Back to all parts"
          >
            <ChevronLeft className="size-6" />
          </Link>
          <Logo size={28} />
          <span className="text-[15px] font-semibold text-ink">
            Mahmood Shah Auto Recycler
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-[760px] px-4 py-6">
        <div className="flex items-start gap-4">
          <span
            className={cn(
              "flex size-20 shrink-0 items-center justify-center rounded-2xl",
              colour.bg,
              colour.fg,
            )}
          >
            <PartIcon iconKey={part.icon_key} category={part.category} size={44} />
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-semibold leading-tight text-ink">
              {part.name}
              {side && <span className="font-normal text-ink-muted"> · {side}</span>}
            </h1>
            <p className="mt-1 text-[15px] text-ink-muted">
              {part.year} {part.make} {part.model}
              {part.trim ? ` ${part.trim}` : ""}
            </p>
            <p className="tnum mt-3 text-[26px] font-semibold text-ink">
              {formatMoney(part.public_price_cents)}
            </p>
          </div>
        </div>

        <dl className="mt-6 divide-y divide-line rounded-xl border border-line bg-surface px-4 py-1">
          <DetailRow
            label="Condition"
            value={
              <span className="inline-flex items-center gap-2">
                <ConditionBadge condition={part.condition} />
                {CONDITION_LABELS[part.condition]}
              </span>
            }
          />
          <DetailRow label="Category" value={part.category} />
          <DetailRow label="Off" value={`${part.year} ${part.make} ${part.model}`} />
          {part.exterior_colour && (
            <DetailRow label="Vehicle colour" value={part.exterior_colour} />
          )}
        </dl>

        <div className="mt-6 rounded-xl border border-line bg-surface p-4">
          <h2 className="text-[15px] font-semibold text-ink">Still available?</h2>
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">
            Parts sell fast and the shelf is shared between four of us. Message
            first and we will confirm before you drive over.
          </p>

          <div className="mt-4 flex flex-wrap gap-2.5">
            {phone && (
              <>
                <a
                  href={`tel:${phone}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-3 text-[14.5px] font-medium text-accent-text"
                >
                  <Phone className="size-[18px]" />
                  Call {phone}
                </a>
                <a
                  href={`sms:${phone}?&body=${encodeURIComponent(enquiry)}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 py-3 text-[14.5px] font-medium text-ink"
                >
                  Text us
                </a>
              </>
            )}
            {email && (
              <a
                href={`mailto:${email}?subject=${encodeURIComponent(
                  `${part.name} — ${part.year} ${part.make} ${part.model}`,
                )}&body=${encodeURIComponent(enquiry)}`}
                className="inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 py-3 text-[14.5px] font-medium text-ink"
              >
                <Mail className="size-[18px]" />
                Email
              </a>
            )}
          </div>
        </div>

        <p className="mt-6 text-[12.5px] leading-relaxed text-ink-subtle">
          Sold as-is in the condition shown. Pulled from a write-off vehicle in
          Vancouver, BC. Prices in Canadian dollars.
        </p>
      </main>
    </div>
  );
}
