-- =====================================================================
-- 0018  The assembly boost is for searching, not for browsing
--
-- 0015 pushed a complete unit above its own pieces, so that searching
-- "engine" leads with the engine rather than three engine blocks. With
-- nothing typed in the box, though, every score is zero and that boost
-- was the only thing sorting the list -- so browsing sold stock put an
-- automatic transmission sold last week above everything sold yesterday.
--
-- The boost answers "which of these matches best". With no query there is
-- no match to be best at, and the honest order is the most recent sale
-- first. So it now applies only when something was actually typed.
-- =====================================================================

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
  p_offset     int default 0,
  p_sold_from  date default null,
  p_sold_to    date default null
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
  sold_on            date,
  sold_for_cents     bigint,
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
           s.sale_date        as sold_on,
           s.sale_price_cents as sold_for_cents,
           case
             when btrim(coalesce(p_query, '')) = '' then 0::real
             else similarity(lower(btrim(p_query)), p.search_text)
           end as score
    from public.parts p
    join public.vehicles v on v.id = p.vehicle_id
    left join public.part_catalog pc on pc.id = p.catalog_id
    -- The live sale, so a part sold, returned and sold again shows the
    -- sale it is actually on.
    left join public.sales s on s.part_id = p.id and s.returned_at is null
    where (p_statuses   is null or p.status    = any(p_statuses))
      and (p_conditions is null or p.condition = any(p_conditions))
      and (p_categories is null or p.category  = any(p_categories))
      and (p_makes      is null or lower(v.make)  = any(select lower(m) from unnest(p_makes)  m))
      and (p_models     is null or lower(v.model) = any(select lower(m) from unnest(p_models) m))
      and (p_year_min   is null or v.year >= p_year_min)
      and (p_year_max   is null or v.year <= p_year_max)
      -- A sold-between window asks about sales, so it excludes anything
      -- that never sold rather than quietly keeping it.
      and (p_sold_from  is null or s.sale_date >= p_sold_from)
      and (p_sold_to    is null or s.sale_date <= p_sold_to)
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
         f.sold_on,
         f.sold_for_cents,
         count(*) over () as total_count
  from filtered f
  order by
    -- Available first, then the complete unit ahead of its own pieces,
    -- then best textual match.
    (f.status = 'available') desc,
    (f.score + case
                when f.is_assembly and btrim(coalesce(p_query, '')) <> '' then 0.2
                else 0
              end) desc,
    -- Then the most recent sale. With nothing typed every score is zero,
    -- so this is what actually orders a browse of sold stock -- which is
    -- the whole point: the last thing sold is the thing being asked
    -- about.
    f.sold_on desc nulls last,
    f.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0))
$fn$;
