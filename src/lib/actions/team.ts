"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServer, getCurrentProfile } from "@/lib/supabase/server";
import type { UserRole } from "@/types/db";

/**
 * Team management.
 *
 * Every one of these calls a SECURITY DEFINER function that re-checks the
 * caller is the owner. The guard here only avoids a round trip; the
 * database is what actually refuses.
 */

export type TeamResult = { ok: true } | { ok: false; error: string };

const REASONS: Record<string, string> = {
  invalid_email: "That does not look like an email address.",
  weak_password: "The temporary password needs at least 8 characters.",
  email_taken: "Someone already has an account with that email.",
  not_found: "That account no longer exists.",
  cannot_demote_self:
    "You cannot change your own role. Somebody has to stay owner, or nobody can manage the team.",
  cannot_disable_self: "You cannot switch off your own account.",
};

function describe(reason?: string): string {
  return (reason && REASONS[reason]) || "That did not work.";
}

async function assertOwner(): Promise<string | null> {
  const profile = await getCurrentProfile();
  if (!profile?.is_active || profile.role !== "owner") {
    return "Only the owner can manage the team.";
  }
  return null;
}

export async function addTeamMember(input: {
  email: string;
  fullName: string;
  role: UserRole;
  password: string;
  phone?: string;
}): Promise<TeamResult> {
  const denied = await assertOwner();
  if (denied) return { ok: false, error: denied };

  if (!input.fullName.trim()) return { ok: false, error: "Give them a name." };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("create_team_member", {
    p_email: input.email,
    p_full_name: input.fullName.trim(),
    p_role: input.role,
    p_password: input.password,
    p_phone: input.phone?.trim() || null,
  });

  if (error) return { ok: false, error: error.message };

  const result = data as { ok: boolean; reason?: string };
  if (!result.ok) return { ok: false, error: describe(result.reason) };

  revalidatePath("/team");
  return { ok: true };
}

export async function changeMemberRole(
  userId: string,
  role: UserRole,
): Promise<TeamResult> {
  const denied = await assertOwner();
  if (denied) return { ok: false, error: denied };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("set_member_role", {
    p_user_id: userId,
    p_role: role,
  });

  if (error) return { ok: false, error: error.message };

  const result = data as { ok: boolean; reason?: string };
  if (!result.ok) return { ok: false, error: describe(result.reason) };

  revalidatePath("/team");
  return { ok: true };
}

export async function setMemberActive(
  userId: string,
  active: boolean,
): Promise<TeamResult> {
  const denied = await assertOwner();
  if (denied) return { ok: false, error: denied };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("set_member_active", {
    p_user_id: userId,
    p_active: active,
  });

  if (error) return { ok: false, error: error.message };

  const result = data as { ok: boolean; reason?: string };
  if (!result.ok) return { ok: false, error: describe(result.reason) };

  revalidatePath("/team");
  return { ok: true };
}

export async function resetMemberPassword(
  userId: string,
  password: string,
): Promise<TeamResult> {
  const denied = await assertOwner();
  if (denied) return { ok: false, error: denied };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("set_member_password", {
    p_user_id: userId,
    p_password: password,
  });

  if (error) return { ok: false, error: error.message };

  const result = data as { ok: boolean; reason?: string };
  if (!result.ok) return { ok: false, error: describe(result.reason) };

  revalidatePath("/team");
  return { ok: true };
}
