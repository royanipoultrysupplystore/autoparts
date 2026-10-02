"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServer, getCurrentProfile, hasFinanceAccess } from "@/lib/supabase/server";
import { parseMoneyToCents } from "@/lib/money";

export type ContributionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

/**
 * Recording what a partner put in. Owner only -- and the RLS policy on
 * the table refuses anyone else independently.
 *
 * The activity log is read by every member, so it is told that a
 * contribution was recorded and by whom, never how much. The amount
 * lives only in the owner-only table.
 */
export async function addContribution(
  _prev: ContributionState,
  formData: FormData,
): Promise<ContributionState> {
  const profile = await getCurrentProfile();
  if (!hasFinanceAccess(profile)) {
    return { ok: false, error: "Only the owner can record investment." };
  }

  const cents = parseMoneyToCents(String(formData.get("amount") ?? ""));
  if (cents === null || cents <= 0) {
    return { ok: false, fieldErrors: { amount: "Enter an amount over zero." } };
  }

  const partnerId = String(formData.get("partner_id") ?? "").trim();
  if (!partnerId) {
    return { ok: false, fieldErrors: { partner_id: "Who put the money in?" } };
  }

  const contributedOn = String(formData.get("contributed_on") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  const supabase = await createSupabaseServer();

  const { data: partner } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", partnerId)
    .maybeSingle();

  if (!partner) return { ok: false, fieldErrors: { partner_id: "That person is not on the team." } };

  const { data, error } = await supabase
    .from("capital_contributions")
    .insert({
      partner_id: partnerId,
      amount_cents: cents,
      contributed_on: contributedOn || undefined,
      note: note || null,
      created_by: profile!.id,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  await supabase.rpc("log_activity", {
    p_entity_type: "contribution",
    p_entity_id: data.id,
    p_action: "contribution_added",
    p_summary: `Recorded an investment from ${partner.full_name}`,
    p_before: null,
    p_after: { partner_id: partnerId },
  });

  revalidatePath("/investment");
  return { ok: true };
}

/** Destructive: confirmed in the UI, logged here before the row goes. */
export async function deleteContribution(id: string): Promise<ContributionState> {
  const profile = await getCurrentProfile();
  if (!hasFinanceAccess(profile)) {
    return { ok: false, error: "Only the owner can change investment records." };
  }

  const supabase = await createSupabaseServer();

  const { data: row } = await supabase
    .from("capital_contributions")
    .select("partner_id, profiles:partner_id (full_name)")
    .eq("id", id)
    .maybeSingle();

  if (!row) return { ok: false, error: "That entry is already gone." };

  const name =
    (row as unknown as { profiles: { full_name: string } | null }).profiles?.full_name ??
    "a partner";

  await supabase.rpc("log_activity", {
    p_entity_type: "contribution",
    p_entity_id: id,
    p_action: "contribution_deleted",
    p_summary: `Removed an investment entry for ${name}`,
    p_before: { partner_id: row.partner_id },
    p_after: null,
  });

  const { error } = await supabase.from("capital_contributions").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/investment");
  return { ok: true };
}
