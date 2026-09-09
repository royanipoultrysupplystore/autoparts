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
 * Flags:
 *   --catalog-only   load the catalog and stop  (use this in production)
 *   --demo           load the catalog and the demo yard
 *   --clear-demo     remove every demo row, leave the catalog alone
 *   --reset-catalog  delete catalog entries that are no longer in the seed
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { buildCatalogRows, generatedPartCount, PART_CATALOG_SEED } from "../src/lib/part-catalog-seed";

config({ path: ".env.local" });
config({ path: ".env" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !SERVICE_KEY) {
  console.error(
    "\n  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "  Copy .env.example to .env.local and fill both in.\n",
  );
  process.exit(1);
}

const db = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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
async function seedCatalog() {
  const rows = buildCatalogRows();

  log(`Loading ${rows.length} catalog entries…`);

  // Upsert on slug: renaming an entry here updates the template without
  // ever touching the historical `parts` rows that snapshotted the name.
  const { error } = await db.from("part_catalog").upsert(rows, { onConflict: "slug" });
  if (error) throw new Error(`part_catalog upsert failed: ${error.message}`);

  if (resetCatalog) {
    const keep = rows.map((r) => r.slug);
    const { data: stale } = await db
      .from("part_catalog")
      .select("id, slug")
      .not("slug", "in", `(${keep.map((s) => `"${s}"`).join(",")})`);

    if (stale?.length) {
      await db.from("part_catalog").delete().in("id", stale.map((s) => s.id));
      log(`Removed ${stale.length} catalog entries no longer in the seed.`);
    }
  }

  const { count } = await db
    .from("part_catalog")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);

  log(`Catalog ready: ${count} active entries, ${generatedPartCount()} parts per vehicle.`);
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
  lot_number: string;
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

const DEMO_VEHICLES: DemoVehicle[] = [
  {
    vin: "2HGFC2F59GH500123",
    year: 2016,
    make: "Honda",
    model: "Civic",
    trim: "LX",
    body_type: "sedan",
    engine: "2.0L I4",
    transmission: "auto",
    drivetrain: "fwd",
    fuel_type: "gas",
    exterior_colour: "White",
    mileage_km: 148320,
    purchase_date: daysAgo(96),
    source: "icbc_auction",
    lot_number: "ICBC-44182",
    purchase_price_cents: money(2850),
    auction_fee_cents: money(285),
    transport_cost_cents: money(180),
    other_acquisition_cost_cents: money(45),
    scrap_income_cents: money(310),
    status: "parting_out",
    keepRatio: 0.72,
    soldCount: 26,
  },
  {
    vin: "1FTFW1ET5DFA61234",
    year: 2013,
    make: "Ford",
    model: "F-150",
    trim: "XLT",
    body_type: "truck",
    engine: "3.5L V6 EcoBoost",
    transmission: "auto",
    drivetrain: "4wd",
    fuel_type: "gas",
    exterior_colour: "Blue",
    mileage_km: 268940,
    purchase_date: daysAgo(41),
    source: "icbc_auction",
    lot_number: "ICBC-44907",
    purchase_price_cents: money(4100),
    auction_fee_cents: money(410),
    transport_cost_cents: money(240),
    other_acquisition_cost_cents: money(0),
    scrap_income_cents: money(0),
    status: "parting_out",
    keepRatio: 0.68,
    soldCount: 11,
  },
  {
    vin: "5NPE24AF2FH012345",
    year: 2015,
    make: "Hyundai",
    model: "Sonata",
    trim: "GL",
    body_type: "sedan",
    engine: "2.4L I4",
    transmission: "auto",
    drivetrain: "fwd",
    fuel_type: "gas",
    exterior_colour: "Silver",
    mileage_km: 191500,
    purchase_date: daysAgo(9),
    source: "private",
    lot_number: "",
    purchase_price_cents: money(1750),
    auction_fee_cents: money(0),
    transport_cost_cents: money(160),
    other_acquisition_cost_cents: money(0),
    scrap_income_cents: money(0),
    status: "parting_out",
    keepRatio: 0.8,
    soldCount: 3,
  },
];

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Rough asking price, in cents, for a demo part. Real prices are set by
 * the partners; this only needs to produce a believable spread so the
 * reports have something to add up.
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

  // A little spread so every row is not the same number.
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

async function clearDemoData() {
  log("Removing demo data…");

  const { data: vehicles } = await db
    .from("vehicles")
    .select("id, stock_number")
    .like("notes", `%${DEMO_TAG}%`);

  if (!vehicles?.length) {
    log("No demo vehicles found.");
    return;
  }

  const ids = vehicles.map((v) => v.id);

  // Parts, sales, and vehicle-scoped expenses all cascade from vehicles.
  await db.from("expenses").delete().in("vehicle_id", ids);
  await db.from("vehicles").delete().in("id", ids);
  await db.from("expenses").delete().like("note", `%${DEMO_TAG}%`);
  await db.from("activity_log").delete().like("summary", `%${DEMO_TAG}%`);

  log(`Removed ${vehicles.length} demo vehicles and everything attached to them.`);
}

async function seedDemo() {
  const { data: existing } = await db
    .from("vehicles")
    .select("id")
    .like("notes", `%${DEMO_TAG}%`)
    .limit(1);

  if (existing?.length) {
    log("Demo data is already loaded. Run `npm run seed:clear-demo` first to rebuild it.");
    return;
  }

  // Attribute demo sales to a real profile when one exists, so the
  // "sales by partner" report is not empty on first look.
  const { data: profiles } = await db
    .from("profiles")
    .select("id, full_name")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  const sellers = profiles?.length ? profiles.map((p) => p.id) : [null];

  for (const v of DEMO_VEHICLES) {
    const { keepRatio, soldCount, ...vehicleRow } = v;

    const { data: vehicle, error: vErr } = await db
      .from("vehicles")
      .insert({
        ...vehicleRow,
        notes: `${DEMO_TAG} Sample vehicle from the seed script — safe to delete.`,
      })
      .select("id, stock_number, year, make, model")
      .single();

    if (vErr) throw new Error(`demo vehicle insert failed: ${vErr.message}`);

    const { error: gErr } = await db.rpc("generate_parts_for_vehicle", {
      p_vehicle_id: vehicle.id,
    });
    if (gErr) throw new Error(`part generation failed: ${gErr.message}`);

    const { data: parts } = await db
      .from("parts")
      .select("id, name, category, side")
      .eq("vehicle_id", vehicle.id)
      .order("created_at", { ascending: true });

    if (!parts?.length) continue;

    // Trim, the way a partner would: drop what the car did not have.
    const keep = parts.filter((_, i) => (i * 7919) % 1000 < keepRatio * 1000);
    const drop = parts.filter((p) => !keep.includes(p));
    if (drop.length) {
      await db.from("parts").delete().in("id", drop.map((p) => p.id));
    }

    const highValue = new Set(
      PART_CATALOG_SEED.filter((c) => c.highValue).map((c) => c.name),
    );

    // Price and shelve everything that stayed.
    const priced = keep.map((p, i) => {
      const condition = CONDITIONS[(i * 13) % CONDITIONS.length];
      return {
        id: p.id,
        condition,
        asking_price_cents: demoPrice(p.name, highValue.has(p.name), condition),
        shelf_location: SHELVES[(i * 17) % SHELVES.length],
      };
    });

    for (const chunk of chunks(priced, 200)) {
      await Promise.all(
        chunk.map((p) =>
          db
            .from("parts")
            .update({
              condition: p.condition,
              asking_price_cents: p.asking_price_cents,
              shelf_location: p.shelf_location,
            })
            .eq("id", p.id),
        ),
      );
    }

    // Sell some of them, through the same conditional write the app uses.
    const toSell = priced
      .filter((p) => p.condition !== "damaged")
      .slice(0, Math.min(soldCount, priced.length));

    let sold = 0;
    for (const [i, p] of toSell.entries()) {
      const askedFor = p.asking_price_cents;
      const settled = Math.round((askedFor * (0.8 + ((i * 11) % 25) / 100)) / 500) * 500;

      const { data: result, error } = await db.rpc("sell_part", {
        p_part_id: p.id,
        p_sale_price_cents: Math.max(1000, settled),
        p_payment_method: PAYMENTS[i % PAYMENTS.length],
        p_buyer_name: null,
        p_buyer_contact: null,
        p_channel: CHANNELS[i % CHANNELS.length],
        p_notes: `${DEMO_TAG} sample sale`,
        p_sold_by: sellers[i % sellers.length],
        p_sale_date: daysAgo(Math.max(0, 70 - i * 2)),
      });

      if (!error && (result as { ok?: boolean })?.ok) sold += 1;
    }

    // A couple of holds so the reserved state is visible.
    const toHold = priced.slice(soldCount, soldCount + 2);
    for (const p of toHold) {
      await db
        .from("parts")
        .update({
          status: "reserved",
          reserved_for_name: "Sample buyer",
          reserved_at: new Date().toISOString(),
          reserved_until: new Date(Date.now() + 40 * 3600 * 1000).toISOString(),
          reserved_by: sellers[0],
        })
        .eq("id", p.id);
    }

    // Direct costs against the car.
    await db.from("expenses").insert([
      {
        scope: "vehicle",
        vehicle_id: vehicle.id,
        category: "towing",
        amount_cents: money(120),
        expense_date: v.purchase_date,
        paid_by: sellers[0],
        note: `${DEMO_TAG} tow from auction`,
      },
      {
        scope: "vehicle",
        vehicle_id: vehicle.id,
        category: "teardown_labour",
        amount_cents: money(340),
        expense_date: daysAgo(Math.max(1, daysBetween(v.purchase_date) - 4)),
        paid_by: sellers[0],
        note: `${DEMO_TAG} teardown`,
      },
    ]);

    log(
      `${vehicle.stock_number}  ${vehicle.year} ${vehicle.make} ${vehicle.model} — ` +
        `${parts.length} generated, ${keep.length} kept, ${sold} sold`,
    );
  }

  // Business overhead, so the monthly report has both sides of the ledger.
  await db.from("expenses").insert([
    { scope: "business", category: "rent", amount_cents: money(2200), expense_date: daysAgo(8), note: `${DEMO_TAG} yard rent` },
    { scope: "business", category: "utilities", amount_cents: money(310), expense_date: daysAgo(6), note: `${DEMO_TAG} hydro` },
    { scope: "business", category: "insurance", amount_cents: money(480), expense_date: daysAgo(20), note: `${DEMO_TAG} liability` },
    { scope: "business", category: "advertising", amount_cents: money(90), expense_date: daysAgo(3), note: `${DEMO_TAG} boosted listings` },
    { scope: "business", category: "fuel", amount_cents: money(165), expense_date: daysAgo(12), note: `${DEMO_TAG} truck fuel` },
  ]);

  log("Demo yard loaded. Remove it any time with `npm run seed:clear-demo`.");
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function daysBetween(isoDate: string): number {
  const then = new Date(`${isoDate}T12:00:00Z`).getTime();
  return Math.max(0, Math.round((Date.now() - then) / 86400000));
}

// =====================================================================
async function main() {
  console.log("\n  Mahmood Shah Auto Recycler — seed\n");

  if (clearDemo) {
    await clearDemoData();
  } else {
    await seedCatalog();
    if (withDemo) {
      console.log("");
      await seedDemo();
    } else {
      log("Skipping demo data (--catalog-only).");
    }
  }

  console.log("\n  Done.\n");
}

main().catch((err) => {
  console.error(`\n  Seed failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
