# Costco Splitter MVP

A small Next.js app for a six-person household Costco run. One person uploads the Costco.com PDF receipt, chooses how many people are participating that week, and shares one trip link. Each person selects their name and taps the items they want to split. The app continuously recalculates exact per-person totals.

## What this first version does

- Supports **1-6 people per trip**.
- Remembers household names in the trip creator's browser so weekly setup is faster.
- Lets the creator choose who paid.
- Uploads a **Costco Orders & Purchases PDF** and extracts item code, abbreviated item name, item price, quantity hints, item-level instant savings, subtotal, tax, total and receipt date when available.
- Shows the parsed items for manual correction before the trip is created.
- Creates an unguessable shared link. No roommate accounts/passwords are needed.
- Lets each roommate choose their name and toggle any item on/off.
- Supports any split from 1 person through everyone on each item.
- Uses cent-safe rounding. Example: $10 / 3 becomes $3.34 + $3.33 + $3.33, so the receipt always reconciles.
- Tracks who has marked themselves done.
- Shows running totals, unclaimed items, payer status, and copyable Venmo-request amounts.
- Polls every five seconds so roommates see each other's updates without adding realtime infrastructure yet.

## Stack

- Next.js App Router
- Vercel-compatible Node API routes
- Supabase Postgres for shared state across phones/laptops
- `pdfjs-dist` for server-side PDF text extraction
- Plain CSS (no Tailwind dependency)

## 1. Create Supabase storage

Create a Supabase project and run `supabase/schema.sql` in the Supabase SQL editor.

The schema enables RLS and creates no browser-access policies. The app talks to Supabase only from server API routes with the service-role key. Do **not** expose the service-role key in client code.

## 2. Configure environment variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in:

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

## 3. Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Run the built-in parser/split tests with:

```bash
npm test
```

## 4. Deploy on Vercel

1. Push this folder to GitHub.
2. Import the repository into Vercel.
3. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the Vercel project environment variables.
4. Deploy.

The created trip URL is what you send to the roommates.

## Costco PDF parser notes

The parser is intentionally tuned first to the Costco.com Orders & Purchases PDF layout used by the supplied sample. It:

- stops parsing item rows once it reaches `SUBTOTAL`, preventing card/payment lines from being mistaken for products;
- recognizes Costco lines such as `E 1150189 ORG SKINYPOP 6.99 N`;
- applies discount rows such as `388719 /1424237 2.00-` back to the matching item code;
- recognizes a quantity hint like `2 @ 11.99` and associates it with the next line item;
- compares the sum of parsed net item prices to the receipt subtotal before the trip is created.

Because Costco may alter its PDF format, the creator can edit every parsed item before creating a trip. If a future receipt layout fails, `lib/costcoParser.js` is the main file to extend.

## Current MVP limitations / sensible V2 work

- Tax is captured from the receipt but not automatically allocated. This is irrelevant to the supplied Delaware receipt because its tax is $0.00, but a tax-allocation rule should be added before using this broadly in taxable locations.
- Anyone with a trip link can change selections. That is deliberate for a six-person household MVP. A creator/admin token can be added later if you want locked/finalized trips.
- Roommates mark themselves done manually. Editing a selection automatically marks them unfinished again.
- Item names are Costco's abbreviated receipt descriptions. A future version could map recurring item codes to friendlier saved names (for example, `BNLS/SL BRST` -> `Chicken breast`).
- It polls every five seconds rather than using Supabase Realtime.
- There is no Venmo API integration; it generates/copies request amounts for the payer.

## Suggested next upgrades

The most useful next changes are likely: saved friendly item names by Costco item code, a creator-only finalize/lock action, recurring household defaults, true realtime updates, and a weekly history page showing past trips and totals.
