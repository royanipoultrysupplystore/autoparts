-- =====================================================================
-- 0020  A copied parts list picks up what the catalog has learned since
--
-- Starting a car from the last one of its kind (0016) copies that car's
-- list. But the catalog keeps growing -- twenty-odd parts were added in
-- one go after the yard sent over what it was missing -- and a 2010
-- Civic booked in before that has none of them. Copy it, and the new
-- Civic starts without a fuel cap, a hood latch or a knee airbag, and
-- nobody notices until a buyer asks for one.
--
-- So a copy also brings the catalog parts the earlier car never saw.
-- "Never saw" matters: a part the earlier car was given and then trimmed
-- off was a decision about that car's model, and the copy respects it.
-- To tell the two apart, a car now remembers when its list last came
-- from the catalog, and only entries added after that are brought in.
-- =====================================================================

alter table public.vehicles
  add column catalog_seen_at timestamptz;

comment on column public.vehicles.catalog_seen_at is
  'When this car''s parts list last took everything from the catalog. A copy from this car adds only catalog entries created after it.';

-- Every car in the yard was given the latest catalog parts when they
-- were added, so as of now each one has seen the whole catalog.
update public.vehicles set catalog_seen_at = now();

-- ---------------------------------------------------------------------
-- generate_parts_for_vehicle -- as 0019, and the car has now seen it all
-- ---------------------------------------------------------------------
create or replace function public.generate_parts_for_vehicle(p_vehicle_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_count   integer;
  v_vehicle record;
begin
  if not public.is_active_member() then
    raise exception 'Not an active member' using errcode = 'insufficient_privilege';
  end if;

  select id, year, make, model, stock_number, fuel_type into v_vehicle
  from public.vehicles where id = p_vehicle_id;

  if not found then
    raise exception 'Vehicle % not found', p_vehicle_id using errcode = 'no_data_found';
  end if;

  insert into public.parts (vehicle_id, catalog_id, name, category, icon_key, side)
  select p_vehicle_id, c.id, c.name, c.category, c.icon_key, s.side
  from public.part_catalog c
  cross join lateral unnest(c.default_sides) as s(side)
  where c.is_active
    and (c.fuel_types is null or v_vehicle.fuel_type = any(c.fuel_types))
  on conflict (vehicle_id, catalog_id, side) where catalog_id is not null do nothing;

  get diagnostics v_count = row_count;

  update public.vehicles set catalog_seen_at = now() where id = p_vehicle_id;

  perform public.log_activity(
    'vehicle', p_vehicle_id, 'parts_generated',
    format('Generated %s parts for %s %s %s (%s)',
           v_count, v_vehicle.year, v_vehicle.make, v_vehicle.model, v_vehicle.stock_number),
    null, jsonb_build_object('parts_created', v_count)
  );

  return v_count;
end;
$fn$;

-- ---------------------------------------------------------------------
-- copy_parts_from_vehicle -- that car's list, plus whatever the catalog
-- gained after that car last saw it
-- ---------------------------------------------------------------------
create or replace function public.copy_parts_from_vehicle(
  p_source_vehicle_id uuid,
  p_target_vehicle_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_copied  integer;
  v_new     integer;
  v_source  record;
  v_target  record;
begin
  if not public.is_active_member() then
    raise exception 'Not an active member' using errcode = 'insufficient_privilege';
  end if;

  select id, stock_number, year, make, model,
         coalesce(catalog_seen_at, created_at) as seen_at
    into v_source
  from public.vehicles where id = p_source_vehicle_id;
  if not found then
    raise exception 'Source vehicle % not found', p_source_vehicle_id
      using errcode = 'no_data_found';
  end if;

  select id, stock_number, fuel_type into v_target
  from public.vehicles where id = p_target_vehicle_id;
  if not found then
    raise exception 'Vehicle % not found', p_target_vehicle_id
      using errcode = 'no_data_found';
  end if;

  insert into public.parts (
    vehicle_id, catalog_id, name, category, icon_key, side, asking_price_cents
  )
  select p_target_vehicle_id, p.catalog_id, p.name, p.category, p.icon_key,
         p.side, p.asking_price_cents
  from public.parts p
  left join public.part_catalog c on c.id = p.catalog_id
  where p.vehicle_id = p_source_vehicle_id
    and (c.fuel_types is null or v_target.fuel_type = any(c.fuel_types))
  on conflict (vehicle_id, catalog_id, side) where catalog_id is not null
  do nothing;

  get diagnostics v_copied = row_count;

  -- What the catalog learned after the earlier car last saw it.
  insert into public.parts (vehicle_id, catalog_id, name, category, icon_key, side)
  select p_target_vehicle_id, c.id, c.name, c.category, c.icon_key, s.side
  from public.part_catalog c
  cross join lateral unnest(c.default_sides) as s(side)
  where c.is_active
    and c.created_at > v_source.seen_at
    and (c.fuel_types is null or v_target.fuel_type = any(c.fuel_types))
  on conflict (vehicle_id, catalog_id, side) where catalog_id is not null do nothing;

  get diagnostics v_new = row_count;

  update public.vehicles set catalog_seen_at = now() where id = p_target_vehicle_id;

  perform public.log_activity(
    'vehicle', p_target_vehicle_id, 'parts_copied',
    format('Copied %s parts and prices from %s %s %s (%s)%s',
           v_copied, v_source.year, v_source.make, v_source.model,
           v_source.stock_number,
           case when v_new > 0
                then format(', plus %s new from the catalog', v_new) else '' end),
    null,
    jsonb_build_object('source_vehicle_id', p_source_vehicle_id,
                       'parts_created', v_copied + v_new,
                       'catalog_new', v_new)
  );

  return v_copied + v_new;
end;
$fn$;

-- ---------------------------------------------------------------------
-- find_parts_template -- as 0016, and says how many catalog parts the
-- copy would add on top, for the car being booked in
-- ---------------------------------------------------------------------
drop function if exists public.find_parts_template(text, text, int);

create function public.find_parts_template(
  p_make  text,
  p_model text,
  p_year  int default null,
  p_fuel  public.fuel_type default null
)
returns table (
  vehicle_id   uuid,
  stock_number text,
  year         int,
  make         text,
  model        text,
  "trim"       text,
  parts_total  bigint,
  parts_priced bigint,
  parts_new    bigint,
  purchase_date date
)
language sql
stable
security invoker
set search_path = public, extensions, pg_temp
as $fn$
  with best as (
    select v.id, v.stock_number, v.year, v.make, v.model, v.trim,
           coalesce(v.catalog_seen_at, v.created_at) as seen_at,
           count(p.id)::bigint as parts_total,
           count(p.id) filter (where p.asking_price_cents > 0)::bigint as parts_priced,
           v.purchase_date
    from public.vehicles v
    join public.parts p on p.vehicle_id = v.id
    where v.plan = 'part_out'
      and lower(btrim(v.make))  = lower(btrim(coalesce(p_make, '')))
      and lower(btrim(v.model)) = lower(btrim(coalesce(p_model, '')))
    group by v.id, v.stock_number, v.year, v.make, v.model, v.trim,
             v.catalog_seen_at, v.created_at, v.purchase_date
    having count(p.id) > 0
    order by
      case when p_year is null then 0 else abs(v.year - p_year) end,
      v.purchase_date desc
    limit 1
  )
  select b.id, b.stock_number, b.year, b.make, b.model, b.trim,
         b.parts_total, b.parts_priced,
         coalesce((
           select sum(cardinality(c.default_sides))
           from public.part_catalog c
           where c.is_active
             and c.created_at > b.seen_at
             and (c.fuel_types is null
                  or coalesce(p_fuel, 'gas'::public.fuel_type) = any(c.fuel_types))
             -- Already added to that car by hand from the catalog: it is
             -- copied with the rest, not counted as new.
             and not exists (select 1 from public.parts p
                             where p.vehicle_id = b.id and p.catalog_id = c.id)
         ), 0)::bigint,
         b.purchase_date
  from best b
$fn$;
