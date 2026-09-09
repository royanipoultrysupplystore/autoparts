"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServer, getCurrentProfile, hasFinanceAccess } from "@/lib/supabase/server";
import { parseMoneyToCents } from "@/lib/money";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/vehicle-options";
import type { ExpenseCategory, ExpenseScope } from "@/types/db";

export type ExpenseState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

/**
 * Expenses are financial, so every path here is owner/partner only --
 * and the database refuses staff independently, through the RLS policy
 * on the table.
 */
export async function createExpense(
  _prev: ExpenseState,
  formData: FormData,
): Promise<ExpenseState> {
  const profile = await getCurrentProfile();
  if (!hasFinanceAccess(profile)) {
    return { ok: false, error: "Only owners and partners can record expenses." };
  }

  const amountRaw = String(formData.get("amount") ?? "");
  const cents = parseMoneyToCents(amountRaw);

  if (cents === null || cents <= 0) {
    return { ok: false, fieldErrors: { amount: "Enter an amount over zero." } };
  }

  const vehicleId = String(formData.get("vehicle_id") ?? "").trim();
  // Picking a vehicle is what makes an expense vehicle-scoped. The
  // database enforces the pairing too, with a check constraint.
  const scope: ExpenseScope = vehicleId ? "vehicle" : "business";

  const category = String(formData.get("category") ?? "misc") as ExpenseCategory;
  const expenseDate = String(formData.get("expense_date") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const paidBy = String(formData.get("paid_by") ?? "").trim() || profile!.id;
  const receiptUrl = String(formData.get("receipt_url") ?? "").trim();

  const supabase = await createSupabaseServer();

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      scope,
      vehicle_id: scope === "vehicle" ? vehicleId : null,
      category,
      amount_cents: cents,
      expense_date: expenseDate || undefined,
      paid_by: paidBy,
      note: note || null,
      receipt_url: receiptUrl || null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  await supabase.rpc("log_activity", {
    p_entity_type: "expense",
    p_entity_id: data.id,
    p_action: "created",
    p_summary: `Recorded ${EXPENSE_CATEGORY_LABEL[category]} of $${(cents / 100).toFixed(2)}`,
    p_before: null,
    p_after: { amount_cents: cents, category, scope },
  });

  revalidatePath("/expenses");
  revalidatePath("/reports");
  if (scope === "vehicle") revalidatePath(`/vehicles/${vehicleId}`);

  return { ok: true };
}

export async function deleteExpense(id: string): Promise<ExpenseState> {
  const profile = await getCurrentProfile();
  if (!hasFinanceAccess(profile)) {
    return { ok: false, error: "Only owners and partners can delete expenses." };
  }

  const supabase = await createSupabaseServer();

  const { data: expense } = await supabase
    .from("expenses")
    .select("amount_cents, category, vehicle_id, note")
    .eq("id", id)
    .single();

  await supabase.rpc("log_activity", {
    p_entity_type: "expense",
    p_entity_id: id,
    p_action: "deleted",
    p_summary: expense
      ? `Deleted ${EXPENSE_CATEGORY_LABEL[expense.category as ExpenseCategory]} expense of $${(
          expense.amount_cents / 100
        ).toFixed(2)}`
      : "Deleted an expense",
    p_before: expense ?? null,
    p_after: null,
  });

  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/expenses");
  revalidatePath("/reports");
  if (expense?.vehicle_id) revalidatePath(`/vehicles/${expense.vehicle_id}`);

  return { ok: true };
}

/** Signed upload target for a receipt photo. The bucket is private. */
export async function createReceiptUploadUrl(
  filename: string,
): Promise<{ ok: true; path: string; token: string } | { ok: false; error: string }> {
  const profile = await getCurrentProfile();
  if (!hasFinanceAccess(profile)) return { ok: false, error: "Not allowed." };

  const safe = filename.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-60);
  const path = `${profile!.id}/${Date.now()}-${safe}`;

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.storage
    .from("receipts")
    .createSignedUploadUrl(path);

  if (error) return { ok: false, error: error.message };
  return { ok: true, path: data.path, token: data.token };
}
