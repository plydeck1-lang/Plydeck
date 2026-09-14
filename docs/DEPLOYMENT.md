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

For a new project, run `supabase/install/PLYDECK_NEW_PROJECT_SETUP.sql` once. For the existing PLYDECK project, run `supabase/migrations/008_direct_slot_reservations.sql` after migration 007. The migration preserves historical payment tables for audit but revokes their client access and replaces booking, pool transitions and cancellation with direct reservation logic.

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

In a preview environment: create a buyer profile, confirm a slot, verify the slot is no longer available, reserve another slot as a second buyer, fill all slots as admin, run confirm → QC → dispatch, and verify the direct reservation WhatsApp event for an opted-in profile. Test cancellation while the pool is live and confirm that the slot is released without a refund record.

Before launch, replace provisional legal identity, supplier specifications, rates, freight and GST details with the operating entity's reviewed commercial terms.
