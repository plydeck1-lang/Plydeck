# PLYDECK WhatsApp setup

PLYDECK uses the Meta WhatsApp Cloud API for opt-in, transactional order updates. Messages are queued in Supabase and sent by a Vercel cron worker. The browser never receives the Meta access token.

## 1. Create the Meta WhatsApp assets

In Meta for Developers, create or select a Business app and connect a WhatsApp Business Account (WABA). Add a business phone number and copy its **Phone Number ID**. Create a long-lived system-user access token with the WhatsApp Business messaging permission and keep it server-only. Meta hosts the Cloud API and delivers message delivery statuses through webhooks; see the official [Cloud API getting started guide](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started/), [messages reference](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages) and [webhook guide](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components).

## 2. Create and approve utility templates

Create these templates in Meta with the exact names below. Use the `UTILITY` category and keep the copy factual. The placeholders must follow the variable names and order in the table. Meta approval is required before production sends.

| Template | Trigger | Variables |
|---|---|---|
| `plydeck_booking_received` | 10% booking captured | `order_ref`, `pool_code`, `amount` |
| `plydeck_confirmation_due` | pool enters 40% confirmation stage | `order_ref`, `pool_code`, `amount`, `due_at` |
| `plydeck_confirmation_received` | 40% instalment captured | `order_ref`, `city`, `delivery_date` |
| `plydeck_pool_confirmed` | admin confirms the pool | `order_ref`, `pool_code`, `city`, `delivery_date` |
| `plydeck_qc_due` | QC report released | `order_ref`, `pool_code`, `amount`, `due_at` |
| `plydeck_payment_received` | final 50% payment captured | `order_ref`, `amount`, `outstanding` |
| `plydeck_dispatched` | pool is dispatched | `order_ref`, `city` |
| `plydeck_pool_cancelled` | pool cancellation | `order_ref`, `pool_code`, `reason` |
| `plydeck_refund_update` | refund status changes | `order_ref`, `amount`, `status` |
| `plydeck_waitlist_offer` | FIFO waiting-list offer | `pool_code`, `slot`, `expires_at` |
| `plydeck_default_notice` | written payment-default notice recorded | `order_ref`, `amount`, `due_at` |
| `plydeck_order_defaulted` | cure period ends and slot is released | `order_ref` |

The migration inserts local previews for these templates. Those previews do not register or approve templates in Meta; the names and body copy must still be created in the Meta console.

## 3. Add Vercel environment variables

Copy the values into Preview and Production separately. Keep the access token and app secret server-only.

```text
WHATSAPP_ENABLED=false
WHATSAPP_GRAPH_VERSION=v24.0
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_VERIFY_TOKEN=
```

Leave `WHATSAPP_ENABLED=false` until the webhook and a Meta test recipient have been verified. Set it to `true` only after the approved templates are available.

## 4. Configure the webhook

Set the Meta callback URL to:

```text
https://YOUR_PLYDECK_DOMAIN/api/whatsapp/webhook
```

Use the same random value for Meta's verify token and `WHATSAPP_VERIFY_TOKEN`. Subscribe the app to the `messages` field. The GET endpoint answers Meta's verification challenge. The POST endpoint validates `X-Hub-Signature-256` with the required `WHATSAPP_APP_SECRET`, even while sending is disabled, deduplicates payloads, updates message delivery status and stores inbound messages for support review.

## 5. Apply the database migration and deploy

Run the migrations in this order in the dedicated PLYDECK Supabase project:

1. `supabase/migrations/001_plydeck.sql`
2. `supabase/migrations/002_replacement_slots.sql`
3. `supabase/migrations/003_whatsapp_notifications.sql`
4. `supabase/migrations/004_whatsapp_delivery_fixes.sql`
5. `supabase/migrations/005_independent_thickness_quantities.sql`
6. `supabase/migrations/006_fixed_100_sheet_slot_mix.sql`
7. `supabase/seed.sql`

Deploy the source to Vercel with `npm ci` and `npm run build`. The included `vercel.json` calls `/api/notifications/whatsapp/worker` every five minutes. Your Vercel plan must support that frequency; otherwise use a compatible scheduler with `Authorization: Bearer <CRON_SECRET>`. The worker claims five messages per run, checks current buyer consent and order state, sends template variables in their configured order and records provider IDs. Only explicitly rejected transient sends can retry (up to five attempts). Timeouts or interrupted sends are marked for manual review to avoid duplicate messages. Signed status callbacks can recover an accepted send using its internal correlation ID. The admin **WhatsApp log** shows queue, delivery and error state.

## 6. Buyer consent and operational behavior

A buyer must tick **Send order updates on WhatsApp** under Business details. The phone number is normalized to Indian E.164 digits. If consent is missing or the number is invalid, PLYDECK does not enqueue a message. Demo mode records opted-in events as `skipped` and never calls Meta.

The connected flow queues notifications for booking payment, confirmation due, confirmation payment, pool confirmation, QC/final payment due, payment received, dispatch, cancellation/refund, waiting-list offers and default notices. The app sends templates only; staff should use the order reference for any support conversation. Buyers can opt out under Business details. A signed inbound STOP or UNSUBSCRIBE message also withdraws consent. Inbound messages are stored in `whatsapp_inbound_messages`; a shared support inbox/reply UI is not included.

Use a Meta test number first, then a small internal pilot. Monitor the admin log and Meta quality rating before enabling all buyers. The WhatsApp API is subject to Meta's template, opt-in and messaging-window policies.

## Exact template bodies

The current positional bodies and variable order are in `docs/WHATSAPP_TEMPLATES.md`. Set the language in `whatsapp_templates.language`. If you already approved older bodies, update them in Meta to match this release before enabling sends. Applying SQL does not create or approve anything in Meta.

For existing projects run only the unapplied files: Phase 1 needs 003, 004, 005, then 006; Phase 2 needs 004, 005, then 006. If 005 is already installed, run only 006. Never run the combined installer on an existing project.
