/**
 * Read-only look at the live database.  `npm run db:inspect`
 *
 * Reports what Supabase already provides — installed extensions and the
 * schema they live in, the client roles, the realtime publication — plus
 * whatever this app has created so far. Changes nothing.
 */

import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });
config({ path: ".env" });

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.error("\n  SUPABASE_DB_URL is not set in .env.local.\n");
  process.exit(1);
}

const QUERIES: { title: string; sql: string }[] = [
  {
    title: "Extensions",
    sql: `select e.extname as name, n.nspname as schema, e.extversion as version
          from pg_extension e join pg_namespace n on n.oid = e.extnamespace
          order by e.extname`,
  },
  {
    title: "Client roles",
    sql: `select rolname as name, rolbypassrls as bypasses_rls, rolsuper as superuser
          from pg_roles
          where rolname in ('anon','authenticated','service_role','postgres','supabase_admin')
          order by rolname`,
  },
  {
    title: "search_path",
    sql: `select current_setting('search_path') as value`,
  },
  {
    title: "Realtime publication",
    sql: `select pubname as name, puballtables as all_tables from pg_publication order by pubname`,
  },
  {
    title: "Tables in public",
    sql: `select c.relname as name, c.relrowsecurity as rls,
                 (select count(*) from pg_policy p where p.polrelid = c.oid)::int as policies
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r'
          order by c.relname`,
  },
  {
    title: "Views in public",
    sql: `select table_name as name from information_schema.views
          where table_schema = 'public' order by table_name`,
  },
  {
    title: "Auth users",
    sql: `select count(*)::int as count from auth.users`,
  },
  {
    title: "Storage buckets",
    sql: `select id, public from storage.buckets order by id`,
  },
];

function table(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "    (none)";

  const cols = Object.keys(rows[0]);
  const width = cols.map((c) =>
    Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length)),
  );

  const line = (cells: string[]) =>
    "    " + cells.map((c, i) => c.padEnd(width[i])).join("  ");

  return [
    line(cols),
    "    " + width.map((w) => "-".repeat(w)).join("  "),
    ...rows.map((r) => line(cols.map((c) => String(r[c] ?? "")))),
  ].join("\n");
}

async function main() {
  const client = new pg.Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  await client.connect();
  console.log("");

  for (const q of QUERIES) {
    try {
      const { rows } = await client.query(q.sql);
      console.log(`  ${q.title}`);
      console.log(table(rows as Record<string, unknown>[]));
      console.log("");
    } catch (err) {
      console.log(`  ${q.title}\n    unavailable: ${(err as Error).message}\n`);
    }
  }

  await client.end();
}

main().catch((err) => {
  console.error(`\n  ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
