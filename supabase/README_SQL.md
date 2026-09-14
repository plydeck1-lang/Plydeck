# PLYDECK Supabase SQL — choose one setup path

## A. Brand-new Supabase project

1. Create a dedicated PLYDECK Supabase project.
2. Open SQL Editor > New query.
3. Paste the entire `install/PLYDECK_NEW_PROJECT_SETUP.sql` file and click Run.
4. It installs migrations 001–009 and seed data. Do not also run the individual migrations or seed.
5. Configure Auth/email redirects and app credentials as described in `docs/DEPLOYMENT.md`.
6. Register and confirm your PLYDECK account in connected mode.
7. Copy its UUID from Supabase Authentication > Users. Replace the placeholder in `admin/CREATE_FIRST_ADMIN.sql`, then run that script.
8. Log out and log back in. Open Manage in the same webapp.

## B. Existing Phase 1 project (001 and 002 already applied)

Run only these files, in order:

1. `migrations/003_whatsapp_notifications.sql`
2. `migrations/004_whatsapp_delivery_fixes.sql`
3. `migrations/005_independent_thickness_quantities.sql`
4. `migrations/006_fixed_100_sheet_slot_mix.sql`
5. `migrations/007_fixed_four_item_slot.sql`
6. `migrations/008_direct_slot_reservations.sql`
7. `migrations/009_admin_slot_blocks_manual_payments.sql`

If 001 was applied but 002 was not, run 002 first. Keep WhatsApp disabled while upgrading. Deploy the matching source after SQL succeeds.

## C. Existing Phase 2 project (001, 002, 003 already applied)

Run migrations 004, 005, 006, 007, 008 and 009 in order, then deploy the matching source. Do not rerun 003.

If migration 008 is already installed, run only `migrations/009_admin_slot_blocks_manual_payments.sql`.

## D. Individual files for a new project (alternative to A)

If you prefer separate queries, run 001 through 009, then `seed.sql` exactly once in that order. Do not use the combined installer as well.

| File | Purpose |
|---|---|
| 001_plydeck.sql | Commerce tables, RLS, pool/order transactions and image bucket (historical payment tables retained for audit) |
| 002_replacement_slots.sql | Fixed-mix post-QC replacements and waiting-list offers |
| 003_whatsapp_notifications.sql | WhatsApp templates, opt-in field and message outbox |
| 004_whatsapp_delivery_fixes.sql | Consent checks, deduplication and atomic webhook updates |
| 005_independent_thickness_quantities.sql | Adds independent 16mm/6mm quantities, 70:30 OEM defaults, range checks and fixed-mix replacement snapshots |
| 006_fixed_100_sheet_slot_mix.sql | Links both thickness selectors to a mandatory 100-sheet total and limits the mix to 70:30–85:15 |
| 007_fixed_four_item_slot.sql | Replaces buyer quantity controls with the fixed 50/20/15/15 MR/BWP slot and enforces its four-line rate card |
| 008_direct_slot_reservations.sql | Removes active payment gates: authenticated buyers confirm and lock fixed slots directly; admin confirmation, QC, dispatch and cancellation no longer require payments |
| 009_admin_slot_blocks_manual_payments.sql | Adds admin slot blocking, auditable offline 10%/40%/50% payment confirmation and payment-aware confirmation/dispatch rules |
| seed.sql | Three categories and two five-slot OEM draft pools |
| CREATE_FIRST_ADMIN.sql | Assign your existing Auth user the admin role |

There is no default admin account or password. The new-project installer refuses an existing commerce schema. Historical migrations are not reset scripts. No file deletes customer orders.

Prices, weights and freight in the seed remain worked assumptions. Production pools start as drafts; confirm supplier specifications and costs before publishing.

Template language is configured per row in `whatsapp_templates.language`; variable order is in `whatsapp_templates.variables`. The app sends to Indian buyer mobile numbers. See `docs/WHATSAPP_SETUP.md` for exact template bodies and Meta setup.
