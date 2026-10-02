-- =====================================================================
-- 0021  What each partner has put into the business
--
-- Four partners fund the yard between them -- one pays for the Civic at
-- auction, another covers the month's rent -- and the only record of who
-- has put in what was memory and a chat thread. The question "how much
-- have we each put in, and what share is that" had no answer here.
--
-- A contribution is money a partner put into the business: who, how
-- much, when, and what it was for. Totals and shares are worked out from
-- these rows, never stored, so they cannot drift from them.
--
-- Money, so the owner's alone -- the same rule as costs, expenses and
-- reports since 0009. Partners and staff cannot read a single row.
-- =====================================================================

create table public.capital_contributions (
  id             uuid primary key default gen_random_uuid(),
  -- Restrict, not cascade: a partner is switched off, never deleted
  -- (0008), and what they put in has to outlive their account.
  partner_id     uuid not null references public.profiles(id) on delete restrict,
  amount_cents   bigint not null check (amount_cents > 0),
  contributed_on date not null default (now() at time zone 'America/Vancouver')::date,
  note           text,
  created_by     uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now()
);

comment on table public.capital_contributions is
  'Money a partner put into the business. Owner only. Totals and ownership shares are derived from these rows.';

create index capital_contributions_partner_idx
  on public.capital_contributions (partner_id);
create index capital_contributions_date_idx
  on public.capital_contributions (contributed_on desc);

alter table public.capital_contributions enable row level security;

create policy capital_contributions_owner on public.capital_contributions
  for all to authenticated
  using (public.has_finance_access())
  with check (public.has_finance_access());

revoke all on public.capital_contributions from anon;
grant select, insert, update, delete on public.capital_contributions to authenticated;
