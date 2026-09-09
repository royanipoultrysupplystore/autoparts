import Link from "next/link";
import {
  ChevronRight,
  LogOut,
  Receipt,
  Users,
  Wallet,
  Wrench,
  Store,
} from "lucide-react";
import { getCurrentProfile, hasFinanceAccess } from "@/lib/supabase/server";
import { AppHeader } from "@/components/nav/app-header";
import { Card, SectionHeading } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/theme-toggle";
import { generatedPartCount, PART_CATALOG_SEED } from "@/lib/part-catalog-seed";

export const dynamic = "force-dynamic";

const ROLE_LABEL = {
  owner: "Owner",
  partner: "Partner",
  staff: "Staff",
} as const;

function Row({
  href,
  icon: Icon,
  label,
  note,
}: {
  href: string;
  icon: typeof Wallet;
  label: string;
  note?: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 px-3.5 py-3 active:bg-surface-2">
      <Icon className="size-5 shrink-0 text-ink-muted" />
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] text-ink">{label}</span>
        {note && <span className="block text-[12.5px] text-ink-subtle">{note}</span>}
      </span>
      <ChevronRight className="size-4 shrink-0 text-ink-subtle" />
    </Link>
  );
}

export default async function MorePage() {
  const profile = await getCurrentProfile();
  const finance = hasFinanceAccess(profile);
  const storefrontEnabled = process.env.NEXT_PUBLIC_ENABLE_STOREFRONT === "true";

  return (
    <>
      <AppHeader title="More" />

      <div className="space-y-5 px-3 py-4">
        <Card className="p-4">
          <p className="text-[16px] font-semibold text-ink">{profile?.full_name}</p>
          <p className="mt-0.5 text-[13px] text-ink-muted">
            {profile ? ROLE_LABEL[profile.role] : ""}
            {profile?.phone ? ` · ${profile.phone}` : ""}
          </p>
          {!finance && (
            <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] leading-relaxed text-ink-muted">
              Your account can search, sell, and edit parts. Vehicle costs and
              profit reports are limited to owners and partners.
            </p>
          )}
        </Card>

        {finance && (
          <section className="space-y-2">
            <SectionHeading>Money</SectionHeading>
            <Card className="divide-y divide-line overflow-hidden">
              <Row href="/expenses" icon={Receipt} label="Expenses" note="Rent, towing, tools, fuel" />
              <Row href="/reports" icon={Wallet} label="Reports" note="Vehicle P&L and monthly" />
            </Card>
          </section>
        )}

        <section className="space-y-2">
          <SectionHeading>Yard</SectionHeading>
          <Card className="divide-y divide-line overflow-hidden">
            <Row
              href="/catalog"
              icon={Wrench}
              label="Parts catalog"
              note={`${PART_CATALOG_SEED.length} entries · ${generatedPartCount()} parts per vehicle`}
            />
            {finance && (
              <Row href="/team" icon={Users} label="Team" note="Who can sign in" />
            )}
            {storefrontEnabled && (
              <Row href="/shop" icon={Store} label="Public storefront" note="What buyers see" />
            )}
          </Card>
        </section>

        <section className="space-y-2">
          <SectionHeading>Preferences</SectionHeading>
          <Card className="overflow-hidden">
            <ThemeToggle />
          </Card>
        </section>

        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="tap flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-[14.5px] font-medium text-danger active:bg-surface-2"
          >
            <LogOut className="size-[18px]" />
            Sign out
          </button>
        </form>

        <p className="pb-2 text-center text-[11.5px] text-ink-subtle">
          Mahmood Shah Auto Recycler · Vancouver, BC · all prices CAD
        </p>
      </div>
    </>
  );
}
