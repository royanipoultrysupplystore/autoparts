import { redirect } from "next/navigation";
import { Receipt } from "lucide-react";
import { createSupabaseServer, getCurrentProfile, hasFinanceAccess } from "@/lib/supabase/server";
import { AppHeader } from "@/components/nav/app-header";
import { Card, EmptyState, SectionHeading, Stat } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/money";
import { formatDate, TIMEZONE } from "@/lib/format";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/vehicle-options";
import { ExpenseForm } from "./expense-form";
import { ExpenseRow } from "./expense-row";
import type { ExpenseCategory } from "@/types/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Expenses" };

type ExpenseListRow = {
  id: string;
  scope: "vehicle" | "business";
  vehicle_id: string | null;
  category: ExpenseCategory;
  amount_cents: number;
  expense_date: string;
  note: string | null;
  receipt_url: string | null;
  paid_by: string | null;
};

export default async function ExpensesPage() {
  const profile = await getCurrentProfile();
  if (!hasFinanceAccess(profile)) redirect("/");

  const supabase = await createSupabaseServer();

  const [{ data: expenses }, { data: vehicles }, { data: members }] = await Promise.all([
    supabase
      .from("expenses")
      .select("id, scope, vehicle_id, category, amount_cents, expense_date, note, receipt_url, paid_by")
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("vehicles")
      .select("id, stock_number, year, make, model")
      .in("status", ["incoming", "parting_out"])
      .order("purchase_date", { ascending: false }),
    supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name"),
  ]);

  const rows = (expenses ?? []) as ExpenseListRow[];

  const vehicleOptions = (vehicles ?? []).map(
    (v: { id: string; stock_number: string; year: number; make: string; model: string }) => ({
      id: v.id,
      label: `${v.stock_number} · ${v.year} ${v.make} ${v.model}`,
    }),
  );

  const memberOptions = (members ?? []).map((m: { id: string; full_name: string }) => ({
    id: m.id,
    label: m.full_name,
  }));

  const vehicleLabels = new Map(vehicleOptions.map((v) => [v.id, v.label]));
  const memberLabels = new Map(memberOptions.map((m) => [m.id, m.label]));

  // This calendar month in Vancouver.
  const monthStart = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .replace("-", "-")
    .concat("-01");

  const thisMonth = rows.filter((e) => e.expense_date >= monthStart);
  const monthTotal = thisMonth.reduce((n, e) => n + e.amount_cents, 0);
  const monthOverhead = thisMonth
    .filter((e) => e.scope === "business")
    .reduce((n, e) => n + e.amount_cents, 0);

  // Group by date for the list.
  const groups: [string, ExpenseListRow[]][] = [];
  for (const e of rows) {
    const last = groups[groups.length - 1];
    if (last && last[0] === e.expense_date) last[1].push(e);
    else groups.push([e.expense_date, [e]]);
  }

  return (
    <>
      <AppHeader
        title="Expenses"
        subtitle="Cash out, by vehicle and overhead"
        back={{ href: "/more" }}
        action={
          <ExpenseForm vehicles={vehicleOptions} members={memberOptions} />
        }
      />

      <div className="space-y-5 px-3 py-4">
        <div className="grid grid-cols-2 gap-2.5">
          <Stat
            label="This month"
            value={formatMoney(monthTotal)}
            sub={`${thisMonth.length} entries`}
          />
          <Stat
            label="Overhead"
            value={formatMoney(monthOverhead)}
            sub="Rent, utilities, tools…"
            tone="muted"
          />
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={<Receipt className="size-7" />}
            title="No expenses recorded"
            body="Add towing, teardown labour, rent, fuel — anything that leaves the account. Vehicle costs land on that car's P&L; everything else counts as overhead."
          />
        ) : (
          groups.map(([date, items]) => (
            <section key={date} className="space-y-2">
              <SectionHeading
                action={
                  <span className="tnum text-[13px] text-ink-muted">
                    {formatMoney(items.reduce((n, e) => n + e.amount_cents, 0))}
                  </span>
                }
              >
                {formatDate(date)}
              </SectionHeading>
              <Card className="divide-y divide-line overflow-hidden">
                {items.map((e) => (
                  <ExpenseRow
                    key={e.id}
                    id={e.id}
                    category={EXPENSE_CATEGORY_LABEL[e.category]}
                    amount={formatMoney(e.amount_cents)}
                    note={e.note}
                    vehicleLabel={e.vehicle_id ? (vehicleLabels.get(e.vehicle_id) ?? "Vehicle") : null}
                    paidBy={e.paid_by ? (memberLabels.get(e.paid_by) ?? null) : null}
                    hasReceipt={!!e.receipt_url}
                  />
                ))}
              </Card>
            </section>
          ))
        )}
      </div>
    </>
  );
}
