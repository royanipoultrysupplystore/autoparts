import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * A missing environment variable once took down every route in the app,
 * including the static ones, as a bare "Internal Server Error".
 *
 * The cause: `proxy.ts` runs before everything, and the Supabase client
 * throws when handed an undefined URL. Nothing caught it, so one absent
 * config value looked like a total outage with no diagnostic anywhere.
 *
 * These tests keep the guard in place.
 */

const SRC = join(process.cwd(), "src");

test("the proxy checks the environment before building a client", async () => {
  const proxy = await readFile(join(SRC, "proxy.ts"), "utf8");

  const guardAt = proxy.indexOf("readServerEnv()");
  const clientAt = proxy.indexOf("createServerClient(");

  assert.ok(guardAt !== -1, "proxy.ts does not check the environment at all");
  assert.ok(clientAt !== -1, "proxy.ts no longer creates a Supabase client");
  assert.ok(
    guardAt < clientAt,
    "proxy.ts builds the Supabase client before checking the environment, " +
      "so a missing variable will throw and 500 every route",
  );
});

test("the proxy never passes a bare process.env value to Supabase", async () => {
  const proxy = await readFile(join(SRC, "proxy.ts"), "utf8");

  // `process.env.X!` asserts non-null to TypeScript and does nothing at
  // runtime -- which is exactly how the outage happened.
  assert.ok(
    !/process\.env\.NEXT_PUBLIC_SUPABASE_URL!/.test(proxy),
    "proxy.ts uses a non-null assertion on NEXT_PUBLIC_SUPABASE_URL",
  );
  assert.ok(
    !/process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY!/.test(proxy),
    "proxy.ts uses a non-null assertion on NEXT_PUBLIC_SUPABASE_ANON_KEY",
  );
});

test("the setup screen is reachable without authentication", async () => {
  const proxy = await readFile(join(SRC, "proxy.ts"), "utf8");
  assert.ok(
    proxy.includes('"/setup-required"'),
    "/setup-required is not in the proxy's public list, so an unconfigured " +
      "deployment would redirect it to /login and loop",
  );
});

test("the Supabase clients explain themselves when unconfigured", async () => {
  for (const [file, reader] of [
    ["client.ts", "readClientEnv"],
    ["server.ts", "readServerEnv"],
  ] as const) {
    const source = await readFile(join(SRC, "lib", "supabase", file), "utf8");

    assert.ok(source.includes(reader), `${file} does not use ${reader}`);
    assert.ok(
      /Supabase is not configured/.test(source),
      `${file} does not say what is wrong when unconfigured`,
    );
  }
});

test("config reaches the browser at request time, not build time", async () => {
  const component = await readFile(
    join(SRC, "components", "runtime-config.tsx"),
    "utf8",
  );

  // Without a request API this component is prerendered once and the
  // environment is frozen into the HTML at build time -- the exact
  // failure this indirection exists to avoid.
  assert.ok(
    /await headers\(\)|await connection\(\)|await cookies\(\)/.test(component),
    "runtime-config.tsx touches no request API, so Next.js will prerender it " +
      "and bake build-time values into every page",
  );
  assert.ok(component.includes("publicConfigScript"));

  const layout = await readFile(join(SRC, "app", "layout.tsx"), "utf8");
  assert.ok(
    layout.includes("RuntimeConfigScript"),
    "the root layout does not inject the runtime config",
  );
});

test("the server accepts unprefixed variable names too", async () => {
  const env = await readFile(join(SRC, "lib", "env.ts"), "utf8");

  // NEXT_PUBLIC_* is substituted at build time even in server code, so an
  // unprefixed name is the only one that can be read at runtime.
  assert.ok(env.includes("process.env.SUPABASE_URL"));
  assert.ok(env.includes("process.env.SUPABASE_ANON_KEY"));
});

test("env.ts reads each variable as a literal lookup", async () => {
  const env = await readFile(join(SRC, "lib", "env.ts"), "utf8");

  // Next.js only inlines literal `process.env.NAME`. Anything computed
  // resolves to undefined in the browser bundle, however correct it looks.
  assert.ok(env.includes("process.env.NEXT_PUBLIC_SUPABASE_URL"));
  assert.ok(env.includes("process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY"));
  assert.ok(
    !/process\.env\[/.test(env),
    "env.ts uses a dynamic process.env lookup, which Next.js cannot inline",
  );
});
