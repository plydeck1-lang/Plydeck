# PLYDECK deployment — VS Code → Supabase → Git → Vercel

## 1. Run the local demo

Follow the quick start in `README.md`. Keep `NEXT_PUBLIC_DEMO_MODE=true` until the complete backend configuration is ready. Never deploy a demo as a real paid pool.

## 2. Create a dedicated Supabase project

Do not run these migrations in INQUVO's database. Use a new PLYDECK project.

In Supabase SQL Editor, run the files in this order:

1. `supabase/migrations/001_plydeck.sql`
2. `supabase/migrations/002_replacement_slots.sql`
3. `supabase/migrations/003_whatsapp_notifications.sql`
4. `supabase/migrations/004_whatsapp_delivery_fixes.sql`
5. `supabase/migrations/005_independent_thickness_quantities.sql`
6. `supabase/migrations/006_fixed_100_sheet_slot_mix.sql`
7. `supabase/seed.sql`

Alternatively, run only `supabase/install/PLYDECK_NEW_PROJECT_SETUP.sql` in a new project; it includes all of the above. For an upgrade, use `supabase/README_SQL.md` and run only unapplied migrations. These are initial migrations, not scripts to rerun on every deployment. Use migration history or mark completed files. The seed uses stable IDs and does not overwrite existing records.

The migrations create tables, privileged transaction functions, row-level security and a public product-image bucket. Only the server's service role can mutate commerce records; the browser cannot assign an admin role or mark an order paid.

## 3. Set local environment variables

Copy these values into `.env.local`, using your project's values. The `.env.example` file lists every variable.

| Variable | Where to get it / purpose |
|---|---|
| `NEXT_PUBLIC_DEMO_MODE` | Set `false` for connected mode |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase browser-safe anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role/secret key; SERVER ONLY |
| `RAZORPAY_KEY_ID` | Razorpay Test Mode key ID first |
| `RAZORPAY_KEY_SECRET` | Matching Razorpay secret; SERVER ONLY |
| `RAZORPAY_WEBHOOK_SECRET` | A separate secret you choose for the webhook |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` locally; deployed HTTPS origin on Vercel |
| `CRON_SECRET` | Long random string for scheduled reconciliation and WhatsApp worker authorization |
| `WHATSAPP_ENABLED` | Keep `false` until Meta templates and webhook are verified |
| `WHATSAPP_GRAPH_VERSION` | Meta Graph API version, for example `v24.0` |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp business phone number ID |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Meta WABA ID for operations/audit |
| `WHATSAPP_ACCESS_TOKEN` | Meta system-user token; SERVER ONLY |
| `WHATSAPP_APP_SECRET` | Meta app secret for webhook signature validation; SERVER ONLY |
| `WHATSAPP_VERIFY_TOKEN` | Random webhook verification token; SERVER ONLY |

Do not put secret values in source files, browser components, screenshots, Git commits or chat messages. Never prefix server secrets with `NEXT_PUBLIC_`.

Restart the local dev server after environment changes. If any public environment value changes on Vercel, redeploy so the client bundle is rebuilt.

## 4. Configure login and the first administrator

Enable Email authentication in Supabase. Set the Site URL and allowed Redirect URLs for both `http://localhost:3000` and your final Vercel/domain origin, including `/reset-password`. Configure production SMTP before inviting external buyers so verification and password reset emails can be delivered reliably.

Create your own account through the PLYDECK registration form. Confirm its email. Then copy its UUID from Supabase Authentication → Users and run:

```sql
insert into public.admins (user_id)
values ('REPLACE_WITH_YOUR_AUTH_USER_UUID')
on conflict (user_id) do nothing;
```

Refresh PLYDECK after logging in. **Manage** appears in the same top navigation. Other customers do not see it, and all admin API routes also enforce the role server-side.

The seed creates three category records and two five-slot OEM pools attached to the same 32,000 kg shipment. The pools are drafts. In Manage → Pools → Edit pool, confirm both thickness prices and actual batch specs, set a future booking close time, save, then publish.

## 5. Push the source to your Git repository

Create a new empty private repository for PLYDECK. In your project terminal:

```powershell
git init
git add .
git commit -m "Build PLYDECK storefront, commerce and WhatsApp notifications"
git branch -M main
git remote add origin YOUR_NEW_REPOSITORY_URL
git push -u origin main
```

Before committing, confirm `.env.local` is ignored. `node_modules` and `.next` must not be committed. Keep `package-lock.json` so deployments install the versions that were checked.

## 6. Deploy on Vercel

Import the repository as a new Vercel project. Framework: **Next.js**. Root directory: the folder containing `package.json`. Build command: `npm run build`; install command: `npm ci`. Use Node.js 22 or 24.

Add the environment variables from step 3. Start with Razorpay Test Mode keys. Set `NEXT_PUBLIC_APP_URL` to this deployment's HTTPS origin. Redeploy after updating it, then allow that origin in Supabase Auth redirect settings.

Vercel Preview and Production environments have separate variables. Keep test and live credentials deliberately separated. The included `vercel.json` runs reconciliation once daily and the WhatsApp outbox worker every five minutes. Before commercial operation, use a suitably frequent schedule supported by your Vercel plan, for example every five minutes on a plan that supports it, and retain the webhook as the primary immediate payment update path.

## 7. Connect Razorpay webhooks

Create a Test Mode webhook in Razorpay pointing to:

```text
https://YOUR_PLYDECK_DOMAIN/api/payments/webhook
```

Use the exact `RAZORPAY_WEBHOOK_SECRET` value configured in Vercel. Subscribe to:

- `payment.captured`
- `order.paid`
- `refund.processed`
- `refund.failed`

Configure automatic capture in Razorpay. The app only treats a captured payment as paid, even if the browser callback succeeds. Amounts and order IDs come from server-stored payment attempts; the browser cannot supply a discounted amount.

## 8. Configure WhatsApp and run the connected acceptance flow

Complete `docs/WHATSAPP_SETUP.md`: create the Meta WABA and phone number, create/approve the utility templates, set the Vercel variables, configure `https://YOUR_PLYDECK_DOMAIN/api/whatsapp/webhook`, subscribe to `messages`, and verify the callback with a Meta test recipient. Keep `WHATSAPP_ENABLED=false` during payment-only testing; enable it for your opted-in test recipient, then confirm the first approved template send appears as `sent` in Manage → WhatsApp log.

The queue is consent based. Buyers must opt in under Business details. Meta delivery callbacks update `sent`, `delivered`, `read` and `failed` states, and inbound messages are stored for support review.

## 9. Run the connected acceptance flow

1. Confirm category changes and images appear in the storefront. Confirm draft pools remain hidden to ordinary users.
2. Log in as a separate test buyer, save sample GST/billing details and reserve a slot. Pay 10% using Razorpay's supported test payment methods.
3. Confirm the webhook and callback mark the same instalment paid once. Refresh or replay the webhook; the paid total must not double.
4. Test two buyers requesting the same slot; only one can retain an active allocation.
5. Test the linked selector from 70:30 through 85:15. Changing either thickness must update the other automatically and every slot must remain exactly 100 sheets. Shared payload limits must block an overweight combination.
6. Reserve all five slots in one pool. As admin, request the 40% instalment. Pay it as the buyer, then confirm the pool. Confirm the target hub delivery date is seven days later.
7. Record a detailed QC report. Pay the final 50%. Confirm dispatch stays blocked until all active slots are fully paid.
8. In another test pool, cancel before confirmation. Review the full refund in admin, verify the Razorpay refund result and webhook settlement.
9. Test a expired unpaid hold followed by a delayed captured payment. It must enter the full-refund queue and must not displace a new buyer.
10. Check desktop and mobile layouts, keyboard navigation, every dialog, login verification and password reset in a browser.

Use test records and payment mode. Do not manufacture customer demand, pay your own live merchant account to simulate sales, or fabricate public reservations.

## 10. Payment and refund reconciliation

The reconciliation endpoint requires `Authorization: Bearer <CRON_SECRET>`. It checks unsettled provider orders and pending refunds. If order creation timed out before its provider ID was saved, it searches using the internal receipt. Ambiguous provider orders are left for manual review; the system does not assume a failed network response means no payment exists.

The admin refund action is retryable with the same internal refund-task ID. A failure leaves the decision in processing. Check the provider dashboard before changing anything manually. Never invent a provider payment/refund ID to clear a stuck record.

The refund endpoint enforces full refunds for PLYDECK cancellation and eligible pre-confirmation cancellations. For post-confirmation buyer default, record the cost/retention decision and any refund; no deduction can exceed the first 50% commitment. Exact enforceability depends on the final seller terms and applicable law.

## 11. Publish the first commercial pools

Before accepting real orders, enter the final seller legal name, GSTIN, business address, support contact and commercial terms; replace provisional product specifications; confirm both purchase rates, transport, packaging, unloading and payload with your suppliers; confirm gateway charges in your pool economics; and complete the connected payment/refund tests.

Then put the matching Razorpay Live keys and live webhook secret in Vercel Production, redeploy, and publish the two verified OEM pools through Manage. Keep the two pool allocations aligned with the shared shipment budget. If one pool is cancelled, do not silently surcharge the other: either honour its price or cancel/refund and issue a new offer with consent.

Do not merge INQUVO and PLYDECK databases, billing entitlements or user roles. This project is independent.
