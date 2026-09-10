/**
 * Team bootstrap.  `npm run seed:users`
 *
 * Creates the partner accounts listed in .env.local: one owner and up to
 * three partners. Safe to re-run — an existing email has its name and
 * role confirmed, and its password left alone.
 *
 * Runs over the Postgres connection, so it needs the database password
 * rather than the service role key. Passwords are hashed with bcrypt by
 * the database itself (pgcrypto), exactly as GoTrue would, and a matching
 * `auth.identities` row is written so email sign-in works.
 *
 * Staff accounts are added the same way with role=staff, or from the
 * Supabase dashboard. They default to `staff`, which the database will
 * not let near a cost figure.
 *
 * Flags:
 *   --list             show the current accounts, change nothing
 *   --delete <email>   remove one account and everything it owns
 */

import type pg from "pg";
import { connect } from "./db";
import { createAuthUser } from "./auth-users";

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

const args = process.argv.slice(2);
const listOnly = args.includes("--list");
const deleteIndex = args.indexOf("--delete");
const deleteEmail = deleteIndex >= 0 ? args[deleteIndex + 1] : null;

async function listMembers(db: pg.Client) {
  const { rows } = await db.query<{
    email: string; full_name: string; role: string; is_active: boolean; created_at: string;
  }>(
    `select u.email, p.full_name, p.role::text, p.is_active, p.created_at
       from public.profiles p join auth.users u on u.id = p.id
      order by p.role, p.full_name`,
  );

  if (rows.length === 0) {
    console.log("  No accounts yet.\n");
    return;
  }

  const w = Math.max(...rows.map((r) => r.email.length), 5);
  console.log(`  ${"email".padEnd(w)}  ${"name".padEnd(20)}  role     active`);
  console.log(`  ${"-".repeat(w)}  ${"-".repeat(20)}  -------  ------`);
  for (const r of rows) {
    console.log(
      `  ${r.email.padEnd(w)}  ${(r.full_name || "").padEnd(20)}  ` +
        `${r.role.padEnd(7)}  ${r.is_active ? "yes" : "no"}`,
    );
  }
  console.log("");
}

async function main() {
  console.log("\n  Mahmood Shah Auto Recycler — team\n");

  const db = await connect();

  try {
    if (listOnly) {
      await listMembers(db);
      return;
    }

    if (deleteEmail) {
      const { rowCount } = await db.query(`delete from auth.users where lower(email) = lower($1)`, [
        deleteEmail,
      ]);
      console.log(
        rowCount
          ? `  Deleted ${deleteEmail}.\n`
          : `  No account found for ${deleteEmail}.\n`,
      );
      return;
    }

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
      const email = m.email!.trim().toLowerCase();
      const fullName = (m.name || email.split("@")[0]).trim();

      const { rows: existing } = await db.query<{ id: string }>(
        `select id from auth.users where lower(email) = $1`,
        [email],
      );

      if (existing.length > 0) {
        await db.query(
          `update public.profiles set full_name = $2, role = $3::public.user_role, is_active = true
            where id = $1`,
          [existing[0].id, fullName, m.role],
        );
        console.log(`  =  ${email.padEnd(34)} ${m.role}  (already existed, role confirmed)`);
        continue;
      }

      await db.query("begin");
      try {
        const id = await createAuthUser(db, {
          email,
          password: m.password!,
          fullName,
          role: m.role,
        });

        // The trigger creates the profile; make sure the role took.
        await db.query(
          `update public.profiles set full_name = $2, role = $3::public.user_role, is_active = true
            where id = $1`,
          [id, fullName, m.role],
        );

        await db.query("commit");
        console.log(`  +  ${email.padEnd(34)} ${m.role}`);
      } catch (err) {
        await db.query("rollback").catch(() => {});
        console.error(`  !  ${email.padEnd(34)} ${(err as Error).message}`);
      }
    }

    console.log("");
    await listMembers(db);
    console.log("  Everyone should change their password after signing in.\n");
  } finally {
    await db.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(`\n  Failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
