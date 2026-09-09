-- =====================================================================
-- 0007  Storefront plumbing, Realtime, and receipt storage
-- =====================================================================

-- ---------------------------------------------------------------------
-- Public storefront read model.
--
-- This is the ONLY object anonymous visitors can read. It exposes
-- published parts and nothing else: no costs, no shelf location, no VIN,
-- no notes, no internal asking price. When the storefront flag is
-- flipped on, there is no financial surface to leak.
-- ---------------------------------------------------------------------
create view public.public_parts
with (security_invoker = false) as
  select
    p.id,
    p.slug,
    p.name,
    p.category,
    p.icon_key,
    p.side,
    p.condition,
    p.public_price_cents,
    v.year,
    v.make,
    v.model,
    v.trim,
    v.body_type,
    v.exterior_colour,
    p.updated_at
  from public.parts p
  join public.vehicles v on v.id = p.vehicle_id
  where p.is_public
    and p.status = 'available'
    and p.public_price_cents is not null;

grant select on public.public_parts to anon, authenticated;

comment on view public.public_parts is
  'Read model for /shop. Published, available parts only. Contains no cost or internal data.';

-- Storefront search, same trigram treatment, anonymous-safe.
create or replace function public.search_public_parts(
  p_query  text default '',
  p_limit  int default 48,
  p_offset int default 0
)
returns table (
  id                 uuid,
  slug               text,
  name               text,
  category           text,
  icon_key           text,
  side               public.part_side,
  condition          public.part_condition,
  public_price_cents bigint,
  year               int,
  make               text,
  model              text,
  "trim"               text,
  exterior_colour    text,
  total_count        bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with toks as (
    select nullif(btrim(t), '') as t
    from unnest(string_to_array(lower(btrim(coalesce(p_query, ''))), ' ')) as t
  ),
  matched as (
    select pp.*, p.search_text
    from public.public_parts pp
    join public.parts p on p.id = pp.id
    where btrim(coalesce(p_query, '')) = ''
       or not exists (
         select 1 from toks
         where toks.t is not null
           and p.search_text not like '%' || toks.t || '%'
           and word_similarity(toks.t, p.search_text) < 0.55
       )
  )
  select m.id, m.slug, m.name, m.category, m.icon_key, m.side, m.condition,
         m.public_price_cents, m.year, m.make, m.model, m.trim, m.exterior_colour,
         count(*) over () as total_count
  from matched m
  order by m.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 48), 96))
  offset greatest(0, coalesce(p_offset, 0));
$fn$;

grant execute on function public.search_public_parts(text, int, int) to anon, authenticated;

-- ---------------------------------------------------------------------
-- publish_parts / unpublish_parts -- the bulk action in the vehicle view
-- ---------------------------------------------------------------------
create or replace function public.publish_parts(
  p_part_ids uuid[],
  p_publish  boolean default true
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_count integer;
begin
  if not public.has_finance_access() then
    raise exception 'Only owners and partners can publish parts'
      using errcode = 'insufficient_privilege';
  end if;

  update public.parts p
     set is_public = p_publish,
         -- Default the public price to the asking price on first publish
         -- so nothing is ever listed without a number on it.
         public_price_cents = case
           when p_publish then coalesce(p.public_price_cents, nullif(p.asking_price_cents, 0))
           else p.public_price_cents
         end
   where p.id = any(p_part_ids);

  get diagnostics v_count = row_count;

  perform public.log_activity(
    'part', null,
    case when p_publish then 'published' else 'unpublished' end,
    format('%s %s parts on the storefront',
           case when p_publish then 'Published' else 'Unpublished' end, v_count),
    null, jsonb_build_object('count', v_count)
  );

  return v_count;
end;
$fn$;

-- ---------------------------------------------------------------------
-- Realtime: a status change has to push to the other three phones.
-- REPLICA IDENTITY FULL so subscribers receive the previous row too.
-- ---------------------------------------------------------------------
alter table public.parts replica identity full;

do $do$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'parts'
    ) then
      execute 'alter publication supabase_realtime add table public.parts';
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activity_log'
    ) then
      execute 'alter publication supabase_realtime add table public.activity_log';
    end if;
  end if;
end
$do$;

-- ---------------------------------------------------------------------
-- Receipt storage
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts', 'receipts', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/heic','application/pdf']
)
on conflict (id) do nothing;

create policy receipts_read_finance on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and public.has_finance_access());

create policy receipts_insert_finance on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and public.has_finance_access());

create policy receipts_delete_finance on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and public.has_finance_access());
