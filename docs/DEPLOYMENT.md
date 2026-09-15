# PLYDECK deployment

PLYDECK is a Next.js + Supabase app for direct slot reservations. No Razorpay or other payment gateway is required for booking.

## 1. Local setup

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run dev
```

Set `NEXT_PUBLIC_DEMO_MODE=true` for the browser-only demo. For connected mode set it to `false` and provide `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and the server-only `SUPABASE_SERVICE_ROLE_KEY`.

## 2. Supabase

For a new project, run `supabase/install/PLYDECK_NEW_PROJECT_SETUP.sql` once. For the existing PLYDECK project, apply outstanding migrations in order through `supabase/migrations/010_final_rate_card_pricing.sql`. If migration 009 is already installed, run only 010 before deploying the matching source.

Create a user, then run `supabase/admin/CREATE_FIRST_ADMIN.sql` with that user UUID. Configure the Auth site URL and redirect URL to your Vercel origin.

## 3. Vercel

Import `https://github.com/plydeck1-lang/Plydeck.git`, select the Next.js preset, and add the variables from `.env.example` in the correct Vercel environment. Keep `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` and all WhatsApp credentials server-only; do not prefix them with `NEXT_PUBLIC_`. Redeploy after changing variables.

The included `vercel.json` schedules only the WhatsApp outbox worker at `/api/notifications/whatsapp/worker`. Configure `CRON_SECRET` and use a Vercel plan that supports cron, or call the secured endpoint from an external scheduler.

## 4. WhatsApp (optional)

Follow `docs/WHATSAPP_SETUP.md`. Buyer opt-in is required. Booking, pool confirmation, QC and dispatch events are queued only for opted-in profiles. Keep `WHATSAPP_ENABLED=false` until Meta templates and the callback are verified.

## 5. Acceptance checks

```powershell
npm.cmd run test
npm.cmd run build
```

In a preview environment: create a buyer profile, reserve a slot, block and unblock a different slot as admin, and verify neither action can overwrite a reservation. In Manage > Orders, confirm the 10% and 40% offline receipts. Reserve or block every pool slot, confirm the pool, record QC, confirm the final 50% and dispatch. Verify the booking WhatsApp event for an opted-in profile.

Before launch, replace provisional legal identity, supplier specifications and rates with the operating entity's reviewed commercial terms.
