-- =====================================================================
-- 0015  A complete engine should be the first thing you find
--
-- Search "engine" and the results led with three engine blocks, an oil
-- pan and an oil pump. "Engine assembly" -- the whole engine, the most
-- valuable thing on the car and the thing a buyer on the phone is almost
-- always asking about -- was somewhere further down, below the fold.
--
-- Two reasons. It scored no better than its own pieces, because the
-- ranking is trigram similarity of the query against the whole row and
-- "Engine block" looks as much like "engine" as "Engine assembly" does.
-- And nobody types "assembly": they type "whole engine", "complete
-- engine", "full engine", none of which matched anything at all.
-- =====================================================================

-- ---------------------------------------------------------------------
-- An assembly answers to the words people actually use for it.
-- ---------------------------------------------------------------------
-- The old eight-argument form is dropped rather than left beside this
-- one: with a defaulted ninth parameter, an eight-argument call matches
-- both and Postgres refuses the call as ambiguous.
drop function if exists public.build_part_search_text(
  text, public.part_side, text, int, text, text, text, text);

create function public.build_part_search_text(
  p_name text, p_side public.part_side, p_category text,
  p_year int, p_make text, p_model text, p_trim text, p_stock text,
  p_is_assembly boolean default false
)
returns text
language sql
immutable
set search_path = public, extensions, pg_temp
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
      coalesce(p_stock, ''),
      -- Nobody walks in asking for an assembly.
      case when p_is_assembly then 'complete whole full unit assembly' else '' end
    )
  )
$fn$;

create or replace function public.parts_before_write()
returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $fn$
declare
  v            record;
  v_assembly   boolean := false;
  base_slug    text;
  candidate    text;
  suffix       int;
begin
  select ve.year, ve.make, ve.model, ve.trim, ve.stock_number
    into v
  from public.vehicles ve
  where ve.id = new.vehicle_id;

  if new.catalog_id is not null then
    select pc.is_assembly into v_assembly
    from public.part_catalog pc where pc.id = new.catalog_id;
  end if;

  new.search_text := public.build_part_search_text(
    new.name, new.side, new.category,
    v.year, v.make, v.model, v.trim, v.stock_number,
    coalesce(v_assembly, false)
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

-- Every assembly already on a shelf gets the new words.
update public.parts p
   set search_text = public.build_part_search_text(
         p.name, p.side, p.category,
         v.year, v.make, v.model, v.trim, v.stock_number, true)
  from public.vehicles v, public.part_catalog pc
 where v.id = p.vehicle_id
   and pc.id = p.catalog_id
   and pc.is_assembly;

-- ---------------------------------------------------------------------
-- search_parts -- the complete unit leads its own pieces
--
-- A boost rather than a sort key of its own: an assembly should beat its
-- own parts on "engine", and should not beat a genuinely better match on
-- some other query. 0.2 is enough to clear the gap between rows that all
-- merely contain the word, and not enough to jump a real match.
-- ---------------------------------------------------------------------
-- Dropped and recreated, not replaced: the returned columns change, and
-- the parameter list must stay exactly as 0003 declared it or this
-- becomes a second overload and every call is ambiguous.
drop function if exists public.search_parts(
  text, text[], text[], int, int, public.part_condition[], text[],
  public.part_status[], int, int);

create function public.search_parts(
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
  "trim"             text,
  vin_last6          text,
  mileage_km         int,
  exterior_colour    text,
  score              real,
  is_assembly        boolean,
  total_count        bigint
)
language sql
stable
security invoker
set search_path = public, extensions, pg_temp
as $fn$
  with toks as (
    select nullif(btrim(t), '') as t
    from unnest(string_to_array(lower(btrim(coalesce(p_query, ''))), ' ')) as t
  ),
  filtered as (
    select p.*, v.stock_number, v.year, v.make, v.model, v.trim,
           v.vin, v.mileage_km, v.exterior_colour,
           coalesce(pc.is_assembly, false) as is_assembly,
           case
             when btrim(coalesce(p_query, '')) = '' then 0::real
             else similarity(lower(btrim(p_query)), p.search_text)
           end as score
    from public.parts p
    join public.vehicles v on v.id = p.vehicle_id
    left join public.part_catalog pc on pc.id = p.catalog_id
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
         f.is_assembly,
         count(*) over () as total_count
  from filtered f
  order by
    -- Available first, then the complete unit ahead of its own pieces,
    -- then best textual match, then newest.
    (f.status = 'available') desc,
    (f.score + case when f.is_assembly then 0.2 else 0 end) desc,
    f.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0))
$fn$;
