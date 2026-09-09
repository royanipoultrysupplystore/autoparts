/**
 * Team bootstrap.  `npm run seed:users`
 *
 * Creates the four partner accounts from .env.local: one owner and three
 * partners. Safe to re-run -- an existing email is updated, never
 * duplicated, and an existing password is left alone.
 *
 * Staff accounts are added later from the Team screen; they default to
 * the `staff` role, which the database will not let near a cost figure.
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
config({ path: ".env" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !SERVICE_KEY) {
  console.error("\n  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n");
  process.exit(1);
}

const db = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Member = {
  email?: string;
  name?: string;
  password?: string;
  role: "owner" | "partner";
};

const MEMBERS: Member[] = [
  {
    email: process.env.SEED_OWNER_EMAIL,
    name: process.env.SEED_OWNER_NAME,
    password: process.env.SEED_OWNER_PASSWORD,
    role: "owner",
  },
  {
    email: process.env.SEED_PARTNER_2_EMAIL,
    name: process.env.SEED_PARTNER_2_NAME,
    password: process.env.SEED_PARTNER_2_PASSWORD,
    role: "partner",
  },
  {
    email: process.env.SEED_PARTNER_3_EMAIL,
    name: process.env.SEED_PARTNER_3_NAME,
    password: process.env.SEED_PARTNER_3_PASSWORD,
    role: "partner",
  },
  {
    email: process.env.SEED_PARTNER_4_EMAIL,
    name: process.env.SEED_PARTNER_4_NAME,
    password: process.env.SEED_PARTNER_4_PASSWORD,
    role: "partner",
  },
];

async function findUserByEmail(email: string) {
  // The admin API has no direct lookup-by-email, so page through.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  console.log("\n  Mahmood Shah Auto Recycler — team bootstrap\n");

  const configured = MEMBERS.filter((m) => m.email && m.password);

  if (configured.length === 0) {
    console.error(
      "  No members configured. Fill in SEED_OWNER_EMAIL / _NAME / _PASSWORD\n" +
        "  (and the SEED_PARTNER_2..4 sets) in .env.local, then run this again.\n",
    );
    process.exit(1);
  }

  if (!MEMBERS[0].email) {
    console.error("  SEED_OWNER_EMAIL is required: somebody has to be the owner.\n");
    process.exit(1);
  }

  for (const m of configured) {
    const email = m.email!.trim();
    const full_name = (m.name || email.split("@")[0]).trim();

    const existing = await findUserByEmail(email);

    if (existing) {
      await db
        .from("profiles")
        .update({ full_name, role: m.role, is_active: true })
        .eq("id", existing.id);
      console.log(`  = ${email.padEnd(34)} ${m.role} (already existed, role confirmed)`);
      continue;
    }

    const { data, error } = await db.auth.admin.createUser({
      email,
      password: m.password,
      email_confirm: true,
      user_metadata: { full_name, role: m.role },
    });

    if (error) {
      console.error(`  ! ${email.padEnd(34)} ${error.message}`);
      continue;
    }

    // The trigger creates the profile; make sure the role took.
    await db
      .from("profiles")
      .update({ full_name, role: m.role, is_active: true })
      .eq("id", data.user.id);

    console.log(`  + ${email.padEnd(34)} ${m.role}`);
  }

  const { count } = await db
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);

  console.log(`\n  ${count} active member(s). Everyone should change their password after signing in.\n`);
}

main().catch((err) => {
  console.error(`\n  Failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
