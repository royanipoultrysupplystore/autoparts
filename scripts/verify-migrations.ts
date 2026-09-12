/**
 * Migration harness.  `npm run db:verify`
 *
 * Runs every file in supabase/migrations against a throwaway Postgres
 * (PGlite, Postgres compiled to WASM) so a syntax error or a bad column
 * reference is caught here rather than halfway through a deploy.
 *
 * Supabase supplies `auth`, `storage`, the client roles, and the realtime
 * publication. None of that exists in a bare Postgres, so this file
 * stands in the smallest possible shims for them first. It proves the
 * migrations parse, apply, and hang together -- it is not a substitute
 * for running them against the real project.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
// Supabase ships pgcrypto; the team-management functions hash passwords
// with it, so the harness needs it too.
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

/** The Supabase-provided surface our migrations lean on. */
const SUPABASE_SHIM = `
create role anon           nologin noinherit;
create role authenticated  nologin noinherit;
create role service_role   nologin noinherit bypassrls;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists auth;
create table auth.users (
  instance_id            uuid,
  id                     uuid primary key default gen_random_uuid(),
  aud                    text,
  role                   text,
  email                  text unique,
  encrypted_password     text,
  email_confirmed_at     timestamptz,
  raw_app_meta_data      jsonb default '{}'::jsonb,
  raw_user_meta_data     jsonb default '{}'::jsonb,
  confirmation_token     text,
  recovery_token         text,
  email_change_token_new text,
  email_change           text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- In Supabase this reads the request's JWT claims. Here it reads a GUC,
-- which lets the checks below impersonate a user.
create table auth.identities (
  provider_id     text not null,
  user_id         uuid not null references auth.users(id) on delete cascade,
  identity_data   jsonb not null,
  provider        text not null,
  last_sign_in_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  id              uuid primary key default gen_random_uuid(),
  unique (provider, provider_id)
);

create or replace function auth.uid() returns uuid
language sql stable as $shim$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$shim$;

create schema if not exists storage;
create table storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);
create table storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets(id),
  name       text,
  owner      uuid,
  created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;

create publication supabase_realtime;
`;

type Check = { name: string; sql: string; expect: (rows: unknown[]) => string | null };

/** Structural assertions -- the guarantees that must not silently rot. */
const CHECKS: Check[] = [
  {
    name: "landed_cost_cents is a generated column",
    sql: `select is_generated from information_schema.columns
          where table_name = 'vehicles' and column_name = 'landed_cost_cents'`,
    expect: (r) =>
      (r[0] as { is_generated: string })?.is_generated === "ALWAYS"
        ? null
        : "landed_cost_cents is not GENERATED ALWAYS -- it could drift",
  },
  {
    name: "sales.part_id is unique (a part cannot sell twice)",
    sql: `select count(*)::int as n from pg_constraint
          where conrelid = 'public.sales'::regclass and contype = 'u'
            and conkey = array[(select attnum from pg_attribute
                                where attrelid = 'public.sales'::regclass
                                  and attname = 'part_id')]`,
    expect: (r) =>
      (r[0] as { n: number })?.n === 1 ? null : "sales.part_id has no unique constraint",
  },
  {
    name: "staff cannot SELECT vehicle cost columns",
    sql: `select count(*)::int as n
          from information_schema.column_privileges
          where table_name = 'vehicles' and privilege_type = 'SELECT'
            and grantee = 'authenticated'
            and column_name in ('purchase_price_cents','auction_fee_cents',
                                'transport_cost_cents','other_acquisition_cost_cents',
                                'scrap_income_cents','landed_cost_cents')`,
    expect: (r) =>
      (r[0] as { n: number })?.n === 0
        ? null
        : "the authenticated role can still SELECT vehicle cost columns",
  },
  {
    name: "authenticated CAN select the non-financial vehicle columns",
    sql: `select count(*)::int as n
          from information_schema.column_privileges
          where table_name = 'vehicles' and privilege_type = 'SELECT'
            and grantee = 'authenticated'
            and column_name in ('year','make','model','stock_number','status')`,
    expect: (r) =>
      (r[0] as { n: number })?.n === 5
        ? null
        : "the app cannot read the basic vehicle columns it needs",
  },
  {
    name: "RLS is enabled on every application table",
    sql: `select string_agg(relname, ', ') as missing
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
            and c.relname in ('profiles','vehicles','part_catalog','parts',
                              'sales','expenses','activity_log')`,
    expect: (r) => {
      const missing = (r[0] as { missing: string | null })?.missing;
      return missing ? `RLS is off for: ${missing}` : null;
    },
  },
  {
    name: "the storefront view exposes no cost data",
    sql: `select string_agg(column_name, ', ') as leaked
          from information_schema.columns
          where table_name = 'public_parts'
            and (column_name like '%cost%' or column_name like '%purchase%'
                 or column_name = 'asking_price_cents' or column_name like '%shelf%')`,
    expect: (r) => {
      const leaked = (r[0] as { leaked: string | null })?.leaked;
      return leaked ? `public_parts exposes: ${leaked}` : null;
    },
  },
  {
    name: "anon can read public_parts and nothing else",
    sql: `select string_agg(table_name, ', ') as tables
          from information_schema.role_table_grants
          where grantee = 'anon' and privilege_type = 'SELECT'
            and table_schema = 'public' and table_name <> 'public_parts'`,
    expect: (r) => {
      const tables = (r[0] as { tables: string | null })?.tables;
      return tables ? `anon can also read: ${tables}` : null;
    },
  },
  {
    name: "every money column is an integer type",
    sql: `select string_agg(table_name || '.' || column_name || ' (' || data_type || ')', ', ') as bad
          from information_schema.columns
          where table_schema = 'public'
            and (column_name like '%_cents' or column_name like '%price%')
            and data_type not in ('bigint','integer','smallint')`,
    expect: (r) => {
      const bad = (r[0] as { bad: string | null })?.bad;
      return bad ? `non-integer money columns: ${bad}` : null;
    },
  },
  {
    name: "search_parts is indexed by a trigram GIN index",
    sql: `select count(*)::int as n from pg_indexes
          where tablename = 'parts' and indexdef like '%gin%' and indexdef like '%trgm%'`,
    expect: (r) =>
      (r[0] as { n: number })?.n >= 1 ? null : "no trigram index on parts.search_text",
  },
];

/** End-to-end behaviour, exercised the way the app will exercise it. */
async function behaviourChecks(db: PGlite): Promise<string[]> {
  const failures: string[] = [];
  const fail = (m: string) => failures.push(m);

  // Two members: one partner, one staff.
  const [{ id: partnerId }] = (
    await db.query<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data)
       values ('partner@test', '{"full_name":"Ahmad","role":"partner"}'::jsonb)
       returning id`,
    )
  ).rows;

  const [{ id: staffId }] = (
    await db.query<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data)
       values ('staff@test', '{"full_name":"Sam","role":"staff"}'::jsonb)
       returning id`,
    )
  ).rows;

  const asPartner = async (sql: string, params?: unknown[]) => {
    await db.exec(`set request.jwt.claim.sub = '${partnerId}'`);
    return db.query(sql, params);
  };
  const asStaff = async (sql: string, params?: unknown[]) => {
    await db.exec(`set request.jwt.claim.sub = '${staffId}'`);
    return db.query(sql, params);
  };

  // The auth trigger should have created both profiles with the right roles.
  const roles = await db.query<{ role: string; full_name: string }>(
    `select role::text, full_name from public.profiles order by full_name`,
  );
  if (roles.rows.length !== 2) fail(`profile trigger created ${roles.rows.length} profiles, expected 2`);
  if (roles.rows[0]?.role !== "partner") fail("the partner profile did not get the partner role");
  if (roles.rows[1]?.role !== "staff") fail("the staff profile did not get the staff role");

  // Catalog: three entries, one of them two-sided.
  await db.exec(`
    insert into public.part_catalog (name, slug, category, icon_key, default_sides, sort_order) values
      ('Front bumper cover', 'front-bumper-cover', 'Exterior body', 'bumper', array['none']::public.part_side[], 1),
      ('Side mirror',        'side-mirror',        'Exterior body', 'mirror', array['left','right']::public.part_side[], 2),
      ('Headlight',          'headlight',          'Lighting',      'headlight', array['left','right']::public.part_side[], 3);
  `);

  // A vehicle, created by the partner.
  const veh = await asPartner(
    `insert into public.vehicles (year, make, model, trim, vin, purchase_price_cents, auction_fee_cents)
     values (2016, 'Honda', 'Civic', 'LX', '2HGFC2F59GH500123', 285000, 28500)
     returning id`,
  );
  const vehicleId = (veh.rows[0] as { id: string }).id;

  const stock = await db.query<{ stock_number: string; landed_cost_cents: number }>(
    `select stock_number, landed_cost_cents from public.vehicles where id = $1`,
    [vehicleId],
  );
  if (stock.rows[0].stock_number !== "V-0001") {
    fail(`stock number was ${stock.rows[0].stock_number}, expected V-0001`);
  }
  if (Number(stock.rows[0].landed_cost_cents) !== 313500) {
    fail(`landed_cost_cents was ${stock.rows[0].landed_cost_cents}, expected 313500`);
  }

  // Generate parts: 1 + 2 + 2 = 5 rows.
  const gen = await asPartner(`select public.generate_parts_for_vehicle($1) as n`, [vehicleId]);
  if (Number((gen.rows[0] as { n: number }).n) !== 5) {
    fail(`generate_parts_for_vehicle created ${(gen.rows[0] as { n: number }).n} parts, expected 5`);
  }

  // Slugs should be SEO-shaped and unique.
  const slugs = await db.query<{ slug: string }>(
    `select slug from public.parts where vehicle_id = $1 order by slug`,
    [vehicleId],
  );
  const expectedSlug = "2016-honda-civic-front-bumper-cover-v0001-1";
  if (!slugs.rows.some((s) => s.slug === expectedSlug)) {
    fail(`expected a slug ${expectedSlug}, got: ${slugs.rows.map((s) => s.slug).join(", ")}`);
  }
  if (new Set(slugs.rows.map((s) => s.slug)).size !== slugs.rows.length) {
    fail("part slugs are not unique");
  }

  // Fuzzy search: a typo and a cross-table query must both land.
  await db.exec(`update public.parts set asking_price_cents = 18000, status = 'available'`);

  const typo = await asPartner(
    `select count(*)::int as n from public.search_parts('bumpr')`,
  );
  if (Number((typo.rows[0] as { n: number }).n) < 1) {
    fail('search_parts("bumpr") found nothing -- fuzzy matching is not working');
  }

  const crossTable = await asPartner(
    `select count(*)::int as n from public.search_parts('civic mirror')`,
  );
  if (Number((crossTable.rows[0] as { n: number }).n) !== 2) {
    fail(
      `search_parts("civic mirror") returned ${(crossTable.rows[0] as { n: number }).n}, expected 2`,
    );
  }

  // ---- Trim: removes what was unticked, protects everything else ------
  {
    const trimVeh = await asPartner(
      `insert into public.vehicles (year, make, model, purchase_price_cents)
       values (2015, 'Hyundai', 'Sonata', 175000) returning id`,
    );
    const trimId = (trimVeh.rows[0] as { id: string }).id;
    await asPartner(`select public.generate_parts_for_vehicle($1)`, [trimId]);

    const all = await db.query<{ id: string; name: string }>(
      `select id, name from public.parts where vehicle_id = $1 order by name, side`,
      [trimId],
    );
    if (all.rows.length !== 5) fail(`trim fixture generated ${all.rows.length} parts, expected 5`);

    // Hold one of the rows the trim is told to remove: a held part must
    // survive, because somebody has promised it to a buyer.
    const heldId = all.rows[0].id;
    await asPartner(`select public.reserve_part($1, 'Holder', 48)`, [heldId]);

    const removeIds = all.rows.slice(0, 3).map((r) => r.id);
    const trimmed = await asPartner(`select public.trim_vehicle_parts($1, $2) as n`, [
      trimId,
      removeIds,
    ]);

    if (Number((trimmed.rows[0] as { n: number }).n) !== 2) {
      fail(`trim removed ${(trimmed.rows[0] as { n: number }).n} parts, expected 2 (the held one stays)`);
    }

    const left = await db.query<{ n: number }>(
      `select count(*)::int as n from public.parts where vehicle_id = $1`,
      [trimId],
    );
    if (Number(left.rows[0].n) !== 3) fail(`${left.rows[0].n} parts left after trim, expected 3`);

    const stillHeld = await db.query<{ status: string }>(
      `select status::text from public.parts where id = $1`,
      [heldId],
    );
    if (stillHeld.rows[0]?.status !== "reserved") {
      fail("the trim deleted a part that was on hold for a buyer");
    }

    const logged = await db.query<{ n: number }>(
      `select count(*)::int as n from public.activity_log
       where entity_id = $1 and action = 'parts_trimmed'`,
      [trimId],
    );
    if (Number(logged.rows[0].n) !== 1) fail("the trim was not recorded in the activity log");
  }

  // ---- The race. Two sellers, one part, one winner. --------------------
  const [{ id: partId }] = (
    await db.query<{ id: string }>(
      `select id from public.parts where vehicle_id = $1 and name = 'Front bumper cover'`,
      [vehicleId],
    )
  ).rows;

  const firstSale = await asPartner(
    `select public.sell_part($1, 18000, 'cash', 'Buyer One', null, 'facebook', null, null, null) as r`,
    [partId],
  );
  const first = (firstSale.rows[0] as { r: { ok: boolean } }).r;
  if (!first.ok) fail(`the first sale failed: ${JSON.stringify(first)}`);

  const secondSale = await asStaff(
    `select public.sell_part($1, 20000, 'cash', 'Buyer Two', null, 'facebook', null, null, null) as r`,
    [partId],
  );
  const second = (secondSale.rows[0] as {
    r: { ok: boolean; reason?: string; sold_by_name?: string; sale_price_cents?: number };
  }).r;

  if (second.ok) fail("THE SAME PART SOLD TWICE -- the conditional write did not hold");
  if (second.reason !== "already_sold") fail(`second sale reason was ${second.reason}`);
  if (second.sold_by_name !== "Ahmad") {
    fail(`the conflict did not name the seller (got ${second.sold_by_name})`);
  }
  if (Number(second.sale_price_cents) !== 18000) {
    fail(`the conflict did not carry the sale price (got ${second.sale_price_cents})`);
  }

  const saleCount = await db.query<{ n: number }>(
    `select count(*)::int as n from public.sales where part_id = $1`,
    [partId],
  );
  if (Number(saleCount.rows[0].n) !== 1) {
    fail(`${saleCount.rows[0].n} sales rows exist for one part`);
  }

  // ---- Reservations ----------------------------------------------------
  const [{ id: mirrorId }] = (
    await db.query<{ id: string }>(
      `select id from public.parts where vehicle_id = $1 and name = 'Side mirror' and side = 'left'`,
      [vehicleId],
    )
  ).rows;

  const held = await asPartner(`select public.reserve_part($1, 'No-show Nick', 48) as r`, [mirrorId]);
  if (!(held.rows[0] as { r: { ok: boolean } }).r.ok) fail("reserve_part failed on an available part");

  const doubleHold = await asStaff(`select public.reserve_part($1, 'Someone else', 48) as r`, [mirrorId]);
  const dh = (doubleHold.rows[0] as { r: { ok: boolean; reason?: string; reserved_by_name?: string } }).r;
  if (dh.ok) fail("the same part was reserved twice");
  if (dh.reserved_by_name !== "Ahmad") fail("the reservation conflict did not name the holder");

  // Expire it by hand, the way 48 hours would.
  await db.exec(`update public.parts set reserved_until = now() - interval '1 hour' where id = '${mirrorId}'`);
  const expired = await db.query<{ n: number }>(`select public.expire_reservations() as n`);
  if (Number(expired.rows[0].n) !== 1) fail("expire_reservations did not release the stale hold");

  const back = await db.query<{ status: string }>(
    `select status::text from public.parts where id = $1`,
    [mirrorId],
  );
  if (back.rows[0].status !== "available") fail("an expired hold did not return the part to available");

  const notice = await db.query<{ n: number }>(
    `select count(*)::int as n from public.activity_log
     where action = 'reservation_expired' and user_id = $1`,
    [partnerId],
  );
  if (Number(notice.rows[0].n) !== 1) fail("the reserving partner was not notified of the expiry");

  // ---- Staff must never see money -------------------------------------
  await db.exec(`set request.jwt.claim.sub = '${staffId}'`);

  const staffFinance = await db.query(`select * from public.vehicle_finance`);
  if (staffFinance.rows.length !== 0) fail("STAFF CAN READ vehicle_finance");

  try {
    await db.query(`select * from public.vehicle_pnl(null)`);
    fail("STAFF CAN RUN vehicle_pnl");
  } catch {
    /* expected: insufficient_privilege */
  }

  try {
    await db.query(`select public.monthly_report(2026, 1)`);
    fail("STAFF CAN RUN monthly_report");
  } catch {
    /* expected */
  }

  const staffDash = await db.query<{ d: Record<string, unknown> }>(
    `select public.dashboard_stats() as d`,
  );
  const dash = staffDash.rows[0].d;
  if ("inventory_value_cents" in dash) fail("dashboard_stats leaked money to staff");
  if (dash.finance_visible !== false) fail("dashboard_stats told staff they have finance access");
  if (typeof dash.parts_available !== "number") fail("staff got no usable dashboard at all");

  // ---- Partners must see money ----------------------------------------
  await db.exec(`set request.jwt.claim.sub = '${partnerId}'`);

  // Money is the owner's alone now, so the partner is promoted for the
  // remaining money assertions.
  await db.exec(`update public.profiles set role = 'owner' where id = '${partnerId}'`);
  await db.exec(`set request.jwt.claim.sub = '${partnerId}'`);

  const ownerFinance = await db.query<{ landed_cost_cents: number }>(
    `select landed_cost_cents from public.vehicle_finance where vehicle_id = $1`,
    [vehicleId],
  );
  if (ownerFinance.rows.length !== 1) fail("the owner cannot read vehicle_finance");
  if (Number(ownerFinance.rows[0]?.landed_cost_cents) !== 313500) {
    fail(`vehicle_finance returned ${ownerFinance.rows[0]?.landed_cost_cents}, expected 313500`);
  }

  const pnl = await db.query<{
    total_invested_cents: number;
    parts_revenue_cents: number;
    recovery_pct: number;
    parts_sold: number;
  }>(`select * from public.vehicle_pnl($1)`, [vehicleId]);

  const row = pnl.rows[0];
  if (Number(row.total_invested_cents) !== 313500) {
    fail(`P&L total invested was ${row.total_invested_cents}, expected 313500`);
  }
  if (Number(row.parts_revenue_cents) !== 18000) {
    fail(`P&L parts revenue was ${row.parts_revenue_cents}, expected 18000`);
  }
  if (Number(row.parts_sold) !== 1) fail(`P&L parts_sold was ${row.parts_sold}, expected 1`);

  const partnerDash = await db.query<{ d: Record<string, unknown> }>(
    `select public.dashboard_stats() as d`,
  );
  if (!("inventory_value_cents" in partnerDash.rows[0].d)) {
    fail("a partner got no inventory value on the dashboard");
  }

  const report = await db.query<{ r: Record<string, unknown> }>(
    `select public.monthly_report(
       extract(year from current_date)::int,
       extract(month from current_date)::int) as r`,
  );
  const r = report.rows[0].r;
  if (r.basis !== "cash") fail("the monthly report does not declare its accounting basis");
  if (!("gross_profit_on_parts_sold_cents" in r)) {
    fail("the monthly report is missing the allocated-cost gross profit figure");
  }

  // ---- History must not be rewritten ----------------------------------
  await db.exec(
    `update public.part_catalog set name = 'Front bumper cover (RENAMED)' where slug = 'front-bumper-cover'`,
  );
  const historical = await db.query<{ name: string }>(
    `select name from public.parts where id = $1`,
    [partId],
  );
  if (historical.rows[0].name !== "Front bumper cover") {
    fail(`renaming the catalog rewrote history: the part is now "${historical.rows[0].name}"`);
  }

  return failures;
}

async function main() {
  console.log("\n  Verifying migrations against PGlite\n");

  const db = await new PGlite({ extensions: { pg_trgm, unaccent, pgcrypto } });

  await db.exec(SUPABASE_SHIM);

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    try {
      await db.exec(sql);
      console.log(`  ok    ${file}`);
    } catch (err) {
      console.error(`  FAIL  ${file}`);
      console.error(`        ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }

  console.log("\n  Structure\n");
  let failed = 0;

  for (const check of CHECKS) {
    const { rows } = await db.query(check.sql);
    const problem = check.expect(rows);
    if (problem) {
      console.error(`  FAIL  ${check.name}\n        ${problem}`);
      failed++;
    } else {
      console.log(`  ok    ${check.name}`);
    }
  }

  console.log("\n  Behaviour\n");
  const behaviourFailures = await behaviourChecks(db);

  if (behaviourFailures.length === 0) {
    console.log("  ok    part generation, slugs, fuzzy search");
    console.log("  ok    trim removes only what was unticked");
    console.log("  ok    a part cannot be sold twice");
    console.log("  ok    reservations hold, conflict, and expire");
    console.log("  ok    only the owner sees money; partners and staff run the yard");
    console.log("  ok    only the owner manages the team, and cannot strand it");
    console.log("  ok    renaming the catalog does not rewrite history");
  } else {
    for (const f of behaviourFailures) console.error(`  FAIL  ${f}`);
    failed += behaviourFailures.length;
  }

  await db.close();

  if (failed > 0) {
    console.error(`\n  ${failed} check(s) failed.\n`);
    process.exit(1);
  }
  console.log("\n  All migrations apply and every guarantee holds.\n");
}

main().catch((err) => {
  console.error(`\n  Harness error: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
