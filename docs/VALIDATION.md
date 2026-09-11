# PLYDECK deployment verification — 11 September 2026

TypeScript validation passed. The Next.js 16.3.4 production build passed, including the storefront, reset-password route and 14 API routes.

23 automated tests passed across the main suite. Database tests used isolated PostgreSQL-compatible PGlite with test Auth/Storage stubs.

Coverage includes the fixed four-item 100-sheet slot, independent admin rate-card pricing, GST/10-40-50 arithmetic, truck weight, exclusive slots, immutable quotes, captured-payment idempotency, late payments, cancellation/refund gates, admin privileges and fixed post-QC replacements.

WhatsApp checks cover exact QC outstanding balance and IST dates, no-consent suppression, withdrawn consent at claim, paid-reminder suppression, refund-stage event deduplication, atomic webhook replay, no regression after read, STOP opt-out, server-only RPC privileges, phone normalization and ordered template parameters with missing-value rejection.

Deployment checks cover the combined SQL installer and its refusal to run on an existing schema, plus the first-admin placeholder guard and repeat-safe role assignment.

No user's hosted Supabase database was changed. Hosted Auth/email, Storage upload, real Razorpay payments/refunds, Meta template approval/delivery, browser interaction, Git push and Vercel deployment were not performed. Complete the connected acceptance flow in DEPLOYMENT.md and WHATSAPP_SETUP.md before commercial use.

Notification migration 004 corrects the earlier QC balance and template copy, adds send-time eligibility, separate refund events and atomic status handling. Migration 005 carries both legacy thickness totals into waiting-list replacements; migration 006 links the old selector to exactly 100 sheets; migration 007 removes buyer configuration and enforces the fixed MR/BWP slot with four rate-card lines. Meta templates must match WHATSAPP_TEMPLATES.md. Uncertain sends require review rather than automatic resend; retries are limited to explicit transient provider rejections.
