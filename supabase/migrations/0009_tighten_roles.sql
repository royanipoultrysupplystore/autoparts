-- =====================================================================
-- 0009  Tighter roles
--
-- The yard's actual division of labour, which is narrower than what was
-- built first:
--
--   owner            everything -- costs, profit, reports, expenses,
--                    editing and deleting vehicles, the team list
--
--   partner, staff   bring a car in, strip it, price it, sell it.
--                    They never see what a car cost, never see profit,
--                    and cannot change or remove a vehicle once it is in.
--
-- Money is now owner-only. `has_finance_access()` used to include
-- partners, and every cost surface in the schema is built on it -- the
-- vehicle_finance view, every reporting function, the expenses policy --
-- so narrowing that one function narrows all of them at once.
--
-- Adding a vehicle is the part that needs care. Partners and staff must
-- be able to create one, but a vehicle row carries cost columns. They
-- cannot be trusted to leave those alone simply because the form omits
-- them, so the policy requires them to be zero unless the owner is the
-- one writing.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Money means the owner, and nobody else.
-- ---------------------------------------------------------------------
create or replace function public.has_finance_access()
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $fn$
  select coalesce(public.current_role_name() = 'owner', false)
$fn$;

comment on function public.has_finance_access() is
  'Owner only. Partners and staff run the yard; they do not see what it costs.';

-- ---------------------------------------------------------------------
-- Vehicles
--
-- Anyone active may bring a car in. Only the owner may change one, and
-- only the owner may put a number on what it cost.
-- ---------------------------------------------------------------------
drop policy if exists vehicles_insert_finance on public.vehicles;
drop policy if exists vehicles_update_finance on public.vehicles;
drop policy if exists vehicles_delete_finance on public.vehicles;

create policy vehicles_insert_members on public.vehicles
  for insert to authenticated
  with check (
    public.is_active_member()
    and (
      public.is_owner()
      -- A non-owner may create the car, but not price it. The form does
      -- not show these fields; this is what makes that stick.
      or (
        coalesce(purchase_price_cents, 0)         = 0
        and coalesce(auction_fee_cents, 0)            = 0
        and coalesce(transport_cost_cents, 0)         = 0
        and coalesce(other_acquisition_cost_cents, 0) = 0
        and coalesce(scrap_income_cents, 0)           = 0
      )
    )
  );

create policy vehicles_update_owner on public.vehicles
  for update to authenticated
  using (public.is_owner())
  with check (public.is_owner());

create policy vehicles_delete_owner on public.vehicles
  for delete to authenticated
  using (public.is_owner());

-- ---------------------------------------------------------------------
-- Parts
--
-- Whoever strips the car prices it: every active member can create,
-- rename, reprice and shelve a part. Removing one individually stays
-- with the owner -- except through the trim screen, which is the whole
-- point of the first two minutes with a new car.
-- ---------------------------------------------------------------------
drop policy if exists parts_delete_finance on public.parts;

create policy parts_delete_owner on public.parts
  for delete to authenticated
  using (public.is_owner());

-- The trim screen deletes on behalf of a member who cannot delete
-- directly, so it runs as definer -- and re-checks membership itself.
-- Sold and reserved parts are still untouchable, as before.
create or replace function public.trim_vehicle_parts(
  p_vehicle_id uuid,
  p_remove_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_removed integer;
  v_stock   text;
begin
  if not public.is_active_member() then
    raise exception 'Not an active member' using errcode = 'insufficient_privilege';
  end if;

  select stock_number into v_stock from public.vehicles where id = p_vehicle_id;

  delete from public.parts p
  where p.vehicle_id = p_vehicle_id
    and p.status = 'available'
    and p.id = any(coalesce(p_remove_ids, array[]::uuid[]));

  get diagnostics v_removed = row_count;

  if v_removed > 0 then
    perform public.log_activity(
      'vehicle', p_vehicle_id, 'parts_trimmed',
      format('Trimmed %s parts off %s', v_removed, coalesce(v_stock, 'vehicle')),
      null, jsonb_build_object('parts_removed', v_removed)
    );
  end if;

  return v_removed;
end;
$fn$;

-- Generating the list runs for the same people, for the same reason: the
-- member who created the vehicle needs its parts, and the insert touches
-- rows they are otherwise allowed to write anyway.
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

  select id, year, make, model, stock_number into v_vehicle
  from public.vehicles where id = p_vehicle_id;

  if not found then
    raise exception 'Vehicle % not found', p_vehicle_id using errcode = 'no_data_found';
  end if;

  insert into public.parts (vehicle_id, catalog_id, name, category, icon_key, side)
  select p_vehicle_id, c.id, c.name, c.category, c.icon_key, s.side
  from public.part_catalog c
  cross join lateral unnest(c.default_sides) as s(side)
  where c.is_active
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
-- The catalog is a template shared by every future car. Editing it is an
-- owner decision, and already was -- restated here because the function
-- it leaned on has changed meaning.
-- ---------------------------------------------------------------------
drop policy if exists part_catalog_write_finance on public.part_catalog;

create policy part_catalog_write_owner on public.part_catalog
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());
