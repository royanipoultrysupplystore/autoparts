-- =====================================================================
-- 0016  The second Civic should not cost what the first one did
--
-- Booking a car in generates 239 rows, and the partner then unticks the
-- 190 it does not have and prices the 49 that are left. Do that once for
-- a 2016 Civic and it is a job. Do it again three months later for
-- another 2016 Civic and it is the same job, with the same answers, and
-- roughly the same prices -- typed again from scratch.
--
-- So a car that has already been through that is a template for the next
-- one of its kind. Not automatically: the yard is asked, because the
-- second Civic might have arrived rear-ended with a clean front where the
-- first was the other way round.
-- =====================================================================

-- ---------------------------------------------------------------------
-- find_parts_template -- have we done one of these before?
--
-- Same make and model, closest year, most recently bought. Only cars that
-- were actually parted out and actually have a list: a car still sitting
-- untrimmed is not a template, it is a copy of the catalog.
-- ---------------------------------------------------------------------
create or replace function public.find_parts_template(
  p_make  text,
  p_model text,
  p_year  int default null
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
  purchase_date date
)
language sql
stable
security invoker
set search_path = public, extensions, pg_temp
as $fn$
  select v.id, v.stock_number, v.year, v.make, v.model, v.trim,
         count(p.id)::bigint,
         count(p.id) filter (where p.asking_price_cents > 0)::bigint,
         v.purchase_date
  from public.vehicles v
  join public.parts p on p.vehicle_id = v.id
  where v.plan = 'part_out'
    and lower(btrim(v.make))  = lower(btrim(coalesce(p_make, '')))
    and lower(btrim(v.model)) = lower(btrim(coalesce(p_model, '')))
  group by v.id, v.stock_number, v.year, v.make, v.model, v.trim, v.purchase_date
  having count(p.id) > 0
  order by
    -- The nearest model year first: a 2016 Civic is a better guide to a
    -- 2017 than a 2009 is, and trim levels move around over a generation.
    case when p_year is null then 0 else abs(v.year - p_year) end,
    v.purchase_date desc
  limit 1
$fn$;

-- ---------------------------------------------------------------------
-- copy_parts_from_vehicle -- this car has the same list as that one
--
-- Copies what the part IS and what it is worth. Deliberately does not
-- copy what happened to it: condition, shelf location, notes, status and
-- the storefront flags all belong to the individual car, and carrying
-- them over would put another car's grade-A wing mirror on this one's
-- shelf in a bin that does not hold it.
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
  v_count   integer;
  v_source  record;
  v_target  record;
begin
  if not public.is_active_member() then
    raise exception 'Not an active member' using errcode = 'insufficient_privilege';
  end if;

  select id, stock_number, year, make, model into v_source
  from public.vehicles where id = p_source_vehicle_id;
  if not found then
    raise exception 'Source vehicle % not found', p_source_vehicle_id
      using errcode = 'no_data_found';
  end if;

  select id, stock_number into v_target
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
  where p.vehicle_id = p_source_vehicle_id
  on conflict (vehicle_id, catalog_id, side) where catalog_id is not null
  do nothing;

  get diagnostics v_count = row_count;

  perform public.log_activity(
    'vehicle', p_target_vehicle_id, 'parts_copied',
    format('Copied %s parts and prices from %s %s %s (%s)',
           v_count, v_source.year, v_source.make, v_source.model,
           v_source.stock_number),
    null,
    jsonb_build_object('source_vehicle_id', p_source_vehicle_id,
                       'parts_created', v_count)
  );

  return v_count;
end;
$fn$;
