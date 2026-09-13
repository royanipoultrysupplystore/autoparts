/**
 * Live guarantee check.  `npm run db:check`
 *
 * The PGlite harness proves the migrations apply and hang together, but
 * it shims `auth`, `storage`, and the client roles. This runs the same
 * guarantees against the real project, as the real roles, through the
 * real auth trigger.
 *
 * Everything happens inside one transaction that is ALWAYS rolled back,
 * so it is safe against a database with live data in it: no vehicle, no
 * part, and no sale it creates survives the run.
 */

import type pg from "pg";
import { connect } from "./db";

let failures = 0;
let passes = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passes += 1;
    console.log(`  ok    ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}

/**
 * Runs a statement that is EXPECTED to be refused, and reports whether it
 * was. A raised error aborts the surrounding transaction, so the attempt
 * is wrapped in a savepoint: rolling back to it is legal even once the
 * transaction is in an aborted state, and it also undoes the role change.
 */
async function expectRefused(
  db: pg.Client,
  userId: string,
  sql: string,
  params: unknown[] = [],
): Promise<boolean> {
  await db.query("savepoint expect_refusal");

  let refused = false;
  try {
    await db.query(`set local role authenticated`);
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    await db.query(sql, params);
  } catch {
    refused = true;
  }

  await db.query("rollback to savepoint expect_refusal");
  await db.query("release savepoint expect_refusal");
  await db.query("reset role");

  return refused;
}

/** Runs a block as a signed-in user, exactly as PostgREST would. */
async function asUser<T>(db: pg.Client, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.query(`set local role authenticated`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
  try {
    return await fn();
  } finally {
    await db.query(`reset role`);
  }
}

async function structure(db: pg.Client) {
  console.log("\n  Structure\n");

  const one = async (sql: string, params: unknown[] = []) =>
    (await db.query(sql, params)).rows[0] as Record<string, unknown>;

  const gen = await one(
    `select is_generated from information_schema.columns
      where table_name = 'vehicles' and column_name = 'landed_cost_cents'`,
  );
  check("landed_cost_cents is a generated column", gen?.is_generated === "ALWAYS");

  const unique = await one(
    `select count(*)::int as n from pg_constraint
      where conrelid = 'public.sales'::regclass and contype = 'u'
        and conkey = array[(select attnum from pg_attribute
                            where attrelid = 'public.sales'::regclass and attname = 'part_id')]`,
  );
  check("a part can only ever have one sale row", unique?.n === 1);

  const costGrants = await one(
    `select count(*)::int as n from information_schema.column_privileges
      where table_name = 'vehicles' and privilege_type = 'SELECT' and grantee = 'authenticated'
        and column_name in ('purchase_price_cents','auction_fee_cents','transport_cost_cents',
                            'other_acquisition_cost_cents','scrap_income_cents',
                            'sale_price_cents','landed_cost_cents')`,
  );
  check("cost columns are revoked from authenticated", costGrants?.n === 0);

  const basicGrants = await one(
    `select count(*)::int as n from information_schema.column_privileges
      where table_name = 'vehicles' and privilege_type = 'SELECT' and grantee = 'authenticated'
        and column_name in ('year','make','model','stock_number','status')`,
  );
  check("the app can still read the basic vehicle columns", basicGrants?.n === 5);

  const rls = await one(
    `select coalesce(string_agg(relname, ', '), '') as missing
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
        and c.relname in ('profiles','vehicles','part_catalog','parts','sales','expenses','activity_log')`,
  );
  check("RLS is on for every application table", rls?.missing === "", String(rls?.missing));

  const anonReach = await one(
    `select coalesce(string_agg(table_name, ', '), '') as tables
       from information_schema.role_table_grants
      where grantee = 'anon' and privilege_type = 'SELECT' and table_schema = 'public'
        and table_name <> 'public_parts'`,
  );
  check("anon can read public_parts and nothing else", anonReach?.tables === "", String(anonReach?.tables));

  const floats = await one(
    `select coalesce(string_agg(table_name || '.' || column_name, ', '), '') as bad
       from information_schema.columns
      where table_schema = 'public'
        and (column_name like '%_cents' or column_name like '%price%')
        and data_type not in ('bigint','integer','smallint')`,
  );
  check("every money column is an integer type", floats?.bad === "", String(floats?.bad));

  const trgm = await one(
    `select count(*)::int as n from pg_indexes
      where tablename = 'parts' and indexdef like '%gin%' and indexdef like '%trgm%'`,
  );
  check("parts.search_text has a trigram GIN index", (trgm?.n as number) >= 1);

  const ext = await one(
    `select coalesce(string_agg(e.extname || ' in ' || n.nspname, ', '), '') as list
       from pg_extension e join pg_namespace n on n.oid = e.extnamespace
      where e.extname in ('pg_trgm','unaccent')`,
  );
  check(
    "pg_trgm and unaccent are installed outside public",
    String(ext?.list).includes("pg_trgm in extensions") &&
      String(ext?.list).includes("unaccent in extensions"),
    String(ext?.list),
  );

  const realtime = await one(
    `select count(*)::int as n from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'parts'`,
  );
  check("parts is published to Realtime", realtime?.n === 1);

  const replica = await one(
    `select relreplident from pg_class where oid = 'public.parts'::regclass`,
  );
  check("parts has REPLICA IDENTITY FULL", replica?.relreplident === "f");

  const bucket = await one(`select count(*)::int as n from storage.buckets where id = 'receipts'`);
  check("the private receipts bucket exists", bucket?.n === 1);

  const catalog = await one(`select count(*)::int as n from public.part_catalog where is_active`);
  check("the parts catalog is loaded", (catalog?.n as number) > 100, `${catalog?.n} active entries`);
}

async function behaviour(db: pg.Client) {
  console.log("\n  Behaviour (in a transaction that is rolled back)\n");

  await db.query("begin");

  try {
    // --- Three members, created through the real auth trigger ---------
    const { rows: users } = await db.query<{ id: string }>(
      `insert into auth.users (id, email, raw_user_meta_data)
       values (gen_random_uuid(), 'check-owner@local.test',
               '{"full_name":"Check Owner","role":"owner"}'::jsonb),
              (gen_random_uuid(), 'check-partner@local.test',
               '{"full_name":"Check Partner","role":"partner"}'::jsonb),
              (gen_random_uuid(), 'check-staff@local.test',
               '{"full_name":"Check Staff","role":"staff"}'::jsonb)
       returning id`,
    );
    const [ownerId, partnerId, staffId] = users.map((u) => u.id);

    const { rows: profiles } = await db.query<{ role: string; full_name: string }>(
      `select role::text, full_name from public.profiles
        where id = any($1::uuid[]) order by full_name`,
      [[ownerId, partnerId, staffId]],
    );
    check(
      "the auth trigger creates a profile with the right role",
      profiles.length === 3 &&
        profiles[0].role === "owner" &&
        profiles[1].role === "partner" &&
        profiles[2].role === "staff",
      JSON.stringify(profiles),
    );

    // --- A vehicle. Only the owner may put a figure against one -------
    check(
      "a partner cannot put a price on a vehicle",
      await expectRefused(
        db,
        partnerId,
        `insert into public.vehicles (year, make, model, purchase_price_cents)
         values (2019, 'Mazda', 'CX-5', 450000)`,
      ),
    );

    const partnerVehicleId = await asUser(db, partnerId, async () => {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.vehicles (year, make, model)
         values (2019, 'Mazda', 'CX-5') returning id`,
      );
      return rows[0].id;
    });
    check(
      "a partner can still add a vehicle without pricing it",
      typeof partnerVehicleId === "string",
    );

    const vehicleId = await asUser(db, ownerId, async () => {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.vehicles (year, make, model, trim, purchase_price_cents, auction_fee_cents)
         values (2016, 'Honda', 'Civic', 'LX', 285000, 28500) returning id`,
      );
      return rows[0].id;
    });

    const { rows: veh } = await db.query<{ stock_number: string; landed_cost_cents: string }>(
      `select stock_number, landed_cost_cents from public.vehicles where id = $1`,
      [vehicleId],
    );
    check(
      "landed cost is computed by the database",
      Number(veh[0].landed_cost_cents) === 313500,
      `got ${veh[0].landed_cost_cents}`,
    );
    check(
      "the vehicle gets a human stock number",
      /^V-\d{4}$/.test(veh[0].stock_number),
      veh[0].stock_number,
    );

    // --- Part generation from the real catalog ------------------------
    const generated = await asUser(db, partnerId, async () => {
      const { rows } = await db.query<{ n: number }>(
        `select public.generate_parts_for_vehicle($1) as n`,
        [vehicleId],
      );
      return Number(rows[0].n);
    });
    check(
      "generating parts produces the full catalogue",
      generated === 239,
      `${generated} parts, expected 239`,
    );

    await db.query(`update public.parts set asking_price_cents = 18000 where vehicle_id = $1`, [
      vehicleId,
    ]);

    // --- Fuzzy search, as the partner ---------------------------------
    const typo = await asUser(db, partnerId, async () => {
      const { rows } = await db.query<{ n: string }>(
        `select count(*)::int as n from public.search_parts('bumpr')`,
      );
      return Number(rows[0].n);
    });
    check("a typo still finds the part (\"bumpr\")", typo > 0, `${typo} results`);

    const crossTable = await asUser(db, partnerId, async () => {
      const { rows } = await db.query<{ name: string }>(
        `select name from public.search_parts('civic mirror')`,
      );
      return rows;
    });
    check(
      'searching across part and vehicle works ("civic mirror")',
      crossTable.length > 0 && crossTable.every((r) => /mirror/i.test(r.name)),
      `${crossTable.length} results: ${crossTable.map((r) => r.name).join(", ").slice(0, 80)}`,
    );

    // --- The race -----------------------------------------------------
    const { rows: bumper } = await db.query<{ id: string }>(
      `select id from public.parts
        where vehicle_id = $1 and name = 'Front bumper cover' limit 1`,
      [vehicleId],
    );
    const partId = bumper[0].id;

    const first = await asUser(db, partnerId, async () => {
      const { rows } = await db.query<{ r: { ok: boolean } }>(
        `select public.sell_part($1, 18000, 'cash', 'Buyer One', null, 'facebook', null, null, null) as r`,
        [partId],
      );
      return rows[0].r;
    });
    check("the first sale succeeds", first.ok === true, JSON.stringify(first));

    const second = await asUser(db, staffId, async () => {
      const { rows } = await db.query<{
        r: { ok: boolean; reason?: string; sold_by_name?: string; sale_price_cents?: string };
      }>(
        `select public.sell_part($1, 20000, 'cash', 'Buyer Two', null, 'facebook', null, null, null) as r`,
        [partId],
      );
      return rows[0].r;
    });
    check(
      "the same part cannot be sold twice",
      second.ok === false && second.reason === "already_sold",
      JSON.stringify(second),
    );
    check(
      "the loser is told who beat them and for how much",
      second.sold_by_name === "Check Partner" && Number(second.sale_price_cents) === 18000,
      `${second.sold_by_name} / ${second.sale_price_cents}`,
    );

    const { rows: saleCount } = await db.query<{ n: string }>(
      `select count(*)::int as n from public.sales where part_id = $1`,
      [partId],
    );
    check("exactly one sale row exists", Number(saleCount[0].n) === 1);

    // --- Reservations -------------------------------------------------
    const { rows: mirror } = await db.query<{ id: string }>(
      `select id from public.parts
        where vehicle_id = $1 and name = 'Side mirror' and side = 'left' limit 1`,
      [vehicleId],
    );
    const mirrorId = mirror[0].id;

    const held = await asUser(db, partnerId, async () => {
      const { rows } = await db.query<{ r: { ok: boolean } }>(
        `select public.reserve_part($1, 'No-show Nick', 48) as r`,
        [mirrorId],
      );
      return rows[0].r;
    });
    check("a part can be put on hold", held.ok === true);

    const doubleHold = await asUser(db, staffId, async () => {
      const { rows } = await db.query<{ r: { ok: boolean; reserved_by_name?: string } }>(
        `select public.reserve_part($1, 'Someone else', 48) as r`,
        [mirrorId],
      );
      return rows[0].r;
    });
    check(
      "a held part cannot be held again",
      doubleHold.ok === false && doubleHold.reserved_by_name === "Check Partner",
      JSON.stringify(doubleHold),
    );

    await db.query(
      `update public.parts set reserved_until = now() - interval '1 hour' where id = $1`,
      [mirrorId],
    );
    const { rows: expired } = await db.query<{ n: string }>(
      `select public.expire_reservations() as n`,
    );
    check("an expired hold returns the part to the shelf", Number(expired[0].n) >= 1);

    const { rows: notice } = await db.query<{ n: string }>(
      `select count(*)::int as n from public.activity_log
        where action = 'reservation_expired' and user_id = $1`,
      [partnerId],
    );
    check("the partner who placed the hold gets the notice", Number(notice[0].n) === 1);

    // --- Money is the owner's alone -----------------------------------
    // Partners run the yard; they do not see what it cost or what it made.
    for (const [who, id] of [
      ["staff", staffId],
      ["a partner", partnerId],
    ] as const) {
      const blind = await asUser(db, id, async () => {
        const { rows } = await db.query(`select * from public.vehicle_finance`);
        return rows.length;
      });
      check(`${who} reads zero rows from vehicle_finance`, blind === 0);

      for (const [label, sql] of [
        ["vehicle_pnl", `select * from public.vehicle_pnl(null)`],
        ["monthly_report", `select public.monthly_report(2026, 1)`],
        ["top_remaining_parts", `select * from public.top_remaining_parts($1, 5)`],
      ] as const) {
        const refused = await expectRefused(
          db,
          id,
          sql,
          sql.includes("$1") ? [vehicleId] : [],
        );
        check(`${who} calling ${label}() is refused`, refused);
      }
    }

    // Writing where they have no business writing.
    check(
      "staff cannot record an expense",
      await expectRefused(
        db,
        staffId,
        `insert into public.expenses (scope, category, amount_cents) values ('business','rent',1000)`,
      ),
    );
    check(
      "staff cannot price a vehicle either",
      await expectRefused(
        db,
        staffId,
        `insert into public.vehicles (year, make, model, purchase_price_cents)
         values (2020, 'Toyota', 'Corolla', 500000)`,
      ),
    );
    // Not an error -- an RLS policy that matches no row simply updates
    // nothing, so the proof is the row count and the untouched value.
    const partnerEdit = await asUser(db, partnerId, async () => {
      const r = await db.query(
        `update public.vehicles set model = 'Accord' where id = $1`,
        [vehicleId],
      );
      return r.rowCount ?? 0;
    });
    const { rows: stillCivic } = await db.query<{ model: string }>(
      `select model from public.vehicles where id = $1`,
      [vehicleId],
    );
    check(
      "nobody but the owner can edit a vehicle",
      partnerEdit === 0 && stillCivic[0].model === "Civic",
      `${partnerEdit} rows, model is ${stillCivic[0].model}`,
    );

    const staffDash = await asUser(db, staffId, async () => {
      const { rows } = await db.query<{ d: Record<string, unknown> }>(
        `select public.dashboard_stats() as d`,
      );
      return rows[0].d;
    });
    check(
      "the staff dashboard omits money entirely",
      !("inventory_value_cents" in staffDash) && staffDash.finance_visible === false,
      JSON.stringify(staffDash).slice(0, 120),
    );
    check(
      "the staff dashboard still has the counts they need",
      typeof staffDash.parts_available === "number",
    );

    // --- The owner must see money -------------------------------------
    const ownerFinance = await asUser(db, ownerId, async () => {
      const { rows } = await db.query<{ landed_cost_cents: string }>(
        `select landed_cost_cents from public.vehicle_finance where vehicle_id = $1`,
        [vehicleId],
      );
      return rows;
    });
    check(
      "the owner can read vehicle costs",
      ownerFinance.length === 1 && Number(ownerFinance[0].landed_cost_cents) === 313500,
      JSON.stringify(ownerFinance),
    );

    const pnl = await asUser(db, ownerId, async () => {
      const { rows } = await db.query<{
        total_invested_cents: string; parts_revenue_cents: string; parts_sold: string;
      }>(`select * from public.vehicle_pnl($1)`, [vehicleId]);
      return rows[0];
    });
    check(
      "the vehicle P&L adds up",
      Number(pnl.total_invested_cents) === 313500 &&
        Number(pnl.parts_revenue_cents) === 18000 &&
        Number(pnl.parts_sold) === 1,
      JSON.stringify(pnl),
    );

    // --- Bought at auction, repaired, sold whole ----------------------
    const resaleId = await asUser(db, ownerId, async () => {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.vehicles
           (year, make, model, title_status, plan, status,
            purchase_price_cents, sale_price_cents, sold_on, sold_to)
         values (2018, 'Toyota', 'Corolla', 'salvage', 'repair_and_sell', 'sold',
                 600000, 1150000, current_date, 'Whole-car Buyer')
         returning id`,
      );
      return rows[0].id;
    });

    await asUser(db, ownerId, async () => {
      await db.query(
        `insert into public.expenses (scope, vehicle_id, category, amount_cents)
         values ('vehicle', $1, 'repair', 210000),
                ('vehicle', $1, 'inspection', 15000)`,
        [resaleId],
      );
    });

    const resale = await asUser(db, ownerId, async () => {
      const { rows } = await db.query<{
        vehicle_sale_cents: string;
        total_revenue_cents: string;
        total_invested_cents: string;
        gross_profit_cents: string;
        plan: string;
      }>(`select * from public.vehicle_pnl($1)`, [resaleId]);
      return rows[0];
    });
    check(
      "a car sold whole counts its sale as revenue",
      Number(resale.vehicle_sale_cents) === 1150000 &&
        Number(resale.total_revenue_cents) === 1150000,
      JSON.stringify(resale),
    );
    check(
      "repair and inspection land as costs on that car",
      // 600000 landed + 210000 repair + 15000 inspection = 825000
      Number(resale.total_invested_cents) === 825000 &&
        Number(resale.gross_profit_cents) === 325000,
      JSON.stringify(resale),
    );
    check("the P&L says which path the car was on", resale.plan === "repair_and_sell");

    const resaleVisible = await asUser(db, partnerId, async () => {
      const { rows } = await db.query<{ title_status: string; plan: string }>(
        `select title_status::text, plan::text from public.vehicles where id = $1`,
        [resaleId],
      );
      return rows[0];
    });
    check(
      "a partner can see the title brand and the plan",
      resaleVisible?.title_status === "salvage" && resaleVisible?.plan === "repair_and_sell",
      JSON.stringify(resaleVisible),
    );
    check(
      "a partner still cannot read what it sold for",
      await expectRefused(
        db,
        partnerId,
        `select sale_price_cents from public.vehicles where id = $1`,
        [resaleId],
      ),
    );

    const report = await asUser(db, ownerId, async () => {
      const { rows } = await db.query<{ r: Record<string, unknown> }>(
        `select public.monthly_report(
           extract(year from current_date)::int,
           extract(month from current_date)::int) as r`,
      );
      return rows[0].r;
    });
    check(
      "the monthly report declares its basis and carries both profit figures",
      report.basis === "cash" && "gross_profit_on_parts_sold_cents" in report,
      JSON.stringify(report).slice(0, 100),
    );
    check(
      "the monthly report counts the car sold whole",
      Number(report.vehicles_sold_count) === 1 &&
        Number(report.vehicle_sales_revenue_cents) === 1150000 &&
        Number(report.revenue_cents) ===
          Number(report.parts_revenue_cents) + 1150000,
      JSON.stringify({
        sold: report.vehicles_sold_count,
        whole: report.vehicle_sales_revenue_cents,
        total: report.revenue_cents,
        parts: report.parts_revenue_cents,
      }),
    );

    // --- Staff can still do their job ---------------------------------
    const staffSearch = await asUser(db, staffId, async () => {
      const { rows } = await db.query<{ n: string }>(
        `select count(*)::int as n from public.search_parts('bumper')`,
      );
      return Number(rows[0].n);
    });
    check("staff can still search the shelf", staffSearch > 0, `${staffSearch} results`);

    const staffSell = await asUser(db, staffId, async () => {
      const { rows: p } = await db.query<{ id: string }>(
        `select id from public.parts where vehicle_id = $1 and status = 'available' limit 1`,
        [vehicleId],
      );
      const { rows } = await db.query<{ r: { ok: boolean } }>(
        `select public.sell_part($1, 5000, 'cash', 'Walk-in', null, 'walk_in', null, null, null) as r`,
        [p[0].id],
      );
      return rows[0].r;
    });
    check("staff can still sell a part", staffSell.ok === true, JSON.stringify(staffSell));

    // --- History is not rewritten -------------------------------------
    await db.query(
      `update public.part_catalog set name = 'RENAMED IN A ROLLED BACK TX'
        where slug = 'front-bumper-cover'`,
    );
    const { rows: historical } = await db.query<{ name: string }>(
      `select name from public.parts where id = $1`,
      [partId],
    );
    check(
      "renaming the catalog does not rewrite sold history",
      historical[0].name === "Front bumper cover",
      historical[0].name,
    );
  } finally {
    // Always. Nothing above is allowed to survive.
    await db.query("rollback");
  }
}

async function main() {
  console.log("\n  Mahmood Shah Auto Recycler — live guarantee check\n");

  const db = await connect();

  try {
    await structure(db);
    await behaviour(db);

    const { rows } = await db.query<{ n: string }>(
      `select count(*)::int as n from public.vehicles`,
    );
    console.log(`\n  Rolled back. Vehicles in the database: ${rows[0].n}\n`);
  } finally {
    await db.end().catch(() => {});
  }

  if (failures > 0) {
    console.error(`  ${failures} of ${failures + passes} checks failed.\n`);
    process.exit(1);
  }
  console.log(`  All ${passes} checks passed against the live database.\n`);
}

main().catch((err) => {
  console.error(`\n  ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
