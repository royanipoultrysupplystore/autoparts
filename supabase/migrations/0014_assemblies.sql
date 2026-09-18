-- =====================================================================
-- 0014  Big parts take smaller parts with them
--
-- A complete engine leaves the yard with its head, oil pan, valve cover
-- and injectors still bolted to it. The shelf did not know that: those
-- rows stayed "available", turned up in every search, and were counted as
-- inventory value that no longer existed. Somebody would promise a buyer
-- a cylinder head that drove away a fortnight ago.
--
-- So the catalog learns which entries belong inside which. Selling an
-- assembly then offers to take its companions off the shelf with it.
--
-- OFFERS. Never does it silently. The mapping below is a starting guess
-- at what a yard means by "the engine", and the yard is the authority on
-- that, not this file -- they might have pulled the turbo off first, or
-- sold the injectors last week. So the sale hands back a list and the
-- person standing there ticks what actually went. Under-guessing here
-- costs a tap; over-guessing quietly deletes stock they still have.
-- =====================================================================

alter table public.part_catalog
  add column is_assembly  boolean not null default false,
  add column assembly_of  uuid references public.part_catalog(id) on delete set null;

comment on column public.part_catalog.is_assembly is
  'This entry is a whole assembly. Selling one offers to sweep its companions off the shelf.';
comment on column public.part_catalog.assembly_of is
  'This entry normally leaves attached to that assembly.';

create index part_catalog_assembly_of_idx
  on public.part_catalog (assembly_of) where assembly_of is not null;

-- ---------------------------------------------------------------------
-- The starting mapping.
--
-- Matched on name, which is what the seed writes and what the yard reads.
-- Deliberately conservative: everything here is bolted to the assembly
-- and comes out with it as one lump. Anything a yard commonly pulls off
-- and sells on its own -- the turbo, the manifolds, the engine mounts --
-- is left out on purpose, because the cost of the two mistakes is not
-- symmetrical.
-- ---------------------------------------------------------------------
do $$
declare
  v_pairs constant text[][] := array[
    -- [assembly, companion]
    ['Engine assembly', 'Cylinder head'],
    ['Engine assembly', 'Engine block'],
    ['Engine assembly', 'Intake manifold'],
    ['Engine assembly', 'Throttle body'],
    ['Engine assembly', 'Fuel injector set'],
    ['Engine assembly', 'Fuel rail'],
    ['Engine assembly', 'Oil pan'],
    ['Engine assembly', 'Oil pump'],
    ['Engine assembly', 'Valve cover'],
    ['Engine assembly', 'Timing cover'],
    ['Engine assembly', 'Timing chain/belt kit'],
    ['Engine assembly', 'Crankshaft pulley'],
    ['Engine assembly', 'Serpentine belt tensioner'],
    ['Engine assembly', 'Dipstick tube'],

    ['Automatic transmission', 'Torque converter'],
    ['Automatic transmission', 'Flywheel/flexplate'],
    ['Automatic transmission', 'Transmission mount'],

    ['Manual transmission', 'Clutch kit'],
    ['Manual transmission', 'Flywheel/flexplate'],
    ['Manual transmission', 'Transmission mount']
  ];
  v_row      text[];
  v_assembly uuid;
begin
  -- Mark the assemblies themselves.
  update public.part_catalog
     set is_assembly = true
   where name in (
     'Engine assembly',
     'Automatic transmission',
     'Manual transmission',
     'Transfer case',
     'Front differential',
     'Rear differential'
   );

  foreach v_row slice 1 in array v_pairs loop
    select id into v_assembly from public.part_catalog where name = v_row[1];
    if v_assembly is null then
      continue;   -- a catalog that never had this entry, or renamed it
    end if;

    update public.part_catalog
       set assembly_of = v_assembly
     where name = v_row[2]
       and assembly_of is null;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- assembly_companions -- what would go with this part, if it sold
--
-- Only what is still on the shelf. A companion already sold was paid for
-- separately and keeps its sale; one on hold belongs to a buyer who was
-- promised it, and is reported rather than swept so somebody makes an
-- actual decision about it.
-- ---------------------------------------------------------------------
create or replace function public.assembly_companions(p_part_id uuid)
returns table (
  id       uuid,
  name     text,
  category text,
  icon_key text,
  side     public.part_side,
  status   public.part_status,
  asking_price_cents bigint
)
language sql
stable
security invoker
set search_path = public, extensions, pg_temp
as $fn$
  select c.id, c.name, c.category, c.icon_key, c.side, c.status, c.asking_price_cents
  from public.parts sold_part
  join public.part_catalog pc on pc.id = sold_part.catalog_id and pc.is_assembly
  join public.parts c
    on c.vehicle_id = sold_part.vehicle_id
   and c.id <> sold_part.id
  join public.part_catalog cc
    on cc.id = c.catalog_id and cc.assembly_of = pc.id
  where sold_part.id = p_part_id
    and c.status in ('available', 'reserved')
  order by c.category, c.name, c.side;
$fn$;

-- ---------------------------------------------------------------------
-- include_parts_with -- these went out attached to that one
-- ---------------------------------------------------------------------
create or replace function public.include_parts_with(
  p_parent_part_id uuid,
  p_part_ids       uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_parent record;
  v_count  integer;
begin
  if not public.is_active_member() then
    raise exception 'Not an active member' using errcode = 'insufficient_privilege';
  end if;

  select p.id, p.name, p.vehicle_id into v_parent
  from public.parts p where p.id = p_parent_part_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if p_part_ids is null or array_length(p_part_ids, 1) is null then
    return jsonb_build_object('ok', true, 'included', 0);
  end if;

  -- Scoped to the same vehicle, so a bad id list cannot reach across the
  -- yard, and never touches anything already sold.
  update public.parts
     set status            = 'included',
         reserved_by       = null,
         reserved_for_name = null,
         reserved_at       = null,
         reserved_until    = null,
         is_public         = false
   where id = any(p_part_ids)
     and vehicle_id = v_parent.vehicle_id
     and id <> p_parent_part_id
     and status in ('available', 'reserved');

  get diagnostics v_count = row_count;

  if v_count > 0 then
    perform public.log_activity(
      'part', p_parent_part_id, 'included_with',
      format('%s part%s left with %s',
             v_count, case when v_count = 1 then '' else 's' end, v_parent.name),
      null,
      jsonb_build_object('parent_part_id', p_parent_part_id, 'included', v_count)
    );
  end if;

  return jsonb_build_object('ok', true, 'included', v_count);
end;
$fn$;

-- =====================================================================
-- What the rest of the system makes of an "included" part.
-- =====================================================================

-- ---------------------------------------------------------------------
-- part_cost_basis
--
-- An included part earned nothing on its own -- whatever it was worth is
-- inside the assembly's price. Leaving it in the allocation would hand it
-- a share of the car's cost that nothing ever pays back, and quietly
-- understate the assembly's own margin. So it drops out, the same way a
-- scrapped part does.
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
              where p.vehicle_id = v.id
                and p.status not in ('scrapped', 'included')), 0) as asking_total_cents,
    coalesce((select count(*) from public.parts p
              where p.vehicle_id = v.id
                and p.status not in ('scrapped', 'included')), 0) as part_count
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
where p.status not in ('scrapped', 'included');

-- ---------------------------------------------------------------------
-- vehicle_pnl -- an included part has moved off the shelf, so it counts
-- as moved. Left in the denominator alone it would make every engine sale
-- look like the car had stopped selling.
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
                where p.vehicle_id = v.id and p.status = 'included'), 0)::bigint
        as parts_included,
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
      then round(100.0 * (t.parts_sold + t.parts_included) / t.parts_total, 1)
      else 0
    end,
    t.days_held,
    round(t.revenue::numeric / t.days_held)::bigint,
    greatest(0, t.invested - t.revenue)::bigint
  from totalled t
  order by t.purchase_date desc, t.stock_number desc;
end;
$fn$;
