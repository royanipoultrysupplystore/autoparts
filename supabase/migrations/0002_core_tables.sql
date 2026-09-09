-- =====================================================================
-- 0002  Core tables: vehicles, part_catalog, parts, sales, expenses, log
-- =====================================================================

-- ---------------------------------------------------------------------
-- vehicles
-- ---------------------------------------------------------------------
create sequence if not exists public.vehicle_stock_seq start with 1;

create table public.vehicles (
  id                           uuid primary key default gen_random_uuid(),
  stock_number                 text not null unique,
  vin                          text unique,
  year                         int  not null check (year between 1900 and 2100),
  make                         text not null,
  model                        text not null,
  trim                         text,
  body_type                    public.body_type,
  engine                       text,
  transmission                 public.transmission_type,
  drivetrain                   public.drivetrain_type,
  fuel_type                    public.fuel_type not null default 'gas',
  exterior_colour              text,
  mileage_km                   int check (mileage_km >= 0),
  purchase_date                date not null default (now() at time zone 'America/Vancouver')::date,
  source                       public.vehicle_source not null default 'icbc_auction',
  lot_number                   text,

  -- All money is integer CAD cents. Never floats.
  purchase_price_cents         bigint not null default 0 check (purchase_price_cents         >= 0),
  auction_fee_cents            bigint not null default 0 check (auction_fee_cents            >= 0),
  transport_cost_cents         bigint not null default 0 check (transport_cost_cents         >= 0),
  other_acquisition_cost_cents bigint not null default 0 check (other_acquisition_cost_cents >= 0),
  scrap_income_cents           bigint not null default 0 check (scrap_income_cents           >= 0),

  -- Generated so it can never drift from its parts.
  landed_cost_cents            bigint not null
    generated always as (
      purchase_price_cents + auction_fee_cents
      + transport_cost_cents + other_acquisition_cost_cents
    ) stored,

  status                       public.vehicle_status not null default 'parting_out',
  notes                        text,
  created_by                   uuid references public.profiles(id) on delete set null,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

comment on column public.vehicles.landed_cost_cents is
  'Generated: purchase + auction fee + transport + other acquisition cost.';

-- Human-friendly stock numbers: V-0001, V-0002, ...
create or replace function public.assign_stock_number()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if new.stock_number is null or new.stock_number = '' then
    new.stock_number := 'V-' || lpad(nextval('public.vehicle_stock_seq')::text, 4, '0');
  end if;
  return new;
end;
$fn$;

create trigger vehicles_assign_stock_number
  before insert on public.vehicles
  for each row execute function public.assign_stock_number();

-- ---------------------------------------------------------------------
-- part_catalog -- the master template, not tied to any vehicle
-- ---------------------------------------------------------------------
create table public.part_catalog (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  category      text not null,
  icon_key      text not null default 'generic-part',
  default_sides public.part_side[] not null default array['none']::public.part_side[],
  is_high_value boolean not null default false,
  sort_order    int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

comment on table public.part_catalog is
  'Template of every part an ICE vehicle can have. Renaming an entry here never rewrites history: parts snapshot their name at creation.';

-- ---------------------------------------------------------------------
-- parts -- the actual inventory rows
-- ---------------------------------------------------------------------
create table public.parts (
  id                 uuid primary key default gen_random_uuid(),
  vehicle_id         uuid not null references public.vehicles(id)     on delete cascade,
  catalog_id         uuid          references public.part_catalog(id) on delete set null,

  -- Snapshots taken at creation. Catalog edits must never rewrite history.
  name               text not null,
  category           text not null,
  icon_key           text not null default 'generic-part',

  side               public.part_side      not null default 'none',
  condition          public.part_condition not null default 'B',
  status             public.part_status    not null default 'available',
  asking_price_cents bigint not null default 0 check (asking_price_cents >= 0),
  shelf_location     text,
  notes              text,

  -- Storefront plumbing, live from day one.
  is_public          boolean not null default false,
  public_price_cents bigint check (public_price_cents >= 0),
  slug               text unique,

  -- Reservation bookkeeping (48h auto-expiry).
  reserved_by        uuid references public.profiles(id) on delete set null,
  reserved_for_name  text,
  reserved_at        timestamptz,
  reserved_until     timestamptz,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- One physical part per vehicle / catalog entry / side.
create unique index parts_vehicle_catalog_side_key
  on public.parts (vehicle_id, catalog_id, side)
  where catalog_id is not null;

-- ---------------------------------------------------------------------
-- sales -- one sale per part, enforced by the unique key
-- ---------------------------------------------------------------------
create table public.sales (
  id               uuid primary key default gen_random_uuid(),
  part_id          uuid not null unique references public.parts(id)    on delete cascade,
  vehicle_id       uuid not null        references public.vehicles(id) on delete cascade,
  sold_by          uuid                 references public.profiles(id) on delete set null,
  sale_price_cents bigint not null check (sale_price_cents >= 0),
  sale_date        date not null default (now() at time zone 'America/Vancouver')::date,
  payment_method   public.payment_method not null default 'cash',
  buyer_name       text,
  buyer_contact    text,
  channel          public.sale_channel not null default 'facebook',
  notes            text,
  created_at       timestamptz not null default now()
);

comment on constraint sales_part_id_key on public.sales is
  'Hard guarantee that a part can never be sold twice.';

-- ---------------------------------------------------------------------
-- expenses
-- ---------------------------------------------------------------------
create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  scope        public.expense_scope not null default 'business',
  vehicle_id   uuid references public.vehicles(id) on delete cascade,
  category     public.expense_category not null default 'misc',
  amount_cents bigint not null check (amount_cents > 0),
  expense_date date not null default (now() at time zone 'America/Vancouver')::date,
  paid_by      uuid references public.profiles(id) on delete set null,
  note         text,
  receipt_url  text,
  created_at   timestamptz not null default now(),

  constraint expenses_scope_vehicle_ck check (
    (scope = 'vehicle'  and vehicle_id is not null) or
    (scope = 'business' and vehicle_id is null)
  )
);

-- ---------------------------------------------------------------------
-- activity_log -- four people share this data, they need to see who did what
-- ---------------------------------------------------------------------
create table public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete set null,
  entity_type text not null,
  entity_id   uuid,
  action      text not null,
  summary     text not null,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

create trigger vehicles_touch_updated_at
  before update on public.vehicles
  for each row execute function public.touch_updated_at();

create trigger parts_touch_updated_at
  before update on public.parts
  for each row execute function public.touch_updated_at();
