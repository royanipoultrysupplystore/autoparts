/**
 * Seed script.  `npm run seed`
 *
 * Two distinct jobs, and the difference matters:
 *
 *   1. The parts catalog. This is REFERENCE DATA, not demo data. The app
 *      cannot generate a vehicle's parts without it, so it is always
 *      loaded and it belongs in production.
 *
 *   2. Demo vehicles, parts, sales, and expenses. This is DEMO DATA. It
 *      exists only so the app is explorable the moment it boots. Every
 *      demo row is tagged so `npm run seed:clear-demo` can remove all of
 *      it, and it never ships to the yard's real database.
 *
 * Runs over the Postgres connection rather than the REST API, so it needs
 * SUPABASE_DB_URL and no service role key. Writes go in as `postgres`,
 * which owns the tables and therefore bypasses RLS the same way the
 * service role would.
 *
 * Flags:
 *   --catalog-only   load the catalog and stop  (use this in production)
 *   --demo           load the catalog and the demo yard
 *   --clear-demo     remove every demo row, leave the catalog alone
 *   --reset-catalog  retire catalog entries no longer in the seed
 */

import type pg from "pg";
import { connect } from "./db";
import { buildCatalogRows, generatedPartCount, PART_CATALOG_SEED } from "../src/lib/part-catalog-seed";

/** Every demo row carries this marker in its notes column. */
const DEMO_TAG = "[demo]";

const args = new Set(process.argv.slice(2));
const catalogOnly = args.has("--catalog-only");
const clearDemo = args.has("--clear-demo");
const resetCatalog = args.has("--reset-catalog");
const withDemo = args.has("--demo") || (!catalogOnly && !clearDemo);

const log = (msg: string) => console.log(`  ${msg}`);
const money = (dollars: number) => Math.round(dollars * 100);

// =====================================================================
// 1. Parts catalog -- reference data
// =====================================================================
async function seedCatalog(db: pg.Client) {
  const rows = buildCatalogRows();

  log(`Loading ${rows.length} catalog entries…`);

  // One round trip for all of them. Upserting on slug means renaming an
  // entry updates the template without touching the historical `parts`
  // rows that snapshotted the old name.
  await db.query(
    `
    insert into public.part_catalog
      (name, slug, category, icon_key, default_sides, is_high_value, sort_order, is_active)
    select
      r.name, r.slug, r.category, r.icon_key,
      (select array_agg(s::public.part_side)
         from jsonb_array_elements_text(r.default_sides) s),
      r.is_high_value, r.sort_order, r.is_active
    from jsonb_to_recordset($1::jsonb) as r(
      name text, slug text, category text, icon_key text,
      default_sides jsonb, is_high_value boolean, sort_order int, is_active boolean
    )
    on conflict (slug) do update set
      name          = excluded.name,
      category      = excluded.category,
      icon_key      = excluded.icon_key,
      default_sides = excluded.default_sides,
      is_high_value = excluded.is_high_value,
      sort_order    = excluded.sort_order,
      is_active     = excluded.is_active
    `,
    [JSON.stringify(rows)],
  );

  if (resetCatalog) {
    // Retired, never deleted: an entry that has generated parts in the
    // past must keep existing for those rows to point at.
    const { rowCount } = await db.query(
      `update public.part_catalog
          set is_active = false
        where is_active and not (slug = any($1::text[]))`,
      [rows.map((r) => r.slug)],
    );
    if (rowCount) log(`Retired ${rowCount} entries no longer in the seed.`);
  }

  const { rows: counted } = await db.query<{ count: string }>(
    `select count(*) from public.part_catalog where is_active`,
  );

  log(`Catalog ready: ${counted[0].count} active entries, ${generatedPartCount()} parts per vehicle.`);
}

// =====================================================================
// 2. Demo yard -- clearly labelled, removable
// =====================================================================

type DemoVehicle = {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  body_type: string;
  engine: string;
  transmission: string;
  drivetrain: string;
  fuel_type: string;
  exterior_colour: string;
  mileage_km: number;
  purchase_date: string;
  source: string;
  lot_number: string | null;
  purchase_price_cents: number;
  auction_fee_cents: number;
  transport_cost_cents: number;
  other_acquisition_cost_cents: number;
  scrap_income_cents: number;
  status: string;
  /** Fraction of generated parts kept after the trim screen. */
  keepRatio: number;
  /** How many of the kept parts have already sold. */
  soldCount: number;
};

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const DEMO_VEHICLES: DemoVehicle[] = [
  {
    vin: "2HGFC2F59GH500123",
    year: 2016, make: "Honda", model: "Civic", trim: "LX",
    body_type: "sedan", engine: "2.0L I4", transmission: "auto",
    drivetrain: "fwd", fuel_type: "gas", exterior_colour: "White",
    mileage_km: 148320, purchase_date: daysAgo(96),
    source: "icbc_auction", lot_number: "ICBC-44182",
    purchase_price_cents: money(2850), auction_fee_cents: money(285),
    transport_cost_cents: money(180), other_acquisition_cost_cents: money(45),
    scrap_income_cents: money(310), status: "parting_out",
    keepRatio: 0.72, soldCount: 26,
  },
  {
    vin: "1FTFW1ET5DFA61234",
    year: 2013, make: "Ford", model: "F-150", trim: "XLT",
    body_type: "truck", engine: "3.5L V6 EcoBoost", transmission: "auto",
    drivetrain: "4wd", fuel_type: "gas", exterior_colour: "Blue",
    mileage_km: 268940, purchase_date: daysAgo(41),
    source: "icbc_auction", lot_number: "ICBC-44907",
    purchase_price_cents: money(4100), auction_fee_cents: money(410),
    transport_cost_cents: money(240), other_acquisition_cost_cents: 0,
    scrap_income_cents: 0, status: "parting_out",
    keepRatio: 0.68, soldCount: 11,
  },
  {
    vin: "5NPE24AF2FH012345",
    year: 2015, make: "Hyundai", model: "Sonata", trim: "GL",
    body_type: "sedan", engine: "2.4L I4", transmission: "auto",
    drivetrain: "fwd", fuel_type: "gas", exterior_colour: "Silver",
    mileage_km: 191500, purchase_date: daysAgo(9),
    source: "private", lot_number: null,
    purchase_price_cents: money(1750), auction_fee_cents: 0,
    transport_cost_cents: money(160), other_acquisition_cost_cents: 0,
    scrap_income_cents: 0, status: "parting_out",
    keepRatio: 0.8, soldCount: 3,
  },
];

/**
 * Rough asking price, in cents, for a demo part. Real prices are set by
 * the partners; this only needs a believable spread so the reports have
 * something to add up.
 */
function demoPrice(name: string, highValue: boolean, condition: string): number {
  const base: Record<string, number> = {
    "Engine assembly": 180000,
    "Automatic transmission": 95000,
    "Manual transmission": 90000,
    "Transfer case": 55000,
    Turbocharger: 60000,
    "Catalytic converter": 32000,
    "ECU/ECM": 22000,
    "Airbag — driver": 18000,
    "Airbag — passenger": 18000,
    Headlight: 16000,
    "Instrument cluster": 14000,
    "Radio/head unit": 15000,
    "Infotainment screen": 28000,
    "Wheel/rim": 9000,
    "Door shell": 25000,
    Hood: 20000,
    "Trunk lid/tailgate": 22000,
    "Quarter panel": 30000,
    "A/C compressor": 14000,
    Alternator: 9000,
  };

  let cents = base[name] ?? (highValue ? 12000 : 4500);

  const jitter = 0.82 + ((name.length * 37) % 40) / 100;
  cents = Math.round((cents * jitter) / 500) * 500;

  const factor: Record<string, number> = { A: 1.15, B: 1, C: 0.72, damaged: 0.4 };
  cents = Math.round((cents * (factor[condition] ?? 1)) / 500) * 500;

  return Math.max(1500, cents);
}

const CONDITIONS = ["A", "B", "B", "B", "C", "C", "damaged"] as const;
const SHELVES = [
  "Rack 1, bin A", "Rack 1, bin B", "Rack 2, bin A", "Rack 2, bin C",
  "Rack 3, bin B", "Rack 4, bin A", "Floor — north wall", "Container 2",
  "Yard — on the car",
];
const CHANNELS = ["facebook", "facebook", "facebook", "walk_in", "phone", "referral"] as const;
const PAYMENTS = ["cash", "cash", "etransfer", "etransfer", "other"] as const;

async function clearDemoData(db: pg.Client) {
  log("Removing demo data…");

  const { rows: vehicles } = await db.query<{ id: string }>(
    `select id from public.vehicles where notes like $1`,
    [`%${DEMO_TAG}%`],
  );

  if (vehicles.length === 0) {
    log("No demo vehicles found.");
    return;
  }

  const ids = vehicles.map((v) => v.id);

  // Parts, sales, and vehicle-scoped expenses cascade from vehicles.
  await db.query(`delete from public.expenses where vehicle_id = any($1::uuid[])`, [ids]);
  await db.query(`delete from public.vehicles where id = any($1::uuid[])`, [ids]);
  await db.query(`delete from public.expenses where note like $1`, [`%${DEMO_TAG}%`]);
  await db.query(`delete from public.activity_log where summary like $1`, [`%${DEMO_TAG}%`]);

  log(`Removed ${vehicles.length} demo vehicles and everything attached to them.`);
}

async function seedDemo(db: pg.Client) {
  const { rows: existing } = await db.query(
    `select 1 from public.vehicles where notes like $1 limit 1`,
    [`%${DEMO_TAG}%`],
  );

  if (existing.length > 0) {
    log("Demo data is already loaded. Run `npm run seed:clear-demo` first to rebuild it.");
    return;
  }

  // Attribute demo sales to a real profile when one exists, so the
  // "sales by partner" report is not empty on first look.
  const { rows: profiles } = await db.query<{ id: string }>(
    `select id from public.profiles where is_active order by created_at`,
  );
  const sellers: (string | null)[] = profiles.length ? profiles.map((p) => p.id) : [null];

  const highValue = new Set(
    PART_CATALOG_SEED.filter((c) => c.highValue).map((c) => c.name),
  );

  for (const v of DEMO_VEHICLES) {
    const { keepRatio, soldCount, ...row } = v;

    const { rows: inserted } = await db.query<{
      id: string; stock_number: string; year: number; make: string; model: string;
    }>(
      `insert into public.vehicles (
         vin, year, make, model, trim, body_type, engine, transmission, drivetrain,
         fuel_type, exterior_colour, mileage_km, purchase_date, source, lot_number,
         purchase_price_cents, auction_fee_cents, transport_cost_cents,
         other_acquisition_cost_cents, scrap_income_cents, status, notes)
       values ($1,$2,$3,$4,$5,$6::public.body_type,$7,$8::public.transmission_type,
               $9::public.drivetrain_type,$10::public.fuel_type,$11,$12,$13,
               $14::public.vehicle_source,$15,$16,$17,$18,$19,$20,
               $21::public.vehicle_status,$22)
       returning id, stock_number, year, make, model`,
      [
        row.vin, row.year, row.make, row.model, row.trim, row.body_type, row.engine,
        row.transmission, row.drivetrain, row.fuel_type, row.exterior_colour,
        row.mileage_km, row.purchase_date, row.source, row.lot_number,
        row.purchase_price_cents, row.auction_fee_cents, row.transport_cost_cents,
        row.other_acquisition_cost_cents, row.scrap_income_cents, row.status,
        `${DEMO_TAG} Sample vehicle from the seed script — safe to delete.`,
      ],
    );

    const vehicle = inserted[0];

    await db.query(`select public.generate_parts_for_vehicle($1)`, [vehicle.id]);

    const { rows: parts } = await db.query<{ id: string; name: string }>(
      `select id, name from public.parts where vehicle_id = $1 order by created_at, id`,
      [vehicle.id],
    );

    if (parts.length === 0) continue;

    // Trim, the way a partner would: drop what the car did not have.
    const keep = parts.filter((_, i) => (i * 7919) % 1000 < keepRatio * 1000);
    const keepIds = new Set(keep.map((p) => p.id));
    const drop = parts.filter((p) => !keepIds.has(p.id));

    if (drop.length) {
      await db.query(`delete from public.parts where id = any($1::uuid[])`, [
        drop.map((p) => p.id),
      ]);
    }

    // Price and shelve everything that stayed -- one statement, not 170.
    const priced = keep.map((p, i) => {
      const condition = CONDITIONS[(i * 13) % CONDITIONS.length];
      return {
        id: p.id,
        condition,
        asking_price_cents: demoPrice(p.name, highValue.has(p.name), condition),
        shelf_location: SHELVES[(i * 17) % SHELVES.length],
      };
    });

    await db.query(
      `update public.parts p
          set condition          = r.condition::public.part_condition,
              asking_price_cents = r.asking_price_cents,
              shelf_location     = r.shelf_location
         from jsonb_to_recordset($1::jsonb) as r(
           id uuid, condition text, asking_price_cents bigint, shelf_location text)
        where p.id = r.id`,
      [JSON.stringify(priced)],
    );

    // Sell some of them, through the same conditional write the app uses.
    const toSell = priced.filter((p) => p.condition !== "damaged").slice(0, soldCount);

    let sold = 0;
    for (const [i, p] of toSell.entries()) {
      const settled = Math.max(
        1000,
        Math.round((p.asking_price_cents * (0.8 + ((i * 11) % 25) / 100)) / 500) * 500,
      );

      const { rows: result } = await db.query<{ r: { ok: boolean } }>(
        `select public.sell_part($1,$2,$3::public.payment_method,$4,$5,
                                 $6::public.sale_channel,$7,$8,$9) as r`,
        [
          p.id, settled, PAYMENTS[i % PAYMENTS.length], null, null,
          CHANNELS[i % CHANNELS.length], `${DEMO_TAG} sample sale`,
          sellers[i % sellers.length], daysAgo(Math.max(0, 70 - i * 2)),
        ],
      );
      if (result[0]?.r?.ok) sold += 1;
    }

    // A couple of holds so the reserved state is visible.
    const toHold = priced.slice(soldCount, soldCount + 2);
    if (toHold.length) {
      await db.query(
        `update public.parts
            set status = 'reserved', reserved_for_name = 'Sample buyer',
                reserved_at = now(), reserved_until = now() + interval '40 hours',
                reserved_by = $2
          where id = any($1::uuid[])`,
        [toHold.map((p) => p.id), sellers[0]],
      );
    }

    // Direct costs against the car.
    await db.query(
      `insert into public.expenses (scope, vehicle_id, category, amount_cents, expense_date, paid_by, note)
       values ('vehicle', $1, 'towing', $2, $3, $4, $5),
              ('vehicle', $1, 'teardown_labour', $6, $7, $4, $8)`,
      [
        vehicle.id, money(120), v.purchase_date, sellers[0],
        `${DEMO_TAG} tow from auction`,
        money(340), daysAgo(Math.max(1, daysBetween(v.purchase_date) - 4)),
        `${DEMO_TAG} teardown`,
      ],
    );

    log(
      `${vehicle.stock_number}  ${vehicle.year} ${vehicle.make} ${vehicle.model} — ` +
        `${parts.length} generated, ${keep.length} kept, ${sold} sold`,
    );
  }

  // Business overhead, so the monthly report has both sides of the ledger.
  await db.query(
    `insert into public.expenses (scope, category, amount_cents, expense_date, note)
     values ('business','rent',        $1, $2, $3),
            ('business','utilities',   $4, $5, $6),
            ('business','insurance',   $7, $8, $9),
            ('business','advertising', $10,$11,$12),
            ('business','fuel',        $13,$14,$15)`,
    [
      money(2200), daysAgo(8),  `${DEMO_TAG} yard rent`,
      money(310),  daysAgo(6),  `${DEMO_TAG} hydro`,
      money(480),  daysAgo(20), `${DEMO_TAG} liability`,
      money(90),   daysAgo(3),  `${DEMO_TAG} boosted listings`,
      money(165),  daysAgo(12), `${DEMO_TAG} truck fuel`,
    ],
  );

  log("Demo yard loaded. Remove it any time with `npm run seed:clear-demo`.");
}

function daysBetween(isoDate: string): number {
  const then = new Date(`${isoDate}T12:00:00Z`).getTime();
  return Math.max(0, Math.round((Date.now() - then) / 86400000));
}

// =====================================================================
async function main() {
  console.log("\n  Mahmood Shah Auto Recycler — seed\n");

  const db = await connect();

  try {
    if (clearDemo) {
      await clearDemoData(db);
    } else {
      await seedCatalog(db);
      if (withDemo) {
        console.log("");
        await seedDemo(db);
      } else {
        log("Skipping demo data (--catalog-only).");
      }
    }
  } finally {
    await db.end().catch(() => {});
  }

  console.log("\n  Done.\n");
}

main().catch((err) => {
  console.error(`\n  Seed failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
