# PLYDECK · Phase 2 — deployment bundle

Start with `START_HERE.md`. All SQL is in `supabase/`; choose new setup or upgrade in `supabase/README_SQL.md`. This bundle includes migration 010 for final rate-card pricing.

When upgrading an older Razorpay-enabled checkout, run `powershell -ExecutionPolicy Bypass -File .\scripts\remove-legacy-razorpay.ps1` before `npm.cmd run build`. This removes obsolete checkout routes that ZIP extraction cannot delete.

A city-first plywood buying webapp for retailers and contractors. Built with Next.js App Router, React, TypeScript and Supabase, for deployment on Vercel.

## Start in VS Code

1. Extract this ZIP to a new folder, for example `C:\plydeck`, or directly over the existing repository root after preserving `.env.local`. Do not keep it as a nested folder inside an older PLYDECK project. Open the folder containing `package.json`, `app`, `components` and `lib` together in VS Code.
2. Use Node.js 22.13+ or 24 LTS. Open a terminal in that folder.
3. Run:

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run dev
```

4. Open `http://localhost:3000`. Select Bengaluru. The demo flag in `.env.local` enables a local preview without Supabase credentials.
5. Choose a pool, review the fixed plywood contents, select slots and accept the terms. Continue as a demo buyer and enter sample business details. Use a syntactically valid sample business tax ID such as `29ABCDE1234F1Z5` only in demo.
6. Click **Explore admin** in the demo banner to edit categories, pools and shared shipments. Demo state is stored only in this browser. It does not create Supabase rows or collect money.

To reset the demo, clear the browser's `plydeck-demo-v1` local-storage entry. City preference is stored as `plydeck-city`.

## What is included

- Branded city-first storefront using PLYDECK copper `#a8724d` and deep teal `#0d373f`, with material categories, moat, two-sided value carousel, process guide, FAQs and responsive navigation.
- Public About, Terms, Refund, Privacy and Shipping & Delivery pages, plus sitemap and robots routes.
- Two Bengaluru OEM pools, five slots each, standard 8 × 4 ft.
- Exactly 100 fixed 8 × 4 ft sheets per slot: 50 MR 16mm, 20 BWP 16mm, 15 MR 6mm and 15 BWP 6mm. Buyers choose slot numbers only; they cannot change quantities.
- Admin rate card stores a separate final rate per sft for each of the four fixed items. The customer total is the direct sum of those four lines; no spread, operational allocation, rounding uplift or separate tax line is added by the quotation engine.
- Direct slot reservation: authenticated buyers confirm and immediately lock available fixed slots; no online payment gateway is used.
- Admins can block or unblock available slots with a reason, and record verified offline payments in 10%, 40% and 50% stages. Blocked slots count toward pool allocation; only reserved orders require payment.
- Business login, registration, email verification, password reset, tax-registration and billing profile.
- Customer order history within the same storefront, QC report and reservation actions.
- In-app admin for category visibility, simplified pool price/specification setup and publication, internal shipment capacity, orders, QC and FIFO waiting-list offers. Public pool listings are image-free responsive cards; drafts stay private until **Publish pool** is used.
- Supabase row-level security; server-only privileged RPCs; atomic slot allocation and shared payload checks; immutable quotes after reservation.
- Consent-based WhatsApp Cloud API outbox, approved-template worker, signed webhook delivery updates, inbound message log and in-app admin WhatsApp log.
- Post-QC replacements use the same fixed four-item slot. They cannot change already produced goods. All three instalments must still clear before dispatch.

## Initial pricing assumptions

The two pools share one 32,000 kg cargo-payload shipment with a 600 kg packing allowance. Default goods weight is 28,000 kg. Provisional sheet weights are 32 kg for 16mm and 12 kg for 6mm.

The initial ₹56/sqft final rate is applied to all four rate-card items. These are worked assumptions, not independently verified commercial rates. Enter the confirmed MR/BWP final rates for both thicknesses before publishing.

Freight, unloading, warehouse and other operating costs are managed internally. They are not added automatically to the customer quotation. Administrators must include the intended commercial recovery directly in each published final rate. Weight remains separately enforced for truck-capacity checks.

When all four final rates are ₹56/sqft, one 3,200-sqft fixed slot is ₹1,79,200. The total changes only when an administrator changes the four-item final rate card before reservations.

All money in quotes is stored as integer paise. Pool totals reconcile to the sum of accepted customer orders; do not recalculate historical orders from a revised rate card.

## Next: connect Supabase and WhatsApp

Follow `docs/DEPLOYMENT.md` in order, then complete `docs/WHATSAPP_SETUP.md` for Meta templates and webhook verification. No gateway credentials are required: reservations lock atomically and administrators confirm offline receipts from Manage > Orders.

Production seed pools start as drafts so the provisional factory specifications and freight assumptions cannot accidentally become paid offers. Edit the draft pool, replace pending specifications, verify commercial terms, and use Publish pool to make it visible. In demo mode, both sample pools are open immediately.

## WhatsApp integration

Read `docs/WHATSAPP_SETUP.md` before enabling provider sends. WhatsApp is disabled by default and only opted-in buyers are messaged. The queue uses approved utility templates, server-only credentials, signed webhook validation, retry limits and a provider status log.

## Operational boundaries

- This is a responsive webapp, not an Android/iOS store binary.
- WhatsApp notifications are included in Phase 2. Sending remains disabled until Meta credentials, approved utility templates, webhook verification and `WHATSAPP_ENABLED=true` are configured. Demo mode never sends messages. Staff must still deliver written default notices and record their reference before the cure period and reassignment.
- The one-week delivery date is a target starting at pool confirmation. It is not an unconditional transit guarantee.
- The source includes draft commercial terms. Replace seller legal identity, contact, jurisdiction and support details with the actual operating entity before launch, and obtain an India-specific review of the cancellation terms.
- The storefront exposes accurate reservation/hold counts. There are no fabricated live bookings or invented waiting buyers.
- Admin pool prices and specs lock after the first reservation, including an expired reservation. Create a new pool for changed commercial terms. This preserves the accepted quotation history.
- Current admin lists are designed for the first pilot. Add server pagination and operational reporting as order volumes grow.

## Verification

```powershell
npm.cmd run test
npm.cmd run build
```

The tests run pricing and PostgreSQL-compatible integration tests using PGlite: schema application, direct slot exclusivity, shared payload limits, administrator permissions, QC/dispatch transitions and waiting-list replacement. They do not connect to a live Supabase project. Hosted browser and provider tests remain deployment gates.

## Project map

| Path | Purpose |
|---|---|
| `components/storefront.tsx` | Storefront, login, slot configuration and customer orders |
| `components/admin-panel.tsx` | In-app admin controls |
| `components/terms.tsx` | Versioned customer terms |
| `lib/pricing.ts` | Deterministic quote and instalment calculations |
| `lib/validation.ts` | Server input validation |
| `lib/server.ts` | Server identity, admin checks and RPC helpers |
| `lib/whatsapp-server.ts` | Meta payloads, phone normalization, queue worker helpers and webhook signatures |
| `app/api/` | Authenticated server endpoints |
| `supabase/migrations/` | Schema, security, transaction functions and WhatsApp outbox triggers |
| `supabase/seed.sql` | Production draft categories and pools |
| `tests/` | Pricing, database and WhatsApp utility checks |

The representative plywood photograph is original AI-generated catalog imagery. It does not depict a verified factory batch. Google Fonts are loaded over HTTPS with local system-font fallbacks.

## Reference documentation

- Supabase authenticated user validation: https://supabase.com/docs/reference/javascript/auth-getuser
- Indian Contract Act, section 74: https://www.incometaxindia.gov.in/w/section-74-104

## Phases

1. **Phase 1:** complete pilot source, local demo, admin and schema.
2. **This delivery (Phase 2):** direct slot reservation, consent-based Meta WhatsApp queue, worker, signed webhook and admin log.
3. **Connect and verify:** dedicated Supabase project, first admin account, Meta test recipient, Vercel preview and browser testing.
4. **Pilot launch:** confirmed material specs and freight, reviewed seller terms, buyer onboarding and the first two published pools.
