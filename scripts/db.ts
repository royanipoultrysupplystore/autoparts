/**
 * Shared Postgres connection for the scripts.
 *
 * Seeding goes over the database connection rather than the REST API,
 * which means it needs the database password and not the service role
 * key -- one fewer secret to hand around, and it works from anywhere the
 * database is reachable.
 *
 * Supabase's direct host is IPv6-only on newer projects. Where that
 * cannot be reached, the IPv4 session-mode pooler speaks the same
 * protocol and handles DDL and DML alike.
 */

import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });
config({ path: ".env" });

const POOLER_REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "ca-central-1", "eu-west-1", "eu-west-2", "eu-central-1",
  "ap-southeast-1", "ap-southeast-2", "ap-south-1", "ap-northeast-1",
  "sa-east-1",
];

export function requireDbUrl(): string {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error(
      "\n  SUPABASE_DB_URL is not set in .env.local.\n" +
        "  Supabase dashboard -> Project Settings -> Database -> Connection string (URI).\n" +
        "  URL-encode any special characters in the password (@ becomes %40).\n",
    );
    process.exit(1);
  }
  return url;
}

function poolerCandidates(direct: string): string[] {
  const url = new URL(direct);
  const match = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(url.hostname);
  if (!match) return [];

  return POOLER_REGIONS.map(
    (region) =>
      `postgresql://postgres.${match[1]}:${url.password}` +
      `@aws-0-${region}.pooler.supabase.com:5432/postgres`,
  );
}

export async function connect(quiet = false): Promise<pg.Client> {
  const direct = requireDbUrl();
  const attempts = [
    { label: "direct", url: direct },
    ...poolerCandidates(direct).map((url, i) => ({
      label: `pooler ${POOLER_REGIONS[i]}`,
      url,
    })),
  ];

  let lastError: Error | null = null;

  for (const attempt of attempts) {
    const client = new pg.Client({
      connectionString: attempt.url,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 12000,
      statement_timeout: 180000,
    });

    try {
      await client.connect();
      if (!quiet) console.log(`  connected via ${attempt.label}\n`);
      return client;
    } catch (err) {
      lastError = err as Error;
      await client.end().catch(() => {});

      // A rejected password is final -- do not work through every region
      // hammering the same wrong credential.
      const code = (err as { code?: string }).code;
      if (code === "28P01" || code === "28000") {
        throw new Error(`Authentication failed: ${(err as Error).message}`);
      }
    }
  }

  throw new Error(
    `Could not reach the database. Last error: ${lastError?.message ?? "unknown"}`,
  );
}
