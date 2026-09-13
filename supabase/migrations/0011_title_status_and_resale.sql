-- =====================================================================
-- 0011  Title status, and cars bought to repair rather than part out
--
-- Two things the yard does that the schema did not describe.
--
-- First, what state the title is in. Salvage, non-repairable and
-- write-off are not the same thing and they decide what a car is even
-- allowed to become, so they are recorded rather than left in the notes.
--
-- Second, not every car is stripped. Some are bought at auction,
-- repaired, inspected and sold whole. That car earns its money in one
-- sale instead of two hundred, and its costs land after the purchase
-- rather than at it -- so the P&L has to count a vehicle sale as revenue
-- alongside parts and scrap.
-- =====================================================================

-- ---------------------------------------------------------------------
-- What the title says
-- ---------------------------------------------------------------------
create type public.title_status as enum (
  'clean',
  'salvage',
  'non_repairable',
  'write_off',
  'rebuilt',
  'unknown'
);

comment on type public.title_status is
  'ICBC branding. non_repairable and write_off can never be road-legal again; salvage can, once rebuilt and inspected.';

-- ---------------------------------------------------------------------
-- What is going to happen to it
-- ---------------------------------------------------------------------
create type public.vehicle_plan as enum ('part_out', 'repair_and_sell');

alter table public.vehicles
  add column title_status public.title_status not null default 'unknown',
  add column plan         public.vehicle_plan not null default 'part_out',

  -- Set when a whole car is sold rather than parted out.
  add column sale_price_cents bigint not null default 0 check (sale_price_cents >= 0),
  add column sold_on          date,
  add column sold_to          text;

comment on column public.vehicles.plan is
  'part_out: stripped and sold as parts. repair_and_sell: fixed and sold whole.';
comment on column public.vehicles.sale_price_cents is
  'What the whole vehicle sold for. Zero for a car being parted out.';

create index vehicles_plan_idx on public.vehicles (plan);

-- The sale figure is money, so it is revoked like every other money
-- column on this table and reachable only through vehicle_finance.
revoke select (sale_price_cents) on public.vehicles from authenticated;

grant select (title_status, plan, sold_on, sold_to) on public.vehicles to authenticated;

-- A non-owner may create a car but not price it -- now including what it
-- sold for.
drop policy if exists vehicles_insert_members on public.vehicles;

create policy vehicles_insert_members on public.vehicles
  for insert to authenticated
  with check (
    public.is_active_member()
    and (
      public.is_owner()
      or (
        coalesce(purchase_price_cents, 0)             = 0
        and coalesce(auction_fee_cents, 0)            = 0
        and coalesce(transport_cost_cents, 0)         = 0
        and coalesce(other_acquisition_cost_cents, 0) = 0
        and coalesce(scrap_income_cents, 0)           = 0
        and coalesce(sale_price_cents, 0)             = 0
      )
    )
  );

-- ---------------------------------------------------------------------
-- vehicle_finance gains the sale figure.
-- ---------------------------------------------------------------------
-- Dropped rather than replaced: create-or-replace cannot insert a column
-- into the middle of a view's column list. Nothing in the database reads
-- this view -- only the app does -- so there is nothing to cascade to.
drop view if exists public.vehicle_finance;

create view public.vehicle_finance
with (security_invoker = false) as
  select
    v.id                           as vehicle_id,
    v.purchase_price_cents,
    v.auction_fee_cents,
    v.transport_cost_cents,
    v.other_acquisition_cost_cents,
    v.scrap_income_cents,
    v.sale_price_cents,
    v.landed_cost_cents
  from public.vehicles v
  where public.has_finance_access();

revoke all on public.vehicle_finance from anon;
grant select on public.vehicle_finance to authenticated;

comment on view public.vehicle_finance is
  'Security-definer view: the sole read path to vehicle cost columns. Returns zero rows for staff.';

-- ---------------------------------------------------------------------
-- vehicle_pnl: a car can now earn from parts, from scrap, or from being
-- sold whole. Recovery and break-even count all three.
-- ---------------------------------------------------------------------
drop function if exists public.vehicle_pnl(uuid);

create or replace function public.vehicle_pnl(p_vehicle_id uuid default null)
returns table (
  vehicle_id             uuid,
  stock_number           text,
  year                   int,
  make                   text,
  model                  text,
  "trim"                 text,
  status                 public.vehicle_status,
  plan                   public.vehicle_plan,
  purchase_date          date,
  landed_cost_cents      bigint,
  direct_expenses_cents  bigint,
  total_invested_cents   bigint,
  parts_revenue_cents    bigint,
  scrap_income_cents     bigint,
  vehicle_sale_cents     bigint,
  total_revenue_cents    bigint,
  gross_profit_cents     bigint,
  recovery_pct           numeric,
  parts_total            bigint,
  parts_sold             bigint,
  parts_remaining        bigint,
  pct_catalogue_moved    numeric,
  days_held              int,
  revenue_per_day_cents  bigint,
  break_even_remaining_cents bigint
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $fn$
begin
  perform public.assert_finance_access();

  return query
  with agg as (
    select
      v.id,
      v.stock_number, v.year, v.make, v.model, v.trim, v.status, v.plan, v.purchase_date,
      v.landed_cost_cents,
      v.scrap_income_cents,
      v.sale_price_cents,
      coalesce((select sum(e.amount_cents) from public.expenses e
                where e.vehicle_id = v.id), 0)::bigint as direct_expenses_cents,
      coalesce((select sum(s.sale_price_cents) from public.sales s
                where s.vehicle_id = v.id), 0)::bigint as parts_revenue_cents,
      coalesce((select count(*) from public.parts p
                where p.vehicle_id = v.id), 0)::bigint as parts_total,
      coalesce((select count(*) from public.parts p
                where p.vehicle_id = v.id and p.status = 'sold'), 0)::bigint as parts_sold,
      coalesce((select count(*) from public.parts p
                where p.vehicle_id = v.id and p.status in ('available','reserved')), 0)::bigint
        as parts_remaining,
      greatest(1, (current_date - v.purchase_date))::int as days_held
    from public.vehicles v
    where p_vehicle_id is null or v.id = p_vehicle_id
  ),
  totalled as (
    select a.*,
      (a.landed_cost_cents + a.direct_expenses_cents)::bigint as invested,
      (a.parts_revenue_cents + a.scrap_income_cents + a.sale_price_cents)::bigint as revenue
    from agg a
  )
  select
    t.id, t.stock_number, t.year, t.make, t.model, t.trim, t.status, t.plan, t.purchase_date,
    t.landed_cost_cents,
    t.direct_expenses_cents,
    t.invested,
    t.parts_revenue_cents,
    t.scrap_income_cents,
    t.sale_price_cents,
    t.revenue,
    (t.revenue - t.invested)::bigint,
    case when t.invested > 0
      then round(100.0 * t.revenue / t.invested, 1)
      else null
    end,
    t.parts_total, t.parts_sold, t.parts_remaining,
    case when t.parts_total > 0
      then round(100.0 * t.parts_sold / t.parts_total, 1)
      else 0
    end,
    t.days_held,
    round(t.revenue::numeric / t.days_held)::bigint,
    greatest(0, t.invested - t.revenue)::bigint
  from totalled t
  order by t.purchase_date desc, t.stock_number desc;
end;
$fn$;

-- ---------------------------------------------------------------------
-- The monthly report counts a whole-vehicle sale as revenue in the month
-- it sold, next to the parts.
-- ---------------------------------------------------------------------
create or replace function public.monthly_report(p_year int, p_month int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_start date;
  v_end   date;
  v_out   jsonb;
begin
  perform public.assert_finance_access();

  v_start := make_date(p_year, p_month, 1);
  v_end   := (v_start + interval '1 month')::date;

  with month_sales as (
    select s.*, p.name as part_name
    from public.sales s
    join public.parts p on p.id = s.part_id
    where s.sale_date >= v_start and s.sale_date < v_end
  ),
  month_vehicle_sales as (
    select v.id, v.stock_number, v.sale_price_cents,
           v.year || ' ' || v.make || ' ' || v.model as label
    from public.vehicles v
    where v.sold_on >= v_start and v.sold_on < v_end
      and v.sale_price_cents > 0
  ),
  month_vehicles as (
    select v.* from public.vehicles v
    where v.purchase_date >= v_start and v.purchase_date < v_end
  ),
  month_expenses as (
    select e.* from public.expenses e
    where e.expense_date >= v_start and e.expense_date < v_end
  ),
  revenue as (
    select coalesce(sum(sale_price_cents), 0)::bigint as total, count(*)::bigint as cnt
    from month_sales
  ),
  vehicle_revenue as (
    select coalesce(sum(sale_price_cents), 0)::bigint as total, count(*)::bigint as cnt
    from month_vehicle_sales
  ),
  acquisitions as (
    select coalesce(sum(landed_cost_cents), 0)::bigint as total, count(*)::bigint as cnt
    from month_vehicles
  ),
  direct_exp as (
    select coalesce(sum(amount_cents), 0)::bigint as total
    from month_expenses where scope = 'vehicle'
  ),
  overhead_exp as (
    select coalesce(sum(amount_cents), 0)::bigint as total
    from month_expenses where scope = 'business'
  ),
  overhead_breakdown as (
    select coalesce(jsonb_agg(x order by x->>'category'), '[]'::jsonb) as rows
    from (
      select jsonb_build_object(
               'category', category::text,
               'amount_cents', sum(amount_cents)::bigint,
               'count', count(*)::bigint) as x
      from month_expenses where scope = 'business'
      group by category
    ) t
  ),
  allocated as (
    select
      coalesce(sum(ms.sale_price_cents), 0)::bigint as revenue,
      coalesce(sum(cb.allocated_cost_cents), 0)::bigint as cost
    from month_sales ms
    left join public.part_cost_basis cb on cb.part_id = ms.part_id
  ),
  by_partner as (
    select coalesce(jsonb_agg(x order by (x->>'amount_cents')::bigint desc), '[]'::jsonb) as rows
    from (
      select jsonb_build_object(
               'user_id', ms.sold_by,
               'name', coalesce(pr.full_name, 'Unassigned'),
               'count', count(*)::bigint,
               'amount_cents', sum(ms.sale_price_cents)::bigint) as x
      from month_sales ms
      left join public.profiles pr on pr.id = ms.sold_by
      group by ms.sold_by, pr.full_name
    ) t
  ),
  by_channel as (
    select coalesce(jsonb_agg(x order by (x->>'amount_cents')::bigint desc), '[]'::jsonb) as rows
    from (
      select jsonb_build_object(
               'channel', channel::text,
               'count', count(*)::bigint,
               'amount_cents', sum(sale_price_cents)::bigint) as x
      from month_sales group by channel
    ) t
  ),
  by_payment as (
    select coalesce(jsonb_agg(x order by (x->>'amount_cents')::bigint desc), '[]'::jsonb) as rows
    from (
      select jsonb_build_object(
               'payment_method', payment_method::text,
               'count', count(*)::bigint,
               'amount_cents', sum(sale_price_cents)::bigint) as x
      from month_sales group by payment_method
    ) t
  ),
  vehicles_sold as (
    select coalesce(jsonb_agg(x order by (x->>'amount_cents')::bigint desc), '[]'::jsonb) as rows
    from (
      select jsonb_build_object(
               'vehicle_id', id,
               'stock_number', stock_number,
               'label', label,
               'amount_cents', sale_price_cents) as x
      from month_vehicle_sales
    ) t
  ),
  best_vehicles as (
    select coalesce(jsonb_agg(x order by (x->>'recovery_pct')::numeric desc nulls last), '[]'::jsonb) as rows
    from (
      select jsonb_build_object(
               'vehicle_id',   pl.vehicle_id,
               'stock_number', pl.stock_number,
               'label',        pl.year || ' ' || pl.make || ' ' || pl.model,
               'recovery_pct', pl.recovery_pct,
               'gross_profit_cents', pl.gross_profit_cents,
               'month_revenue_cents',
                 coalesce((select sum(ms.sale_price_cents) from month_sales ms
                           where ms.vehicle_id = pl.vehicle_id), 0)::bigint
                 + coalesce((select sum(mv.sale_price_cents) from month_vehicle_sales mv
                             where mv.id = pl.vehicle_id), 0)::bigint) as x
      from public.vehicle_pnl(null) pl
      where exists (select 1 from month_sales ms where ms.vehicle_id = pl.vehicle_id)
         or exists (select 1 from month_vehicle_sales mv where mv.id = pl.vehicle_id)
      limit 10
    ) t
  )
  select jsonb_build_object(
    'year',  p_year,
    'month', p_month,
    'period_start', v_start,
    'period_end',   (v_end - 1),
    'basis', 'cash',

    'revenue_cents',
      (select total from revenue) + (select total from vehicle_revenue),
    'parts_revenue_cents',        (select total from revenue),
    'vehicle_sales_revenue_cents',(select total from vehicle_revenue),
    'sales_count',                (select cnt   from revenue),
    'vehicles_sold_count',        (select cnt   from vehicle_revenue),
    'vehicles_sold',              (select rows  from vehicles_sold),

    'vehicles_purchased_count', (select cnt   from acquisitions),
    'vehicles_landed_cost_cents',(select total from acquisitions),
    'direct_vehicle_expenses_cents', (select total from direct_exp),
    'overhead_expenses_cents',  (select total from overhead_exp),
    'overhead_by_category',     (select rows  from overhead_breakdown),

    'net_profit_cash_cents',
      (select total from revenue)
      + (select total from vehicle_revenue)
      - (select total from acquisitions)
      - (select total from direct_exp)
      - (select total from overhead_exp),

    'allocated_revenue_cents',     (select revenue from allocated),
    'allocated_part_cost_cents',   (select cost    from allocated),
    'gross_profit_on_parts_sold_cents',
      (select revenue from allocated) - (select cost from allocated),

    'sales_by_partner', (select rows from by_partner),
    'sales_by_channel', (select rows from by_channel),
    'sales_by_payment', (select rows from by_payment),
    'best_vehicles',    (select rows from best_vehicles)
  ) into v_out;

  return v_out;
end;
$fn$;

-- ---------------------------------------------------------------------
-- The dashboard counts a car sold whole in the month's takings too.
-- ---------------------------------------------------------------------
create or replace function public.dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_finance     boolean := public.has_finance_access();
  v_month_start date := date_trunc('month', (now() at time zone 'America/Vancouver'))::date;
  v_week_start  date := date_trunc('week',  (now() at time zone 'America/Vancouver'))::date;
  v_out         jsonb;
  v_money       jsonb;
  v_attention   jsonb;
begin
  if not public.is_active_member() then
    raise exception 'Not an active member' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'parts_available',  (select count(*) from public.parts    where status = 'available'),
    'parts_reserved',   (select count(*) from public.parts    where status = 'reserved'),
    'active_vehicles',  (select count(*) from public.vehicles where status in ('incoming','parting_out')),
    'week_sales_count', (select count(*) from public.sales    where sale_date >= v_week_start),
    'finance_visible',  v_finance
  ) into v_out;

  if not v_finance then
    return v_out;
  end if;

  select jsonb_build_object(
    'inventory_value_cents',
      (select coalesce(sum(asking_price_cents), 0)::bigint from public.parts
        where status in ('available','reserved')),
    'month_revenue_cents',
      (select coalesce(sum(sale_price_cents), 0)::bigint from public.sales
        where sale_date >= v_month_start)
      + (select coalesce(sum(sale_price_cents), 0)::bigint from public.vehicles
          where sold_on >= v_month_start),
    'week_revenue_cents',
      (select coalesce(sum(sale_price_cents), 0)::bigint from public.sales
        where sale_date >= v_week_start)
      + (select coalesce(sum(sale_price_cents), 0)::bigint from public.vehicles
          where sold_on >= v_week_start)
  ) into v_money;

  select coalesce(jsonb_agg(x order by (x->>'recovery_pct')::numeric nulls first), '[]'::jsonb)
    into v_attention
  from (
    select jsonb_build_object(
             'vehicle_id',                pl.vehicle_id,
             'stock_number',              pl.stock_number,
             'label',                     pl.year || ' ' || pl.make || ' ' || pl.model,
             'recovery_pct',              pl.recovery_pct,
             'break_even_remaining_cents', pl.break_even_remaining_cents,
             'days_held',                 pl.days_held,
             'parts_remaining',           pl.parts_remaining) as x
    from public.vehicle_pnl(null) pl
    where pl.break_even_remaining_cents > 0
      and pl.status in ('parting_out','depleted')
    order by pl.days_held desc
    limit 10
  ) t;

  return v_out || v_money || jsonb_build_object('vehicles_below_break_even', v_attention);
end;
$fn$;
