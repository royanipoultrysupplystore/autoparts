<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Mahmood Shah Auto Recycler — conventions

Run `npm run verify` before calling anything done. It is typecheck + unit
and architectural tests + a migration harness that applies every SQL file
to a real Postgres (PGlite) and asserts each guarantee below.

## Rules that must not be broken

1. **Money is integer cents.** Every currency column is `bigint`. Never
   multiply a float to get cents — always `parseMoneyToCents()`, which
   reads the digits out of the string. `Math.round(1.005 * 100)` is 100,
   not 101. Tested in `tests/money.test.ts`.

2. **A part can never be sold twice.** Selling goes through `sell_part()`,
   whose UPDATE carries its own status guard. Never write
   `parts.status = 'sold'` directly from application code.

3. **`staff` can never see costs or profit.** The five cost columns on
   `vehicles` are revoked from `authenticated` at the database level. Do
   not add them to `VEHICLE_COLUMNS`. Costs come from `vehicle_finance`
   only. Reporting functions re-check the role and raise.

4. **Catalog edits never rewrite history.** `parts` snapshots `name`,
   `category`, and `icon_key`. Never join a part to its catalog entry to
   display a name.

5. **The storefront layer stays isolated.** `src/lib/data/public-shop.ts`
   builds its own anon client and touches only `public_parts` and
   `search_public_parts`. Never import `@/lib/supabase/server` into it or
   into any `/shop` route. Enforced by `tests/isolation.test.ts`.

6. **Destructive actions confirm and log.** Deleting writes to
   `activity_log` before the row goes. Deleting a vehicle with recorded
   sales is refused, not confirmed.

## Conventions

- All timestamps stored UTC, displayed `America/Vancouver` via
  `src/lib/format.ts`. A bare `date` column must not go through
  `new Date()` directly — it parses as UTC midnight and renders as the
  previous day locally.
- Primary actions go at the **bottom** of sheets; minimum 44px tap
  targets; every screen must work one-handed at 375px wide.
- Amber is reserved for the `reserved` status. The accent is steel blue.
- Status is always a filled pill carrying the word, never coloured text.
- Skeletons, not spinners. Empty states say what to do next.
- Part icons are hand-authored in `src/lib/icons/part-icons.tsx`. Do not
  add an icon package.
- Server data modules are `import "server-only"`. Client components must
  not import from `@/lib/data/`.
