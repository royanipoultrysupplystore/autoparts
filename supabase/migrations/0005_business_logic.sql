-- =====================================================================
-- 0005  Business logic: part generation, the conditional sell/reserve
--       writes, reservation expiry, and the activity log helper.
-- =====================================================================

-- ---------------------------------------------------------------------
-- log_activity
-- ---------------------------------------------------------------------
create or replace function public.log_activity(
  p_entity_type text,
  p_entity_id   uuid,
  p_action      text,
  p_summary     text,
  p_before      jsonb default null,
  p_after       jsonb default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_id uuid;
begin
  insert into public.activity_log (user_id, entity_type, entity_id, action, summary, before, after)
  values (auth.uid(), p_entity_type, p_entity_id, p_action, p_summary, p_before, p_after)
  returning id into v_id;
  return v_id;
end;
$fn$;

-- ---------------------------------------------------------------------
-- generate_parts_for_vehicle
--
-- One parts row per active catalog entry, expanded by default_sides.
-- ~150 rows per vehicle. Name/category/icon are snapshotted here so a
-- later catalog rename can never rewrite history.
-- ---------------------------------------------------------------------
create or replace function public.generate_parts_for_vehicle(p_vehicle_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_count   integer;
  v_vehicle record;
begin
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
-- trim_vehicle_parts
--
-- The "trim the list" screen saves in one round trip, and the whole trim
-- lands in the log as a single entry rather than 200.
--
-- It takes the ids to REMOVE rather than the ids to keep. That list is
-- shorter, and more importantly it cannot delete a part another partner
-- added while the screen was open. Sold and reserved parts are never
-- touched.
-- ---------------------------------------------------------------------
create or replace function public.trim_vehicle_parts(
  p_vehicle_id uuid,
  p_remove_ids uuid[]
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_removed integer;
  v_stock   text;
begin
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

-- ---------------------------------------------------------------------
-- sell_part
--
-- MANDATORY conditional write. The UPDATE carries its own status guard,
-- so two partners hitting the same part at the same moment cannot both
-- win. The loser gets a payload describing who beat them, when, and for
-- how much -- never a silent failure.
--
-- The status flip and the sales row share one transaction: if the sales
-- insert fails, the part is not left marked sold.
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
set search_path = public, pg_temp
as $fn$
declare
  v_part     record;
  v_conflict record;
  v_sale_id  uuid;
  v_actor    uuid := coalesce(p_sold_by, auth.uid());
begin
  if p_sale_price_cents is null or p_sale_price_cents < 0 then
    raise exception 'Sale price must be zero or more' using errcode = 'check_violation';
  end if;

  -- The guard: only an unsold part can transition to sold.
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
    left join public.sales    s      on s.part_id = p.id
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

-- ---------------------------------------------------------------------
-- reserve_part -- same conditional-write treatment, 48 hour default hold
-- ---------------------------------------------------------------------
create or replace function public.reserve_part(
  p_part_id    uuid,
  p_buyer_name text default null,
  p_hours      integer default 48
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_part     record;
  v_conflict record;
begin
  update public.parts p
     set status            = 'reserved',
         reserved_by       = auth.uid(),
         reserved_for_name = nullif(btrim(coalesce(p_buyer_name, '')), ''),
         reserved_at       = now(),
         reserved_until    = now() + make_interval(hours => greatest(1, coalesce(p_hours, 48)))
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
    left join public.sales    s      on s.part_id = p.id
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
      'reserved_for_name',v_conflict.reserved_for_name,
      'reserved_until',   v_conflict.reserved_until,
      'sold_by_name',     v_conflict.sold_by_name,
      'sold_at',          v_conflict.sold_at,
      'sale_price_cents', v_conflict.sale_price_cents
    );
  end if;

  perform public.log_activity(
    'part', p_part_id, 'reserved',
    format('Reserved %s for %s until %s',
           v_part.name,
           coalesce(v_part.reserved_for_name, 'a buyer'),
           to_char(v_part.reserved_until at time zone 'America/Vancouver', 'Mon DD HH12:MIam')),
    jsonb_build_object('status', 'available'),
    jsonb_build_object('status', 'reserved', 'reserved_until', v_part.reserved_until)
  );

  return jsonb_build_object('ok', true, 'part_id', p_part_id,
                            'reserved_until', v_part.reserved_until);
end;
$fn$;

-- ---------------------------------------------------------------------
-- release_reservation -- put a held part back on the shelf
-- ---------------------------------------------------------------------
create or replace function public.release_reservation(p_part_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_part record;
begin
  update public.parts p
     set status = 'available', reserved_by = null, reserved_for_name = null,
         reserved_at = null, reserved_until = null
   where p.id = p_part_id
     and p.status = 'reserved'
  returning p.* into v_part;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_reserved');
  end if;

  perform public.log_activity(
    'part', p_part_id, 'reservation_released',
    format('Released the hold on %s', v_part.name),
    jsonb_build_object('status', 'reserved'),
    jsonb_build_object('status', 'available')
  );

  return jsonb_build_object('ok', true, 'part_id', p_part_id);
end;
$fn$;

-- ---------------------------------------------------------------------
-- expire_reservations
--
-- Ghost holds by no-show buyers return to the shelf. Runs as definer so
-- the notice can be logged against the partner who placed the hold.
-- ---------------------------------------------------------------------
create or replace function public.expire_reservations()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  r       record;
  v_count integer := 0;
begin
  -- Read the holds BEFORE clearing them: an UPDATE ... RETURNING hands
  -- back the new row, where reserved_by is already null, and the notice
  -- would have nobody to go to.
  --
  -- SKIP LOCKED because four phones may sweep at the same moment; each
  -- takes the rows it can lock and leaves the rest to whoever got there
  -- first, instead of piling up behind them.
  for r in
    select p.id, p.name, p.reserved_by, p.reserved_for_name
    from public.parts p
    where p.status = 'reserved'
      and p.reserved_until is not null
      and p.reserved_until < now()
    for update skip locked
  loop
    update public.parts p
       set status = 'available', reserved_by = null, reserved_for_name = null,
           reserved_at = null, reserved_until = null
     where p.id = r.id
       and p.status = 'reserved';

    if not found then
      continue;
    end if;

    insert into public.activity_log (user_id, entity_type, entity_id, action, summary, before, after)
    values (
      r.reserved_by, 'part', r.id, 'reservation_expired',
      format('Hold on %s expired%s -- back on the shelf',
             r.name,
             case when r.reserved_for_name is null then ''
                  else ' (' || r.reserved_for_name || ' did not show)' end),
      jsonb_build_object('status', 'reserved', 'reserved_for_name', r.reserved_for_name),
      jsonb_build_object('status', 'available')
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$fn$;

-- ---------------------------------------------------------------------
-- set_part_status -- guarded transitions for kept / scrapped / available
-- ---------------------------------------------------------------------
create or replace function public.set_part_status(
  p_part_id uuid,
  p_status  public.part_status
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_part   record;
  v_before public.part_status;
begin
  if p_status = 'sold' then
    raise exception 'Use sell_part() to mark a part sold' using errcode = 'raise_exception';
  end if;

  select status into v_before from public.parts where id = p_part_id;

  update public.parts p
     set status = p_status,
         reserved_by = null, reserved_for_name = null,
         reserved_at = null, reserved_until = null
   where p.id = p_part_id
     and p.status <> 'sold'
  returning p.* into v_part;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'already_sold');
  end if;

  perform public.log_activity(
    'part', p_part_id, 'status_changed',
    format('%s marked %s', v_part.name, p_status),
    jsonb_build_object('status', v_before),
    jsonb_build_object('status', p_status)
  );

  return jsonb_build_object('ok', true, 'part_id', p_part_id, 'status', p_status);
end;
$fn$;
