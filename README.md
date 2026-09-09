# Mahmood Shah Auto Recycler

Shared parts inventory, sales, and profit reporting for a Vancouver auto
recycler. Four partners, one shelf, four phones.

The problem it solves: when a customer messages one partner asking "do you
have a front bumper for a 2016 Civic", that partner can now answer in
seconds — and cannot promise a part another partner sold an hour ago.

---

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript, Turbopack) |
| Database, auth, storage, realtime | Supabase (Postgres 15+) |
| Styling | Tailwind CSS v4, Radix primitives |
| Install | PWA — home screen, no app store |
| Deploy | Vercel |
| Currency | CAD, stored as integer cents everywhere |
| Time | Stored UTC, displayed `America/Vancouver` |

---

## Getting it running

### 1. Create a Supabase project

At [supabase.com](https://supabase.com). The free tier is enough to start.

### 2. Environment

```bash
cp .env.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` from **Project Settings → API**.

The service role key bypasses every security policy in the database. It is
used only by the seed scripts. Never commit it and never prefix it with
`NEXT_PUBLIC_`.

### 3. Apply the migrations

Either paste each file from `supabase/migrations/` into the Supabase SQL
editor **in numeric order**, or use the CLI:

```bash
npx supabase link --project-ref <your-project-ref>
npm run db:push
```

Run them in order — later files depend on earlier ones.

### 4. Create the accounts

Fill the `SEED_*` variables in `.env.local` with the four partners (one as
owner), then:

```bash
npm run seed:users
```

Everyone should change their password after their first sign-in.

### 5. Load the parts catalog

```bash
npm run seed            # catalog + a demo yard to look around
npm run seed:catalog    # catalog only -- use this for the real database
```

The catalog is **reference data**: vehicles cannot generate a parts list
without it. The demo yard is **demo data**, tagged `[demo]` on every row and
removable with `npm run seed:clear-demo`.

### 6. Go

```bash
npm run dev
```

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run verify` | Typecheck + unit tests + migration harness |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit and architectural tests |
| `npm run db:verify` | Applies every migration to a throwaway Postgres and asserts the guarantees below |
| `npm run db:push` | Push migrations via the Supabase CLI |
| `npm run seed` | Catalog + demo yard |
| `npm run seed:catalog` | Catalog only (production) |
| `npm run seed:demo` | Demo yard only |
| `npm run seed:clear-demo` | Remove every demo row |
| `npm run seed:users` | Create the partner accounts |
| `npm run icons:generate` | Re-render the PWA icons from the app mark |

---

## Deploying to Vercel

1. Push to a Git repository and import it at [vercel.com](https://vercel.com).
2. Add the three Supabase variables plus `NEXT_PUBLIC_ENABLE_STOREFRONT=false`
   under **Settings → Environment Variables**.
3. In Supabase, add your Vercel URL under **Authentication → URL
   Configuration → Site URL** and **Redirect URLs**.
4. Deploy. Open it on a phone and use **Add to Home Screen**.

---

## The guarantees, and how they are held

These are enforced in the database, not the interface. `npm run db:verify`
applies every migration to a real Postgres (via PGlite) and asserts each one.

### A part can never be sold twice

`sell_part()` carries its own status guard:

```sql
update public.parts set status = 'sold'
 where id = p_part_id and status in ('available', 'reserved')
```

If that affects zero rows, the caller gets a payload naming who won, when,
and for how much — *"Already sold by Ahmad for $180.00, 4 minutes ago."*
Never a silent failure. `sales.part_id` also carries a unique constraint, so
even a bug in the function cannot produce two sales. The status flip and the
sales row share one transaction.

### A `staff` account can never see costs or profit

Three independent layers, because one is not enough:

1. `REVOKE SELECT` on the five cost columns of `vehicles` from
   `authenticated`. No query — not even `select *` — can return them.
2. Costs are readable only through `vehicle_finance`, a security-definer
   view whose `WHERE` clause calls `has_finance_access()`. It returns zero
   rows to staff.
3. Every reporting function re-checks the role on entry and raises
   `insufficient_privilege`. `dashboard_stats()` omits the money keys
   entirely rather than sending nulls.

### Catalog edits never rewrite history

`parts` snapshots `name`, `category`, and `icon_key` at creation. Renaming a
catalog entry changes what future vehicles generate and nothing else.

### Money is integer cents, everywhere

Every currency column is `bigint`. `parseMoneyToCents()` reads the digits out
of the string rather than multiplying a float — `Math.round(1.005 * 100)` is
**100**, not 101, because the nearest double to 1.005 is 1.00499999999999989.
Covered by `tests/money.test.ts`.

### Destructive actions are confirmed and logged

Deleting a vehicle or part requires confirmation and writes to
`activity_log` before the row disappears. Deleting a vehicle that has
recorded sales is **refused outright**, not confirmed — it would erase that
revenue from every report.

### Reservations cannot become ghost holds

A hold sets `reserved_until` 48 hours out. `expire_reservations()` returns
expired parts to the shelf and logs a notice against the partner who placed
the hold. It reads the holds *before* clearing them, because
`UPDATE ... RETURNING` hands back the new row where `reserved_by` is already
null. `FOR UPDATE SKIP LOCKED` keeps four phones sweeping at once from
piling up.

---

## Architecture notes

### Search

One RPC, one trigram index. `parts.search_text` denormalises the part name,
side, category, and its vehicle's year/make/model/trim/stock number, so
`"civic mirror"` matches across the join in a single pass and `"bumpr"`
still finds a front bumper cover. Every whitespace token must match, either
as a substring or by trigram word similarity.

The search screen queries Supabase directly from the browser rather than
through a Next.js route, so results land while the partner is still
mid-sentence. A request-id guard stops a slow early response overwriting a
fresher one.

### Realtime

`parts` is in the `supabase_realtime` publication with
`REPLICA IDENTITY FULL`. A status change patches the matching row on the
other three phones — greys it out, flashes it, and says what happened. Your
own actions don't toast: the optimistic update already set that status, so
the equality check short-circuits.

### Cost allocation

Stated once, in `0006_reporting.sql`, and used consistently: a sold part is
charged a share of its vehicle's total invested cost, proportional to its
asking price against the sum of asking prices of every non-scrapped part on
that vehicle. Where a vehicle has no asking prices at all, cost is split
evenly by part count. The monthly report says this on screen.

### The two profit figures

The monthly report shows **net profit (cash basis)** and **gross profit on
parts sold (allocated cost basis)** side by side, each labelled with its
basis. Cash basis alone makes any month with three cars bought in it look
like a disaster; the allocated figure says whether the business is actually
working. Neither is presented as "the" profit.

### Storefront isolation

`src/lib/data/public-shop.ts` builds its own anonymous Supabase client and
touches only `public_parts` and `search_public_parts` — the only two objects
granted to `anon`. The view carries no cost, shelf, VIN, note, or internal
asking-price column, so there is nothing there to leak.
`tests/isolation.test.ts` fails if a future edit imports an authenticated
client into that layer or a `/shop` route.

Part slugs (`2016-honda-civic-front-bumper-cover-v0147-1`) are generated at
creation, so public URLs are correct from day one and never change.

### Service worker

Caches the app shell only: hashed build output, icons, and one static
`/offline` page. **No HTML page is ever cached** — every screen is a
signed-in view of shared data, and a cached page could show a stale shelf or
appear on a different account after a sign-out. Navigations always hit the
network and fall back to `/offline`.

---

## Roles

| | Search & sell | Edit parts | Vehicle costs | Reports | Expenses | Delete | Team |
|---|---|---|---|---|---|---|---|
| `owner` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `partner` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| `staff` | ✅ | ✅ | — | — | — | — | — |

---

## Turning the storefront on

The plumbing is live from day one; the shop is not.

1. Publish parts: open a vehicle → **Select** → choose parts → **Publish**.
   Public prices default to the asking price so nothing lists without a
   number on it.
2. Set `NEXT_PUBLIC_ENABLE_STOREFRONT=true` and redeploy.

`/shop` returns 404 until that flag flips. There is no cart — prices are
shown in full and buyers are asked to get in touch.

---

## Design decisions worth knowing

- **Light theme is the default.** This app is used outdoors in Vancouver
  daylight. Dark mode is a toggle in More.
- **The accent is steel blue, not amber.** Amber is spent entirely on the
  `reserved` status, so it cannot also be the brand colour.
- **Status is always a filled pill carrying the word.** Colour alone is not
  a signal you can rely on in bright light or if you are colour blind.
- **Primary actions sit at the bottom of every sheet**, never the top. That
  is where the thumb is.
- **The trim screen leads with bulk actions.** The catalog in this build
  generates 239 parts per vehicle, not the ~150 the original spec estimated —
  so whole-category toggles and a "high value only" button are the primary
  interaction, not a secondary one.
