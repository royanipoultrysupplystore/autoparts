import { redirect } from "next/navigation";
import { Phone, ShieldCheck, Users } from "lucide-react";
import { createSupabaseServer, getCurrentProfile, hasFinanceAccess } from "@/lib/supabase/server";
import { AppHeader } from "@/components/nav/app-header";
import { Card, EmptyState } from "@/components/ui/primitives";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Team" };

const ROLE: Record<Profile["role"], { label: string; note: string; tone: string }> = {
  owner: {
    label: "Owner",
    note: "Everything, including adding and removing people",
    tone: "bg-accent-soft text-accent",
  },
  partner: {
    label: "Partner",
    note: "Everything except managing the team",
    tone: "bg-available-soft text-available",
  },
  staff: {
    label: "Staff",
    note: "Search, sell, and edit parts — no costs or reports",
    tone: "bg-surface-2 text-ink-muted",
  },
};

export default async function TeamPage() {
  const me = await getCurrentProfile();
  if (!hasFinanceAccess(me)) redirect("/");

  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .order("role")
    .order("full_name");

  const members = (data ?? []) as Profile[];

  return (
    <>
      <AppHeader
        title="Team"
        subtitle={`${members.filter((m) => m.is_active).length} active`}
        back={{ href: "/more" }}
      />

      <div className="space-y-4 px-3 py-4">
        {members.length === 0 ? (
          <EmptyState
            icon={<Users className="size-7" />}
            title="No accounts yet"
            body="Run npm run seed:users with the four partners filled into .env.local."
          />
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {members.map((m) => {
              const role = ROLE[m.role];
              return (
                <div
                  key={m.id}
                  className={cn("px-3.5 py-3", !m.is_active && "opacity-50")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium text-ink">
                        {m.full_name}
                        {m.id === me?.id && (
                          <span className="ml-1.5 text-[12.5px] font-normal text-ink-subtle">
                            (you)
                          </span>
                        )}
                      </p>
                      {m.phone && (
                        <a
                          href={`tel:${m.phone}`}
                          className="mt-0.5 inline-flex items-center gap-1 text-[12.5px] text-accent"
                        >
                          <Phone className="size-3.5" />
                          {m.phone}
                        </a>
                      )}
                      <p className="mt-1 text-[12px] leading-relaxed text-ink-subtle">
                        {role.note}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-ink-subtle">
                        Since {formatDate(m.created_at)}
                      </p>
                    </div>

                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold",
                        role.tone,
                      )}
                    >
                      {role.label}
                    </span>
                  </div>

                  {!m.is_active && (
                    <p className="mt-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[12px] text-ink-muted">
                      Switched off — cannot sign in.
                    </p>
                  )}
                </div>
              );
            })}
          </Card>
        )}

        <Card className="p-4">
          <h2 className="flex items-center gap-2 text-[14.5px] font-semibold text-ink">
            <ShieldCheck className="size-[18px] text-accent" />
            How the roles are enforced
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
            A staff account cannot reach vehicle costs or profit at all — the
            database revokes those columns outright and refuses every reporting
            query, so it is not a matter of hiding buttons. Adding accounts and
            changing roles is done by the owner in the Supabase dashboard.
          </p>
        </Card>
      </div>
    </>
  );
}
