# WhatsApp notifications

WhatsApp is optional. PLYDECK never collects online payment for a reservation. Notifications are sent only to profiles that explicitly opt in.

## Templates

Keep these approved utility templates enabled in `whatsapp_templates`:

| Name | Purpose | Variables |
|---|---|---|
| `plydeck_booking_received` | Direct reservation confirmed | `order_ref`, `pool_code`, `amount` |
| `plydeck_pool_confirmed` | Pool confirmed | `order_ref`, `pool_code`, `city`, `delivery_date` |
| `plydeck_qc_due` | QC recorded | `order_ref`, `pool_code` |
| `plydeck_dispatched` | Dispatch update | `order_ref`, `city` |
| `plydeck_pool_cancelled` | Pool cancellation | `order_ref`, `pool_code`, `reason` |
| `plydeck_waitlist_offer` | Waiting-list slot offer | `pool_code`, `slot`, `expires_at` |

Payment, default and refund templates are disabled by migration 008.

## Environment variables

Set these server-only values in Vercel or `.env.local`: `WHATSAPP_ENABLED`, `WHATSAPP_GRAPH_VERSION`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, and `CRON_SECRET`.

Configure Meta's callback as `https://YOUR_DOMAIN/api/whatsapp/webhook` and the scheduled worker as `/api/notifications/whatsapp/worker`. Verify a test recipient, then enable the provider. Failed sends are visible in Manage → WhatsApp log.
