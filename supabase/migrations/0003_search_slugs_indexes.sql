-- =====================================================================
-- 0003  Slugs, denormalised search text, indexes, and the search RPC
-- =====================================================================

-- ---------------------------------------------------------------------
-- slugify: lowercase, strip accents, collapse to hyphens
-- ---------------------------------------------------------------------
create or replace function public.slugify(p_input text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(lower(public.unaccent(coalesce(p_input, ''))), '[^a-z0-9]+', '-', 'g'),
      '-{2,}', '-', 'g'
    )
  )
$fn$;

-- ---------------------------------------------------------------------
-- parts.search_text -- denormalised so one trigram index covers
-- "civic mirror" (part name AND vehicle) in a single query.
-- ---------------------------------------------------------------------
alter table public.parts add column search_text text not null default '';

create or replace function public.build_part_search_text(
  p_name text, p_side public.part_side, p_category text,
  p_year int, p_make text, p_model text, p_trim text, p_stock text
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select lower(
    concat_ws(' ',
      coalesce(p_name, ''),
      case when p_side = 'none' then '' else replace(p_side::text, '_', ' ') end,
      coalesce(p_category, ''),
      coalesce(p_year::text, ''),
      coalesce(p_make, ''),
      coalesce(p_model, ''),
      coalesce(p_trim, ''),
      coalesce(p_stock, '')
    )
  )
$fn$;

-- Assign slug + search_text on insert, refresh search_text on rename.
create or replace function public.parts_before_write()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v            record;
  base_slug    text;
  candidate    text;
  suffix       int;
begin
  select ve.year, ve.make, ve.model, ve.trim, ve.stock_number
    into v
  from public.vehicles ve
  where ve.id = new.vehicle_id;

  new.search_text := public.build_part_search_text(
    new.name, new.side, new.category,
    v.year, v.make, v.model, v.trim, v.stock_number
  );

  if new.slug is null or new.slug = '' then
    base_slug := public.slugify(concat_ws('-',
      v.year, v.make, v.model,
      new.name,
      case when new.side = 'none' then null else new.side::text end,
      replace(v.stock_number, '-', '')
    ));

    -- Disambiguate against anything already claimed.
    suffix := 1;
    loop
      candidate := base_slug || '-' || suffix::text;
      exit when not exists (select 1 from public.parts p where p.slug = candidate);
      suffix := suffix + 1;
    end loop;
    new.slug := candidate;
  end if;

  return new;
end;
$fn$;

create trigger parts_before_write_trg
  before insert or update of name, side, category, vehicle_id on public.parts
  for each row execute function public.parts_before_write();

-- Renaming or re-yearing a vehicle must refresh its parts' search text.
create or replace function public.vehicles_refresh_part_search()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if new.year  is distinct from old.year
  or new.make  is distinct from old.make
  or new.model is distinct from old.model
  or new.trim  is distinct from old.trim
  or new.stock_number is distinct from old.stock_number then
    update public.parts p
       set search_text = public.build_part_search_text(
             p.name, p.side, p.category,
             new.year, new.make, new.model, new.trim, new.stock_number)
     where p.vehicle_id = new.id;
  end if;
  return new;
end;
$fn$;

create trigger vehicles_refresh_part_search_trg
  after update on public.vehicles
  for each row execute function public.vehicles_refresh_part_search();

-- ---------------------------------------------------------------------
-- Indexes. The search screen is the hot path -- index for it first.
-- ---------------------------------------------------------------------
create index parts_search_text_trgm_idx on public.parts using gin (search_text public.gin_trgm_ops);
create index parts_status_idx            on public.parts (status);
create index parts_vehicle_id_idx        on public.parts (vehicle_id);
create index parts_category_idx          on public.parts (category);
create index parts_condition_idx         on public.parts (condition);
create index parts_available_idx         on public.parts (vehicle_id, category) where status = 'available';
create index parts_public_idx            on public.parts (is_public) where is_public;
create index parts_reserved_until_idx    on public.parts (reserved_until) where status = 'reserved';

create index vehicles_make_model_idx     on public.vehicles (lower(make), lower(model));
create index vehicles_year_idx           on public.vehicles (year);
create index vehicles_status_idx         on public.vehicles (status);
create index vehicles_purchase_date_idx  on public.vehicles (purchase_date);

create index sales_vehicle_id_idx        on public.sales (vehicle_id);
create index sales_sale_date_idx         on public.sales (sale_date);
create index sales_sold_by_idx           on public.sales (sold_by);

create index expenses_vehicle_id_idx     on public.expenses (vehicle_id);
create index expenses_expense_date_idx   on public.expenses (expense_date);

create index activity_log_created_at_idx on public.activity_log (created_at desc);
create index activity_log_entity_idx     on public.activity_log (entity_type, entity_id);

create index part_catalog_active_idx     on public.part_catalog (is_active, sort_order);

-- ---------------------------------------------------------------------
-- search_parts -- the screen that matters most.
--
-- Every whitespace token must match, either as a substring or by trigram
-- word similarity, so "bumpr" finds "Front bumper cover" and
-- "civic mirror" matches across the part/vehicle join in one pass.
-- ---------------------------------------------------------------------
create or replace function public.search_parts(
  p_query      text default '',
  p_makes      text[] default null,
  p_models     text[] default null,
  p_year_min   int default null,
  p_year_max   int default null,
  p_conditions public.part_condition[] default null,
  p_categories text[] default null,
  p_statuses   public.part_status[] default array['available']::public.part_status[],
  p_limit      int default 50,
  p_offset     int default 0
)
returns table (
  id                 uuid,
  name               text,
  category           text,
  icon_key           text,
  side               public.part_side,
  condition          public.part_condition,
  status             public.part_status,
  asking_price_cents bigint,
  shelf_location     text,
  reserved_for_name  text,
  reserved_until     timestamptz,
  vehicle_id         uuid,
  stock_number       text,
  year               int,
  make               text,
  model              text,
  "trim"               text,
  vin_last6          text,
  mileage_km         int,
  exterior_colour    text,
  score              real,
  total_count        bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
  with toks as (
    select nullif(btrim(t), '') as t
    from unnest(string_to_array(lower(btrim(coalesce(p_query, ''))), ' ')) as t
  ),
  filtered as (
    select p.*, v.stock_number, v.year, v.make, v.model, v.trim,
           v.vin, v.mileage_km, v.exterior_colour,
           case
             when btrim(coalesce(p_query, '')) = '' then 0::real
             else similarity(lower(btrim(p_query)), p.search_text)
           end as score
    from public.parts p
    join public.vehicles v on v.id = p.vehicle_id
    where (p_statuses   is null or p.status    = any(p_statuses))
      and (p_conditions is null or p.condition = any(p_conditions))
      and (p_categories is null or p.category  = any(p_categories))
      and (p_makes      is null or lower(v.make)  = any(select lower(m) from unnest(p_makes)  m))
      and (p_models     is null or lower(v.model) = any(select lower(m) from unnest(p_models) m))
      and (p_year_min   is null or v.year >= p_year_min)
      and (p_year_max   is null or v.year <= p_year_max)
      and (
        btrim(coalesce(p_query, '')) = ''
        or not exists (
          select 1 from toks
          where toks.t is not null
            and p.search_text not like '%' || toks.t || '%'
            and word_similarity(toks.t, p.search_text) < 0.55
        )
      )
  )
  select f.id, f.name, f.category, f.icon_key, f.side, f.condition, f.status,
         f.asking_price_cents, f.shelf_location, f.reserved_for_name, f.reserved_until,
         f.vehicle_id, f.stock_number, f.year, f.make, f.model, f.trim,
         right(coalesce(f.vin, ''), 6) as vin_last6,
         f.mileage_km, f.exterior_colour,
         f.score,
         count(*) over () as total_count
  from filtered f
  order by
    -- Available first, then best textual match, then newest.
    (f.status = 'available') desc,
    f.score desc,
    f.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0))
$fn$;
