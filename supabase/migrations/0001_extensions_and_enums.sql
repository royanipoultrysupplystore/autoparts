-- =====================================================================
-- 0001  Extensions, enum types, and role helpers
-- =====================================================================

-- pg_trgm powers the fuzzy part search; unaccent normalises slugs.
-- gen_random_uuid() is core in Postgres 13+, so pgcrypto is not needed.
create extension if not exists "pg_trgm"  with schema public;
create extension if not exists "unaccent" with schema public;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.user_role        as enum ('owner', 'partner', 'staff');

create type public.body_type        as enum ('sedan','coupe','hatchback','suv','truck','van','wagon');
create type public.transmission_type as enum ('auto','manual');
create type public.drivetrain_type  as enum ('fwd','rwd','awd','4wd');
create type public.fuel_type        as enum ('gas','diesel','hybrid');
create type public.vehicle_source   as enum ('icbc_auction','private','other');
create type public.vehicle_status   as enum ('incoming','parting_out','depleted','scrapped');

create type public.part_side        as enum (
  'none','left','right','front','rear',
  'front_left','front_right','rear_left','rear_right'
);
create type public.part_condition   as enum ('A','B','C','damaged');
create type public.part_status      as enum ('available','reserved','sold','kept','scrapped');

create type public.payment_method   as enum ('cash','etransfer','other');
create type public.sale_channel     as enum ('facebook','walk_in','phone','referral','other');

create type public.expense_scope    as enum ('vehicle','business');
create type public.expense_category as enum (
  'towing','teardown_labour','parts_cleaning','rent','utilities',
  'insurance','tools','fuel','advertising','software','misc'
);

-- ---------------------------------------------------------------------
-- profiles  (extends auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  phone       text,
  role        public.user_role not null default 'staff',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.profiles is
  'Application profile for each auth user. role drives every permission decision.';

-- ---------------------------------------------------------------------
-- Role helpers.
--
-- SECURITY DEFINER so that policies on `profiles` itself can call them
-- without recursing through their own RLS.
-- ---------------------------------------------------------------------
create or replace function public.current_role_name()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active
$$;

-- owner + partner see money. staff never does.
create or replace function public.has_finance_access()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_role_name() in ('owner','partner'), false)
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_role_name() = 'owner', false)
$$;

-- Any active member of the business.
create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active
  )
$$;

-- ---------------------------------------------------------------------
-- Auto-create a profile whenever an auth user is created.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'phone',
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'staff')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
