-- =====================================================================
-- 0004  Row Level Security + hard column-level protection for costs
--
-- Non-negotiable: a `staff` user must never be able to see vehicle costs
-- or profit. That is enforced here in the database, not in the UI:
--
--   1. SELECT on the cost columns of `vehicles` is revoked from every
--      client role, so no query -- not even `select *` -- can return them.
--   2. Costs are readable only through the `vehicle_finance` view, a
--      security-definer view whose WHERE clause calls has_finance_access().
--   3. Reporting functions re-check the role and raise if it is missing.
-- =====================================================================

alter table public.profiles      enable row level security;
alter table public.vehicles      enable row level security;
alter table public.part_catalog  enable row level security;
alter table public.parts         enable row level security;
alter table public.sales         enable row level security;
alter table public.expenses      enable row level security;
alter table public.activity_log  enable row level security;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create policy profiles_select_members on public.profiles
  for select to authenticated
  using (public.is_active_member());

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.current_role_name());

create policy profiles_owner_manage on public.profiles
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- ---------------------------------------------------------------------
-- vehicles
--
-- Everyone active can see the vehicle. Only owner/partner may create,
-- change, or delete one, because those writes carry cost figures.
-- ---------------------------------------------------------------------
create policy vehicles_select_members on public.vehicles
  for select to authenticated
  using (public.is_active_member());

create policy vehicles_insert_finance on public.vehicles
  for insert to authenticated
  with check (public.has_finance_access());

create policy vehicles_update_finance on public.vehicles
  for update to authenticated
  using (public.has_finance_access())
  with check (public.has_finance_access());

create policy vehicles_delete_finance on public.vehicles
  for delete to authenticated
  using (public.has_finance_access());

-- Column-level lockdown. Revoke the blanket grant, then hand back only
-- the non-financial columns.
revoke select on public.vehicles from authenticated, anon;

grant select (
  id, stock_number, vin, year, make, model, trim, body_type, engine,
  transmission, drivetrain, fuel_type, exterior_colour, mileage_km,
  purchase_date, source, lot_number, status, notes, created_by,
  created_at, updated_at
) on public.vehicles to authenticated;

-- Writes stay whole-table (RLS already limits them to owner/partner);
-- a writer still cannot read a cost column back, because RETURNING
-- requires SELECT privilege.
grant insert, update, delete on public.vehicles to authenticated;

-- The only door to cost data.
create view public.vehicle_finance
with (security_invoker = false) as
  select
    v.id                           as vehicle_id,
    v.purchase_price_cents,
    v.auction_fee_cents,
    v.transport_cost_cents,
    v.other_acquisition_cost_cents,
    v.scrap_income_cents,
    v.landed_cost_cents
  from public.vehicles v
  where public.has_finance_access();

revoke all on public.vehicle_finance from anon;
grant select on public.vehicle_finance to authenticated;

comment on view public.vehicle_finance is
  'Security-definer view: the sole read path to vehicle cost columns. Returns zero rows for staff.';

-- ---------------------------------------------------------------------
-- part_catalog
-- ---------------------------------------------------------------------
create policy part_catalog_select_members on public.part_catalog
  for select to authenticated
  using (public.is_active_member());

create policy part_catalog_write_finance on public.part_catalog
  for all to authenticated
  using (public.has_finance_access())
  with check (public.has_finance_access());

-- ---------------------------------------------------------------------
-- parts -- staff can search, sell, and edit. Deleting is not theirs.
-- ---------------------------------------------------------------------
create policy parts_select_members on public.parts
  for select to authenticated
  using (public.is_active_member());

create policy parts_insert_members on public.parts
  for insert to authenticated
  with check (public.is_active_member());

create policy parts_update_members on public.parts
  for update to authenticated
  using (public.is_active_member())
  with check (public.is_active_member());

create policy parts_delete_finance on public.parts
  for delete to authenticated
  using (public.has_finance_access());

-- ---------------------------------------------------------------------
-- sales -- staff sell, so staff read and write sales.
-- Corrections and deletions belong to owner/partner.
-- ---------------------------------------------------------------------
create policy sales_select_members on public.sales
  for select to authenticated
  using (public.is_active_member());

create policy sales_insert_members on public.sales
  for insert to authenticated
  with check (public.is_active_member());

create policy sales_update_finance on public.sales
  for update to authenticated
  using (public.has_finance_access())
  with check (public.has_finance_access());

create policy sales_delete_finance on public.sales
  for delete to authenticated
  using (public.has_finance_access());

-- ---------------------------------------------------------------------
-- expenses -- financial. Owner/partner only, end to end.
-- ---------------------------------------------------------------------
create policy expenses_all_finance on public.expenses
  for all to authenticated
  using (public.has_finance_access())
  with check (public.has_finance_access());

-- ---------------------------------------------------------------------
-- activity_log -- everyone reads the feed; nobody can forge another
-- person's entry.
-- ---------------------------------------------------------------------
create policy activity_log_select_members on public.activity_log
  for select to authenticated
  using (public.is_active_member());

create policy activity_log_insert_self on public.activity_log
  for insert to authenticated
  with check (public.is_active_member() and user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Nothing is readable by anonymous visitors. The storefront gets its own
-- narrow view in a later migration.
-- ---------------------------------------------------------------------
revoke all on public.profiles, public.parts, public.sales,
              public.expenses, public.activity_log, public.part_catalog
  from anon;
