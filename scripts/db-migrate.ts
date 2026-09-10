/**
 * Migration runner.  `npm run db:migrate`
 *
 * Applies every file in supabase/migrations to the project named by
 * SUPABASE_DB_URL, in numeric order, tracking what has already run in a
 * `schema_migrations` table so re-running is safe.
 *
 * Each file runs inside its own transaction: a file either applies whole
 * or not at all, and a failure leaves the database on the last good
 * migration rather than half way through a broken one.
 *
 * Flags:
 *   --dry     list what would run, change nothing
 *   --status  show what has been applied
 */

import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });
config({ path: ".env" });

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry");
const statusOnly = args.has("--status");

const DB_URL = process.env.SUPABASE_DB_URL;

if (!DB_URL) {
  console.error(
    "\n  SUPABASE_DB_URL is not set in .env.local.\n" +
      "  Supabase dashboard -> Project Settings -> Database -> Connection string (URI).\n" +
      "  Remember to URL-encode any special characters in the password.\n",
  );
  process.exit(1);
}

/**
 * Tracking lives in its own schema, not `public`.
 *
 * Everything in `public` is published by PostgREST as a REST endpoint,
 * and Supabase's default privileges grant it to `anon`. A bookkeeping
 * table is not something the internet needs to be able to list.
 */
const TRACKING_TABLE = `
create schema if not exists app_migrations;

revoke all on schema app_migrations from public, anon, authenticated;

create table if not exists app_migrations.schema_migrations (
  filename    text primary key,
  checksum    text not null,
  applied_at  timestamptz not null default now()
);

revoke all on app_migrations.schema_migrations from public, anon, authenticated;

-- Carry over anything recorded by an earlier run that used public.
do $migrate$
begin
  if to_regclass('public.schema_migrations') is not null then
    insert into app_migrations.schema_migrations (filename, checksum, applied_at)
    select filename, checksum, applied_at from public.schema_migrations
    on conflict (filename) do nothing;

    drop table public.schema_migrations;
  end if;
end
$migrate$;
`;

function sha(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

/**
 * Supabase's direct host is IPv6-only on newer projects, which fails from
 * plenty of home and office networks. Fall back to the IPv4 session-mode
 * pooler, which speaks the same protocol and handles DDL fine.
 */
function poolerUrl(direct: string): string | null {
  const url = new URL(direct);
  const match = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(url.hostname);
  if (!match) return null;

  const ref = match[1];
  // Region is not in the direct URL, so try the common ones in turn.
  return `postgresql://postgres.${ref}:${url.password}@aws-0-REGION.pooler.supabase.com:5432/postgres`;
}

const POOLER_REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "ca-central-1", "eu-west-1", "eu-west-2", "eu-central-1",
  "ap-southeast-1", "ap-southeast-2", "ap-south-1", "ap-northeast-1",
  "sa-east-1",
];

async function connect(): Promise<pg.Client> {
  const attempts: { label: string; url: string }[] = [
    { label: "direct", url: DB_URL! },
  ];

  const template = poolerUrl(DB_URL!);
  if (template) {
    for (const region of POOLER_REGIONS) {
      attempts.push({
        label: `pooler ${region}`,
        url: template.replace("REGION", region),
      });
    }
  }

  let lastError: Error | null = null;

  for (const attempt of attempts) {
    const client = new pg.Client({
      connectionString: attempt.url,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 12000,
      statement_timeout: 120000,
    });

    try {
      await client.connect();
      console.log(`  connected via ${attempt.label}\n`);
      return client;
    } catch (err) {
      lastError = err as Error;
      await client.end().catch(() => {});

      const code = (err as { code?: string }).code;
      // Wrong password or a real server refusal: stop, do not keep trying
      // regions. Only host-resolution failures are worth another attempt.
      if (code === "28P01" || code === "28000") {
        throw new Error(`Authentication failed: ${(err as Error).message}`);
      }
    }
  }

  throw new Error(
    `Could not reach the database. Last error: ${lastError?.message ?? "unknown"}`,
  );
}

async function main() {
  console.log("\n  Mahmood Shah Auto Recycler — migrations\n");

  const client = await connect();

  try {
    await client.query(TRACKING_TABLE);

    const applied = new Map<string, string>(
      (
        await client.query<{ filename: string; checksum: string }>(
          "select filename, checksum from app_migrations.schema_migrations",
        )
      ).rows.map((r) => [r.filename, r.checksum]),
    );

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    if (statusOnly) {
      for (const file of files) {
        const state = applied.has(file) ? "applied" : "pending";
        console.log(`  ${state.padEnd(8)} ${file}`);
      }
      console.log("");
      return;
    }

    let ran = 0;

    for (const file of files) {
      const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
      const checksum = sha(sql);

      if (applied.has(file)) {
        if (applied.get(file) !== checksum) {
          console.log(
            `  changed  ${file}\n` +
              `           This file has been edited since it was applied. Migrations are\n` +
              `           append-only: add a new file rather than editing an applied one.`,
          );
        } else {
          console.log(`  skip     ${file}`);
        }
        continue;
      }

      if (dryRun) {
        console.log(`  would    ${file}`);
        continue;
      }

      // One transaction per file, so a failure cannot leave a partial schema.
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          "insert into app_migrations.schema_migrations (filename, checksum) values ($1, $2)",
          [file, checksum],
        );
        await client.query("commit");
        console.log(`  ok       ${file}`);
        ran += 1;
      } catch (err) {
        await client.query("rollback").catch(() => {});
        console.error(`\n  FAILED   ${file}`);
        console.error(`           ${(err as Error).message}\n`);
        const position = (err as { position?: string }).position;
        if (position) {
          const upto = sql.slice(0, Number(position));
          const line = upto.split("\n").length;
          console.error(`           at line ${line}:\n`);
          console.error(
            sql
              .split("\n")
              .slice(Math.max(0, line - 4), line + 2)
              .map((l, i) => `           ${Math.max(1, line - 3) + i} | ${l}`)
              .join("\n"),
          );
          console.error("");
        }
        process.exitCode = 1;
        return;
      }
    }

    if (dryRun) {
      console.log("\n  Dry run: nothing was changed.\n");
      return;
    }

    console.log(
      ran === 0
        ? "\n  Already up to date.\n"
        : `\n  Applied ${ran} migration${ran === 1 ? "" : "s"}.\n`,
    );
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(`\n  ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
