import "server-only";
import {
  createSupabaseServer,
  getCurrentProfile,
  hasFinanceAccess,
} from "@/lib/supabase/server";
import type { UserRole } from "@/types/db";

/**
 * What each partner has put into the business.
 *
 * Owner only, like every other money read: this returns null for anyone
 * else, and the database returns no rows to them regardless. Totals and
 * shares are worked out here from the contribution rows rather than
 * stored, so they can never disagree with the entries underneath them.
 */

export type PartnerStake = {
  id: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  total_cents: number;
  /** Share of everything put in, 0-100, to one decimal. */
  share_pct: number;
  entries: number;
};

export type Contribution = {
  id: string;
  partner_id: string;
  partner_name: string;
  amount_cents: number;
  contributed_on: string;
  note: string | null;
};

export type Investment = {
  total_cents: number;
  partners: PartnerStake[];
  contributions: Contribution[];
};

export async function getInvestment(): Promise<Investment | null> {
  const profile = await getCurrentProfile();
  if (!hasFinanceAccess(profile)) return null;

  const supabase = await createSupabaseServer();

  const [{ data: rows, error }, { data: people }] = await Promise.all([
    supabase
      .from("capital_contributions")
      .select("id, partner_id, amount_cents, contributed_on, note")
      .order("contributed_on", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, role, is_active").order("full_name"),
  ]);

  if (error) throw new Error(error.message);

  const entries = (rows ?? []) as Omit<Contribution, "partner_name">[];
  const members = (people ?? []) as {
    id: string;
    full_name: string;
    role: UserRole;
    is_active: boolean;
  }[];

  const total_cents = entries.reduce((n, e) => n + e.amount_cents, 0);

  const byPartner = new Map<string, { total: number; count: number }>();
  for (const e of entries) {
    const found = byPartner.get(e.partner_id) ?? { total: 0, count: 0 };
    found.total += e.amount_cents;
    found.count += 1;
    byPartner.set(e.partner_id, found);
  }

  // Everyone who can sign in is listed, at zero if they have put nothing
  // in yet; someone switched off is listed only if they did put money in.
  const partners: PartnerStake[] = members
    .filter((m) => m.is_active || byPartner.has(m.id))
    .map((m) => {
      const mine = byPartner.get(m.id) ?? { total: 0, count: 0 };
      return {
        id: m.id,
        name: m.full_name,
        role: m.role,
        is_active: m.is_active,
        total_cents: mine.total,
        // Integer cents in, one decimal of percent out -- the share is a
        // display figure, not money, so it is never summed back up.
        share_pct: total_cents > 0 ? Math.round((mine.total * 1000) / total_cents) / 10 : 0,
        entries: mine.count,
      };
    })
    .sort((a, b) => b.total_cents - a.total_cents || a.name.localeCompare(b.name));

  const names = new Map(members.map((m) => [m.id, m.full_name]));

  return {
    total_cents,
    partners,
    contributions: entries.map((e) => ({
      ...e,
      partner_name: names.get(e.partner_id) ?? "Someone",
    })),
  };
}
