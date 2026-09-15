-- =====================================================================
-- 0012  Returns, and correcting a sale that was entered wrong
--
-- A sale used to be final. The record said so on the screen: "this part
-- is sold, its record is history now and cannot be edited." That is true
-- of an accountant's ledger and false of a yard, where somebody fat-
-- fingers 180 instead of 80, and where a buyer comes back on Saturday
-- with a mirror that did not fit and wants their money.
--
-- A return does not delete the sale. It marks it returned, which keeps
-- the history -- who sold it, for how much, who took it back and when --
-- and takes the money out of every revenue figure. The part goes back on
-- the shelf and can be sold again.
--
-- That last part is why the unique constraint has to change. "One sale
-- per part" was the hard guarantee against double-selling; it is now
-- "one LIVE sale per part", which guarantees exactly as much and still
-- lets a returned part find a second buyer.
-- =====================================================================

alter table public.sales
  add column returned_at   timestamptz,
  add column returned_by   uuid references public.profiles(id) on delete set null,
  add column return_reason text;

comment on column public.sales.returned_at is
  'Set when the part came back and the money went out. A returned sale keeps its row and counts for nothing.';

alter table public.sales drop constraint sales_part_id_key;

create unique index sales_one_live_per_part
  on public.sales (part_id)
  where returned_at is null;

comment on index public.sales_one_live_per_part is
  'Hard guarantee that a part can never be sold twice over. A returned sale is not a live one, so the part can be sold again.';

create index sales_returned_at_idx
  on public.sales (returned_at)
  where returned_at is not null;

-- ---------------------------------------------------------------------
-- Who may amend a sale.
--
-- The person who rang it up, for a day, and the owner for good. Money is
-- the owner's -- that was settled in 0009 -- but the seller is the one
-- who typed the figure in the first place, so letting them fix their own
-- typo on the same shift is not a new power, it is the same one. What it
-- stops is a staff account quietly rewriting last month.
-- ---------------------------------------------------------------------
create or replace function public.may_amend_sale(p_sale public.sales)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $fn$
  select public.is_owner()
      or (p_sale.sold_by = auth.uid()
          and p_sale.created_at > now() - interval '24 hours')
$fn$;

-- ---------------------------------------------------------------------
-- return_sale -- the part comes back, the money goes out
-- ---------------------------------------------------------------------
create or replace function public.return_sale(
  p_part_id uuid,
  p_reason  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_actor uuid := auth.uid();
  v_sale  public.sales;
  v_name  text;
begin
  if not public.is_active_member() then
    raise exception 'Not an active member' using errcode = 'insufficient_privilege';
  end if;

  -- Locked, so two people refunding the same part at the counter and on
  -- the phone cannot both succeed.
  select * into v_sale
  from public.sales
  where part_id = p_part_id and returned_at is null
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_sold');
  end if;

  if not public.may_amend_sale(v_sale) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  update public.sales
     set returned_at   = now(),
         returned_by   = v_actor,
         return_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = v_sale.id;

  update public.parts
     set status = 'available'
   where id = p_part_id and status = 'sold'
  returning name into v_name;

  if v_name is null then
    select name into v_name from public.parts where id = p_part_id;
  end if;

  perform public.log_activity(
    'part', p_part_id, 'returned',
    format('Returned %s — $%s refunded',
           coalesce(v_name, 'a part'),
           to_char(v_sale.sale_price_cents / 100.0, 'FM999999990.00')),
    jsonb_build_object('status', 'sold', 'sale_price_cents', v_sale.sale_price_cents),
    jsonb_build_object('status', 'available', 'returned', true, 'reason', p_reason)
  );

  return jsonb_build_object(
    'ok', true,
    'part_id', p_part_id,
    'sale_id', v_sale.id,
    'refunded_cents', v_sale.sale_price_cents
  );
end;
$fn$;

-- ---------------------------------------------------------------------
-- update_sale -- the sale stands, the numbers on it were wrong
-- ---------------------------------------------------------------------
create or replace function public.update_sale(
  p_part_id          uuid,
  p_sale_price_cents bigint,
  p_payment_method   public.payment_method,
  p_channel          public.sale_channel,
  p_sale_date        date default null,
  p_buyer_name       text default null,
  p_notes            text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_sale public.sales;
  v_name text;
begin
  if not public.is_active_member() then
    raise exception 'Not an active member' using errcode = 'insufficient_privilege';
  end if;

  if p_sale_price_cents is null or p_sale_price_cents < 0 then
    return jsonb_build_object('ok', false, 'reason', 'bad_price');
  end if;

  select * into v_sale
  from public.sales
  where part_id = p_part_id and returned_at is null
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_sold');
  end if;

  if not public.may_amend_sale(v_sale) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  update public.sales
     set sale_price_cents = p_sale_price_cents,
         payment_method   = p_payment_method,
         channel          = p_channel,
         sale_date        = coalesce(p_sale_date, v_sale.sale_date),
         buyer_name       = nullif(btrim(coalesce(p_buyer_name, '')), ''),
         notes            = nullif(btrim(coalesce(p_notes, '')), '')
   where id = v_sale.id;

  select name into v_name from public.parts where id = p_part_id;

  perform public.log_activity(
    'part', p_part_id, 'sale_corrected',
    format('Corrected the sale of %s: $%s → $%s',
           coalesce(v_name, 'a part'),
           to_char(v_sale.sale_price_cents / 100.0, 'FM999999990.00'),
           to_char(p_sale_price_cents / 100.0, 'FM999999990.00')),
    jsonb_build_object(
      'sale_price_cents', v_sale.sale_price_cents,
      'payment_method',   v_sale.payment_method,
      'channel',          v_sale.channel,
      'sale_date',        v_sale.sale_date),
    jsonb_build_object(
      'sale_price_cents', p_sale_price_cents,
      'payment_method',   p_payment_method,
      'channel',          p_channel,
      'sale_date',        coalesce(p_sale_date, v_sale.sale_date))
  );

  return jsonb_build_object('ok', true, 'part_id', p_part_id, 'sale_id', v_sale.id);
end;
$fn$;

-- =====================================================================
-- Everything that counts money has to stop counting a returned sale.
-- =====================================================================

-- ---------------------------------------------------------------------
-- The two conflict reports join to "the" sale of a part. With returns
-- there can be several, and only the live one describes why the write
-- was refused.
-- ---------------------------------------------------------------------
create or replace function public.sell_part(
  p_part_id          uuid,
  p_sale_price_cents bigint,
  p_payment_method   public.payment_method default 'cash',
  p_buyer_name       text default null,
  p_buyer_contact    text default null,
  p_channel          public.sale_channel default 'facebook',
  p_notes            text default null,
  p_sold_by          uuid default null,
  p_sale_date        date default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_part     record;
  v_conflict record;
  v_sale_id  uuid;
  v_actor    uuid := coalesce(p_sold_by, auth.uid());
begin
  if p_sale_price_cents is null or p_sale_price_cents < 0 then
    return jsonb_build_object('ok', false, 'reason', 'bad_price');
  end if;

  update public.parts p
     set status            = 'sold',
         reserved_by       = null,
         reserved_for_name = null,
         reserved_at       = null,
         reserved_until    = null
   where p.id = p_part_id
     and p.status in ('available', 'reserved')
  returning p.* into v_part;

  if not found then
    select p.id, p.name, p.side, p.status,
           s.sale_price_cents, s.created_at as sold_at,
           coalesce(seller.full_name, 'someone')   as sold_by_name,
           coalesce(holder.full_name, 'someone')   as reserved_by_name,
           p.reserved_for_name, p.reserved_until
      into v_conflict
    from public.parts p
    left join public.sales    s      on s.part_id = p.id and s.returned_at is null
    left join public.profiles seller on seller.id = s.sold_by
    left join public.profiles holder on holder.id = p.reserved_by
    where p.id = p_part_id;

    if v_conflict.id is null then
      return jsonb_build_object('ok', false, 'reason', 'not_found');
    end if;

    return jsonb_build_object(
      'ok',            false,
      'reason',        'already_' || v_conflict.status,
      'status',        v_conflict.status,
      'part_name',     v_conflict.name,
      'sold_by_name',  v_conflict.sold_by_name,
      'sold_at',       v_conflict.sold_at,
      'sale_price_cents', v_conflict.sale_price_cents
    );
  end if;

  insert into public.sales (
    part_id, vehicle_id, sold_by, sale_price_cents, sale_date,
    payment_method, buyer_name, buyer_contact, channel, notes
  ) values (
    p_part_id, v_part.vehicle_id, v_actor, p_sale_price_cents,
    coalesce(p_sale_date, (now() at time zone 'America/Vancouver')::date),
    p_payment_method, nullif(btrim(coalesce(p_buyer_name, '')), ''),
    nullif(btrim(coalesce(p_buyer_contact, '')), ''), p_channel,
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning id into v_sale_id;

  perform public.log_activity(
    'part', p_part_id, 'sold',
    format('Sold %s for $%s', v_part.name, to_char(p_sale_price_cents / 100.0, 'FM999999990.00')),
    jsonb_build_object('status', 'available'),
    jsonb_build_object('status', 'sold', 'sale_price_cents', p_sale_price_cents,
                       'buyer_name', p_buyer_name, 'channel', p_channel)
  );

  return jsonb_build_object(
    'ok', true, 'sale_id', v_sale_id,
    'part_id', p_part_id, 'vehicle_id', v_part.vehicle_id
  );
end;
$fn$;

create or replace function public.reserve_part(
  p_part_id    uuid,
  p_buyer_name text default null,
  p_hours      integer default 48
)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_part     record;
  v_conflict record;
  v_actor    uuid := auth.uid();
  v_hours    integer := greatest(1, least(coalesce(p_hours, 48), 336));
begin
  update public.parts p
     set status            = 'reserved',
         reserved_by       = v_actor,
         reserved_for_name = nullif(btrim(coalesce(p_buyer_name, '')), ''),
         reserved_at       = now(),
         reserved_until    = now() + make_interval(hours => v_hours)
   where p.id = p_part_id
     and p.status = 'available'
  returning p.* into v_part;

  if not found then
    select p.id, p.name, p.status, p.reserved_for_name, p.reserved_until,
           coalesce(holder.full_name, 'someone') as reserved_by_name,
           coalesce(seller.full_name, 'someone') as sold_by_name,
           s.created_at as sold_at, s.sale_price_cents
      into v_conflict
    from public.parts p
    left join public.profiles holder on holder.id = p.reserved_by
    left join public.sales    s      on s.part_id = p.id and s.returned_at is null
    left join public.profiles seller on seller.id = s.sold_by
    where p.id = p_part_id;

    if v_conflict.id is null then
      return jsonb_build_object('ok', false, 'reason', 'not_found');
    end if;

    return jsonb_build_object(
      'ok',               false,
      'reason',           'already_' || v_conflict.status,
      'status',           v_conflict.status,
      'part_name',        v_conflict.name,
      'reserved_by_name', v_conflict.reserved_by_name,
      'reserved_for_name', v_conflict.reserved_for_name,
      'reserved_until',   v_conflict.reserved_until,
      'sold_by_name',     v_conflict.sold_by_name,
      'sold_at',          v_conflict.sold_at,
      'sale_price_cents', v_conflict.sale_price_cents
    );
  end if;

  perform public.log_activity(
    'part', p_part_id, 'reserved',
    format('Held %s for %s', v_part.name,
           coalesce(nullif(btrim(coalesce(p_buyer_name, '')), ''), 'a buyer')),
    jsonb_build_object('status', 'available'),
    jsonb_build_object('status', 'reserved', 'reserved_until', v_part.reserved_until)
  );

  return jsonb_build_object(
    'ok', true, 'part_id', p_part_id, 'reserved_until', v_part.reserved_until
  );
end;
$fn$;

-- ---------------------------------------------------------------------
-- vehicle_pnl
-- ---------------------------------------------------------------------
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
                where s.vehicle_id = v.id and s.returned_at is null), 0)::bigint
        as parts_revenue_cents,
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
-- monthly_report -- a sale returned later stops counting in the month it
-- was made. Cash basis, and the cash went back.
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
      and s.returned_at is null
  ),
  month_returns as (
    select coalesce(sum(s.sale_price_cents), 0)::bigint as total, count(*)::bigint as cnt
    from public.sales s
    where s.returned_at >= v_start
      and s.returned_at < (v_end::timestamptz)
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

    'returns_count',              (select cnt   from month_returns),
    'refunded_cents',             (select total from month_returns),

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
-- dashboard_stats
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
    'week_sales_count', (select count(*) from public.sales
                          where sale_date >= v_week_start and returned_at is null),
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
        where sale_date >= v_month_start and returned_at is null)
      + (select coalesce(sum(sale_price_cents), 0)::bigint from public.vehicles
          where sold_on >= v_month_start),
    'week_revenue_cents',
      (select coalesce(sum(sale_price_cents), 0)::bigint from public.sales
        where sale_date >= v_week_start and returned_at is null)
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
