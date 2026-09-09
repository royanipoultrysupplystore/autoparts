-- =====================================================================
-- 0006  Reporting
--
-- Every function here is SECURITY DEFINER (it must read the cost columns
-- that are revoked from client roles) and therefore re-checks the caller
-- role on entry. A `staff` user calling any of these gets an exception,
-- not a number.
--
-- COST ALLOCATION, stated once and used consistently:
--   A sold part is charged a share of its vehicle's total invested cost,
--   proportional to its asking price against the sum of asking prices of
--   every non-scrapped part on that vehicle. Where a vehicle has no
--   asking prices set at all, the cost is split evenly by part count.
-- =====================================================================

create or replace function public.assert_finance_access()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.has_finance_access() then
    raise exception 'Financial reporting is restricted to owners and partners'
      using errcode = 'insufficient_privilege';
  end if;
end;
$fn$;

-- ---------------------------------------------------------------------
-- Per-part allocated cost basis.
-- ---------------------------------------------------------------------
create or replace view public.part_cost_basis
with (security_invoker = false) as
with vehicle_totals as (
  select
    v.id as vehicle_id,
    v.landed_cost_cents
      + coalesce((select sum(e.amount_cents) from public.expenses e
                  where e.vehicle_id = v.id), 0) as total_invested_cents,
    coalesce((select sum(p.asking_price_cents) from public.parts p
              where p.vehicle_id = v.id and p.status <> 'scrapped'), 0) as asking_total_cents,
    coalesce((select count(*) from public.parts p
              where p.vehicle_id = v.id and p.status <> 'scrapped'), 0) as part_count
  from public.vehicles v
)
select
  p.id         as part_id,
  p.vehicle_id,
  case
    when vt.asking_total_cents > 0
      then round(vt.total_invested_cents * (p.asking_price_cents::numeric / vt.asking_total_cents))
    when vt.part_count > 0
      then round(vt.total_invested_cents::numeric / vt.part_count)
    else 0
  end::bigint as allocated_cost_cents
from public.parts p
join vehicle_totals vt on vt.vehicle_id = p.vehicle_id
where p.status <> 'scrapped';

revoke all on public.part_cost_basis from anon, authenticated;

-- ---------------------------------------------------------------------
-- vehicle_pnl -- pass a vehicle id for one, or null for every vehicle.
-- ---------------------------------------------------------------------
create or replace function public.vehicle_pnl(p_vehicle_id uuid default null)
returns table (
  vehicle_id             uuid,
  stock_number           text,
  year                   int,
  make                   text,
  model                  text,
  "trim"                   text,
  status                 public.vehicle_status,
  purchase_date          date,
  landed_cost_cents      bigint,
  direct_expenses_cents  bigint,
  total_invested_cents   bigint,
  parts_revenue_cents    bigint,
  scrap_income_cents     bigint,
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
set search_path = public, pg_temp
as $fn$
begin
  perform public.assert_finance_access();

  return query
  with agg as (
    select
      v.id,
      v.stock_number, v.year, v.make, v.model, v.trim, v.status, v.purchase_date,
      v.landed_cost_cents,
      v.scrap_income_cents,
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
  )
  select
    a.id, a.stock_number, a.year, a.make, a.model, a.trim, a.status, a.purchase_date,
    a.landed_cost_cents,
    a.direct_expenses_cents,
    (a.landed_cost_cents + a.direct_expenses_cents)::bigint as total_invested_cents,
    a.parts_revenue_cents,
    a.scrap_income_cents,
    (a.parts_revenue_cents + a.scrap_income_cents
       - (a.landed_cost_cents + a.direct_expenses_cents))::bigint as gross_profit_cents,
    case when (a.landed_cost_cents + a.direct_expenses_cents) > 0
      then round(100.0 * (a.parts_revenue_cents + a.scrap_income_cents)
                 / (a.landed_cost_cents + a.direct_expenses_cents), 1)
      else null
    end as recovery_pct,
    a.parts_total, a.parts_sold, a.parts_remaining,
    case when a.parts_total > 0
      then round(100.0 * a.parts_sold / a.parts_total, 1)
      else 0
    end as pct_catalogue_moved,
    a.days_held,
    round((a.parts_revenue_cents + a.scrap_income_cents)::numeric / a.days_held)::bigint
      as revenue_per_day_cents,
    greatest(0, (a.landed_cost_cents + a.direct_expenses_cents)
                - (a.parts_revenue_cents + a.scrap_income_cents))::bigint
      as break_even_remaining_cents
  from agg a
  order by a.purchase_date desc, a.stock_number desc;
end;
$fn$;

-- ---------------------------------------------------------------------
-- top_remaining_parts -- the money still sitting on the shelf
-- ---------------------------------------------------------------------
create or replace function public.top_remaining_parts(
  p_vehicle_id uuid,
  p_limit      int default 10
)
returns table (
  part_id            uuid,
  name               text,
  side               public.part_side,
  category           text,
  icon_key           text,
  condition          public.part_condition,
  status             public.part_status,
  asking_price_cents bigint,
  shelf_location     text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public.assert_finance_access();

  return query
  select p.id, p.name, p.side, p.category, p.icon_key, p.condition, p.status,
         p.asking_price_cents, p.shelf_location
  from public.parts p
  where p.vehicle_id = p_vehicle_id
    and p.status in ('available','reserved')
  order by p.asking_price_cents desc, p.name
  limit greatest(1, least(coalesce(p_limit, 10), 100));
end;
$fn$;

-- ---------------------------------------------------------------------
-- monthly_report -- cash basis, plus the allocated-cost gross margin
--                   that stops a three-car month looking like a disaster
-- ---------------------------------------------------------------------
create or replace function public.monthly_report(p_year int, p_month int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
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
                           where ms.vehicle_id = pl.vehicle_id), 0)::bigint) as x
      from public.vehicle_pnl(null) pl
      where exists (select 1 from month_sales ms where ms.vehicle_id = pl.vehicle_id)
      limit 10
    ) t
  )
  select jsonb_build_object(
    'year',  p_year,
    'month', p_month,
    'period_start', v_start,
    'period_end',   (v_end - 1),
    'basis', 'cash',

    'revenue_cents',            (select total from revenue),
    'sales_count',              (select cnt   from revenue),
    'vehicles_purchased_count', (select cnt   from acquisitions),
    'vehicles_landed_cost_cents',(select total from acquisitions),
    'direct_vehicle_expenses_cents', (select total from direct_exp),
    'overhead_expenses_cents',  (select total from overhead_exp),
    'overhead_by_category',     (select rows  from overhead_breakdown),

    'net_profit_cash_cents',
      (select total from revenue)
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
-- dashboard_stats -- the home screen.
--
-- Written with explicit branches rather than CASE arms: an uncorrelated
-- sub-select inside a CASE can be planned as an InitPlan and evaluated
-- before the guard is reached, which would raise for staff. Money keys
-- are absent (not null-and-hidden) when the caller has no finance role.
-- ---------------------------------------------------------------------
create or replace function public.dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
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
        where sale_date >= v_month_start),
    'week_revenue_cents',
      (select coalesce(sum(sale_price_cents), 0)::bigint from public.sales
        where sale_date >= v_week_start)
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

-- ---------------------------------------------------------------------
-- recent_activity -- the feed on the dashboard
-- ---------------------------------------------------------------------
create or replace function public.recent_activity(p_limit int default 25)
returns table (
  id          uuid,
  user_id     uuid,
  user_name   text,
  entity_type text,
  entity_id   uuid,
  action      text,
  summary     text,
  created_at  timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
  select a.id, a.user_id, coalesce(p.full_name, 'System'),
         a.entity_type, a.entity_id, a.action, a.summary, a.created_at
  from public.activity_log a
  left join public.profiles p on p.id = a.user_id
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 25), 200));
$fn$;
