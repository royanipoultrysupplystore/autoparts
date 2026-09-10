/**
 * End-to-end smoke test.  `npm run db:smoke`
 *
 * `db:check` proves the guarantees hold in SQL. This proves they hold
 * through the stack a partner's phone actually uses: the Supabase auth
 * API, a real JWT, and PostgREST.
 *
 * It creates a throwaway account, signs in with it, makes the same calls
 * the app makes, and deletes the account again. Nothing survives the run.
 */

import { connect } from "./db";
import { createAuthUser } from "./auth-users";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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

const EMAIL = `smoke-${Date.now()}@local.test`;
const PASSWORD = "Sm0keT3st!Password";

async function main() {
  if (!URL || !KEY) {
    console.error(
      "\n  NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.\n",
    );
    process.exit(1);
  }

  console.log("\n  Mahmood Shah Auto Recycler — API smoke test\n");

  const db = await connect();
  let userId: string | null = null;

  try {
    // ---- Anonymous: what the internet can reach --------------------
    const anon = async (path: string) =>
      fetch(`${URL}/rest/v1/${path}`, {
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
      });

    check("anon is refused the parts table", (await anon("parts?select=id&limit=1")).status === 401);
    check("anon is refused the vehicles table", (await anon("vehicles?select=id&limit=1")).status === 401);
    check("anon is refused the sales table", (await anon("sales?select=id&limit=1")).status === 401);
    check("anon is refused the expenses table", (await anon("expenses?select=id&limit=1")).status === 401);
    check("anon CAN read the storefront view", (await anon("public_parts?select=id&limit=1")).status === 200);
    check(
      "the migration tracking table is not exposed",
      (await anon("schema_migrations?select=filename")).status === 404,
    );

    // ---- A throwaway partner --------------------------------------
    userId = await createAuthUser(db, {
      email: EMAIL,
      password: PASSWORD,
      fullName: "Smoke Test",
      role: "partner",
    });

    const { rows: profile } = await db.query<{ role: string }>(
      `select role::text from public.profiles where id = $1`,
      [userId],
    );
    check("the auth trigger created a profile", profile[0]?.role === "partner");

    const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    const body = (await res.json()) as {
      access_token?: string;
      error_description?: string;
      msg?: string;
    };

    check(
      "an account created from SQL can sign in",
      res.ok && !!body.access_token,
      body.error_description ?? body.msg,
    );

    if (!body.access_token) return;

    const auth = async (path: string) =>
      fetch(`${URL}/rest/v1/${path}`, {
        headers: { apikey: KEY, Authorization: `Bearer ${body.access_token}` },
      });

    // ---- Signed in: the app's own calls ----------------------------
    const catalog = await auth("part_catalog?select=name&limit=3");
    check("a signed-in partner can read the catalog", catalog.status === 200);

    check("a signed-in partner can read vehicles", (await auth("vehicles?select=id,make&limit=1")).status === 200);

    // The non-negotiable, tested where it counts.
    const cost = await auth("vehicles?select=purchase_price_cents&limit=1");
    check(
      "a cost column is refused through PostgREST",
      cost.status === 403,
      `got ${cost.status}`,
    );

    const landed = await auth("vehicles?select=landed_cost_cents&limit=1");
    check("landed cost is refused too", landed.status === 403, `got ${landed.status}`);

    const search = await fetch(`${URL}/rest/v1/rpc/search_parts`, {
      method: "POST",
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${body.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_query: "bumper" }),
    });
    check("the search RPC answers a signed-in call", search.status === 200);

    const dash = await fetch(`${URL}/rest/v1/rpc/dashboard_stats`, {
      method: "POST",
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${body.access_token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const dashBody = (await dash.json()) as Record<string, unknown>;
    check(
      "the dashboard answers and shows money to a partner",
      dash.status === 200 && "inventory_value_cents" in dashBody,
      JSON.stringify(dashBody).slice(0, 100),
    );
  } finally {
    if (userId) {
      await db.query(`delete from auth.users where id = $1`, [userId]);
    }
    await db.end().catch(() => {});
  }

  console.log("");
  if (failures > 0) {
    console.error(`  ${failures} of ${failures + passes} checks failed.\n`);
    process.exit(1);
  }
  console.log(`  All ${passes} checks passed against the live API.\n`);
}

main().catch((err) => {
  console.error(`\n  ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
