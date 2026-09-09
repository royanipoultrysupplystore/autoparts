import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Architectural tests.
 *
 * The two rules these protect are the ones that cause real damage when
 * broken, and neither breaks loudly:
 *
 *   - the public storefront must never reach an authenticated client
 *   - cost columns must never be selected outside the vehicle data layer
 *
 * A future edit that violates either would compile, run, and look fine.
 * These fail instead.
 */

const SRC = join(process.cwd(), "src");

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (e) => {
      const path = join(dir, e.name);
      if (e.isDirectory()) return walk(path);
      return /\.(ts|tsx)$/.test(e.name) ? [path] : [];
    }),
  );
  return files.flat();
}

/**
 * Comments describe these rules, so a naive substring search matches the
 * documentation as well as the code. Strip comments before asserting.
 */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const COST_COLUMNS = [
  "purchase_price_cents",
  "auction_fee_cents",
  "transport_cost_cents",
  "other_acquisition_cost_cents",
  "landed_cost_cents",
];

test("the storefront data layer cannot reach an authenticated client", async () => {
  const source = code(await readFile(join(SRC, "lib", "data", "public-shop.ts"), "utf8"));

  assert.ok(
    !source.includes("@/lib/supabase/server"),
    "public-shop.ts imports the authenticated server client",
  );
  assert.ok(
    !source.includes("SERVICE_ROLE"),
    "public-shop.ts references the service role key",
  );
  assert.ok(
    source.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    "public-shop.ts should build its own anon client",
  );

  // It may only touch the two objects granted to `anon`.
  const tables = [...source.matchAll(/\.from\("([^"]+)"\)/g)].map((m) => m[1]);
  const rpcs = [...source.matchAll(/\.rpc\("([^"]+)"/g)].map((m) => m[1]);

  for (const t of tables) {
    assert.equal(t, "public_parts", `storefront reads a non-public table: ${t}`);
  }
  for (const r of rpcs) {
    assert.equal(r, "search_public_parts", `storefront calls a non-public RPC: ${r}`);
  }
});

test("no storefront route reads anything but the storefront data layer", async () => {
  const shopFiles = (await walk(join(SRC, "app", "shop"))).filter((f) => f.endsWith(".tsx"));
  assert.ok(shopFiles.length > 0, "no storefront routes found");

  for (const file of shopFiles) {
    const source = code(await readFile(file, "utf8"));
    assert.ok(
      !source.includes("@/lib/supabase/server"),
      `${file} imports the authenticated server client`,
    );
    assert.ok(
      !source.includes("@/lib/data/vehicles"),
      `${file} imports the internal vehicle data layer`,
    );
    assert.ok(
      !source.includes("@/lib/data/reports"),
      `${file} imports the reporting data layer`,
    );

    for (const column of COST_COLUMNS) {
      assert.ok(!source.includes(column), `${file} references the cost column ${column}`);
    }
  }
});

test("cost columns are only named where they are meant to be", async () => {
  const files = await walk(SRC);

  // The finance form posts cost fields, the data layer types them, and
  // the reports read them. Nowhere else should mention them.
  const allowed = [
    join("types", "db.ts"),
    join("lib", "data", "vehicles.ts"),
    join("lib", "data", "reports.ts"),
    join("lib", "actions", "vehicles.ts"),
    join("components", "vehicles", "vehicle-form.tsx"),
    join("app", "api", "export"),
    join("app", "(app)", "reports"),
    join("app", "(app)", "vehicles", "[id]", "page.tsx"),
  ];

  for (const file of files) {
    const relative = file.slice(SRC.length + 1);
    if (allowed.some((a) => relative.includes(a))) continue;

    const source = code(await readFile(file, "utf8"));
    for (const column of COST_COLUMNS) {
      assert.ok(
        !source.includes(column),
        `${relative} names the cost column ${column} outside the finance layer`,
      );
    }
  }
});

test("the vehicle select list never includes a cost column", async () => {
  const source = await readFile(join(SRC, "lib", "data", "vehicles.ts"), "utf8");
  const match = /export const VEHICLE_COLUMNS =([\s\S]*?);/.exec(source);

  assert.ok(match, "VEHICLE_COLUMNS not found");

  for (const column of COST_COLUMNS.concat("scrap_income_cents")) {
    assert.ok(
      !match[1].includes(column),
      `VEHICLE_COLUMNS includes ${column}, which the database has revoked`,
    );
  }
});

test("no client component imports a server-only data module", async () => {
  const files = await walk(SRC);

  for (const file of files) {
    const raw = await readFile(file, "utf8");
    if (!raw.startsWith('"use client"')) continue;
    const source = code(raw);

    assert.ok(
      !source.includes("@/lib/data/"),
      `${file.slice(SRC.length + 1)} is a client component importing a server data module`,
    );
    assert.ok(
      !source.includes("@/lib/supabase/server"),
      `${file.slice(SRC.length + 1)} is a client component importing the server client`,
    );
  }
});
