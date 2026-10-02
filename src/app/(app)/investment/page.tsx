import { redirect } from "next/navigation";
import { HandCoins } from "lucide-react";
import { getCurrentProfile, hasFinanceAccess } from "@/lib/supabase/server";
import { getInvestment } from "@/lib/data/investment";
import { AppHeader } from "@/components/nav/app-header";
import { Card, EmptyState, SectionHeading, Stat } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { ContributionForm } from "./contribution-form";
import { ContributionRow } from "./contribution-row";
import type { Contribution } from "@/lib/data/investment";

export const dynamic = "force-dynamic";

export const metadata = { title: "Investment" };

export default async function InvestmentPage() {
  const profile = await getCurrentProfile();
  if (!hasFinanceAccess(profile)) redirect("/");

  const investment = await getInvestment();
  if (!investment) redirect("/");

  const { total_cents, partners, contributions } = investment;
  const contributors = partners.filter((p) => p.total_cents > 0).length;

  const people = partners
    .filter((p) => p.is_active)
    .map((p) => ({ id: p.id, label: p.name }));

  const groups: [string, Contribution[]][] = [];
  for (const c of contributions) {
    const last = groups[groups.length - 1];
    if (last && last[0] === c.contributed_on) last[1].push(c);
    else groups.push([c.contributed_on, [c]]);
  }

  return (
    <>
      <AppHeader
        title="Investment"
        subtitle="What each partner has put in"
        back={{ href: "/more" }}
        action={<ContributionForm partners={people} />}
      />

      <div className="space-y-5 px-3 py-4">
        <div className="grid grid-cols-2 gap-2.5">
          <Stat
            label="Total invested"
            value={formatMoney(total_cents)}
            sub={`${contributions.length} entr${contributions.length === 1 ? "y" : "ies"}`}
          />
          <Stat
            label="Partners in"
            value={String(contributors)}
            sub={`of ${partners.length} on the team`}
            tone="muted"
          />
        </div>

        <section className="space-y-2">
          <SectionHeading>Each partner</SectionHeading>
          <Card className="divide-y divide-line overflow-hidden">
            {partners.map((p) => (
              <div key={p.id} className="px-3.5 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[15px] font-medium text-ink">
                    {p.name}
                    {!p.is_active && (
                      <span className="ml-1.5 text-[12.5px] font-normal text-ink-subtle">
                        (switched off)
                      </span>
                    )}
                  </span>
                  <span className="tnum shrink-0 text-[15px] font-semibold text-ink">
                    {formatMoney(p.total_cents)}
                  </span>
                </div>

                <div className="mt-2 flex items-center gap-3">
                  <div
                    className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"
                    role="img"
                    aria-label={`${p.share_pct}% of the total`}
                  >
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${p.share_pct}%` }}
                    />
                  </div>
                  <span className="tnum w-14 shrink-0 text-right text-[13px] font-semibold text-accent">
                    {p.share_pct.toFixed(1)}%
                  </span>
                </div>

                <p className="mt-1 text-[12.5px] text-ink-subtle">
                  {p.entries === 0
                    ? "Nothing recorded yet"
                    : `${p.entries} entr${p.entries === 1 ? "y" : "ies"}`}
                </p>
              </div>
            ))}
          </Card>
          <p className="px-1 text-[12.5px] leading-relaxed text-ink-subtle">
            Share is each partner&apos;s part of everything put in so far. It changes
            as new money is recorded.
          </p>
        </section>

        {contributions.length === 0 ? (
          <EmptyState
            icon={<HandCoins className="size-7" />}
            title="No investment recorded yet"
            body="Tap Add each time a partner puts money into the business — the auction money for a car, the rent, a tool. Totals and shares are worked out from those entries."
          />
        ) : (
          <section className="space-y-4">
            <SectionHeading>History</SectionHeading>
            {groups.map(([date, items]) => (
              <div key={date} className="space-y-2">
                <SectionHeading
                  action={
                    <span className="tnum text-[13px] text-ink-muted">
                      {formatMoney(items.reduce((n, c) => n + c.amount_cents, 0))}
                    </span>
                  }
                >
                  {formatDate(date)}
                </SectionHeading>
                <Card className="divide-y divide-line overflow-hidden">
                  {items.map((c) => (
                    <ContributionRow
                      key={c.id}
                      id={c.id}
                      partner={c.partner_name}
                      amount={formatMoney(c.amount_cents)}
                      note={c.note}
                    />
                  ))}
                </Card>
              </div>
            ))}
          </section>
        )}
      </div>
    </>
  );
}
