-- =====================================================================
-- 0019  A gas car does not have a hybrid battery
--
-- The catalog is one template for every car, so every car booked in got
-- a hybrid battery on its list -- a Civic, a Mazda3, a RAV4 -- and the
-- partner had to remember to untick it every time. Forget once and the
-- shelf offers a part that was never on the car.
--
-- The form already asks for the fuel type. So a catalog entry can now
-- say which fuel types it belongs to, and the list is built to match.
-- Left empty, an entry belongs to every car, which is what all of them
-- were until now.
-- =====================================================================

alter table public.part_catalog
  add column fuel_types public.fuel_type[];

comment on column public.part_catalog.fuel_types is
  'Only cars with one of these fuel types get this part. Null means every car.';

update public.part_catalog
   set fuel_types = array['hybrid']::public.fuel_type[]
 where name = 'Hybrid battery';

-- ---------------------------------------------------------------------
-- generate_parts_for_vehicle -- as 0009, built for this car's fuel type
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
-- copy_parts_from_vehicle -- as 0016, and a hybrid's list copied onto a
-- gas car leaves the hybrid parts behind
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
