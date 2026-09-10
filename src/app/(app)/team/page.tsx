import { redirect } from "next/navigation";
import { Phone, ShieldCheck, Users } from "lucide-react";
import { createSupabaseServer, getCurrentProfile, hasFinanceAccess } from "@/lib/supabase/server";
import { AppHeader } from "@/components/nav/app-header";
import { Card, EmptyState } from "@/components/ui/primitives";
import { AddMemberSheet } from "@/components/team/add-member-sheet";
import { MemberMenu } from "@/components/team/member-menu";
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
    note: "Search, sell and edit parts — no costs or reports",
    tone: "bg-surface-2 text-ink-muted",
  },
};

type MemberRow = Profile & { email: string | null };

export default async function TeamPage() {
  const me = await getCurrentProfile();
  if (!hasFinanceAccess(me)) redirect("/");

  const isOwner = me?.role === "owner";
  const supabase = await createSupabaseServer();

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .order("role")
    .order("full_name");

  const members = (data ?? []) as MemberRow[];
  const active = members.filter((m) => m.is_active).length;

  return (
    <>
      <AppHeader
        title="Team"
        subtitle={`${active} active · ${members.length} total`}
        back={{ href: "/more" }}
        action={isOwner ? <AddMemberSheet /> : undefined}
      />

      <div className="space-y-4 px-3 py-4">
        {members.length === 0 ? (
          <EmptyState
            icon={<Users className="size-7" />}
            title="No accounts yet"
            body={
              isOwner
                ? "Add your partners so they can sign in on their own phones."
                : "Ask the owner to add people to the yard."
            }
          />
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {members.map((m) => {
              const role = ROLE[m.role];
              const isSelf = m.id === me?.id;

              return (
                <div key={m.id} className={cn("px-3.5 py-3", !m.is_active && "opacity-55")}>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium text-ink">
                        {m.full_name}
                        {isSelf && (
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

                    {isOwner && (
                      <MemberMenu
                        userId={m.id}
                        name={m.full_name}
                        role={m.role}
                        isActive={m.is_active}
                        isSelf={isSelf}
                      />
                    )}
                  </div>

                  {!m.is_active && (
                    <p className="mt-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[12px] text-ink-muted">
                      Switched off — cannot sign in. Their sales stay on the reports.
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
            query, so it is not a matter of hiding buttons.
          </p>
          {isOwner && (
            <p className="mt-2.5 text-[13px] leading-relaxed text-ink-muted">
              Nobody is ever deleted here. Someone who leaves gets switched off:
              they cannot sign in, and every sale they recorded stays under their
              name in the reports.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
