# PLYDECK admin pool correction

Applies to the existing Next.js / Supabase build in `plydeck1-lang/Plydeck`.

## What was corrected

- Saving a pool now accepts Supabase timestamps ending in `+00:00`, as well as UTC `Z` and explicit offsets such as `+05:30`. The API normalizes them to UTC.
- The date editor displays **Booking closes (IST)** consistently. Editing another field preserves the original closing instant; clearing the date no longer immediately converts an empty value into an invalid date.
- Draft cards and the editor identify incomplete bond, tolerance and full specification fields. **Publish pool** stays visible on every draft card. It is disabled while prerequisites are incomplete; the card explains what to finish through **Edit pool**. After completing and saving those details, the button becomes enabled.
- Creating a pool requires an explicit shipment choice. A new pool no longer silently selects the first existing truckload. The OEM category is selected when available.

The later fixed-slot release requires `supabase/migrations/007_fixed_four_item_slot.sql`. No environment-variable change is required.

## Apply from VS Code on Windows

1. Open your current project folder containing `package.json` (for example, `C:\plydeck`).
2. Extract `PLYDECK_Admin_Pool_Fix.zip` into that folder, preserving the archive's `components`, `lib`, `tests` and `docs` folders. Replace the matching files. The archive contains no credentials, database migrations or dependency lockfile changes.
3. Open the VS Code PowerShell terminal and run:

```powershell
npm.cmd run test
npm.cmd run build
git status --short
git add .gitignore components/admin-panel.tsx lib/validation.ts lib/pool-admin.ts tests/admin-pool.test.ts tests/database.test.ts docs/ADMIN_POOL_FIX.md
git commit -m "Fix admin pool dates and publishing guidance"
git push origin main
```

If you have independently modified any of these files since the supplied build, merge your edits before replacing them. Run the commands from your existing repository; do not initialize a second repository inside it.

4. In Vercel, wait for the new **main** deployment to become Ready. Refresh https://plydeck.vercel.app with Ctrl+Shift+R.

## Publish the existing OEM pools

1. Log in with your admin account and open **Manage → Pools → Edit pool**.
2. Choose a future **Booking closes (IST)** date.
3. Under **Product specification**, replace **Factory specification pending** with the actual supplier-confirmed **Bond / glue grade** and **Thickness tolerance**. Review **Full specification / supplier commitment** and enter the agreed batch details. Do not substitute an unverified grade or tolerance merely to pass validation.
4. Review the locked four-item quantities, enter all four ex-factory purchase rates and verify operations allocations, tick the acknowledgement and save.
5. Click **Publish pool**. A visible category and sufficient shipment capacity are still required.

Drafts can be saved while supplier specifications are pending; publication remains blocked until the pending fields are completed. Admin permissions are unchanged.

## Add a third pool or another truckload

The seeded figures are planning estimates: each fixed five-slot pool is 13,000 kg (70 total 16mm sheets + 30 total 6mm sheets per slot), and the shared shipment includes 600 kg of packing. Two pools therefore reserve 26,600 kg of its 32,000 kg payload. Another identical pool would bring it to 39,600 kg and is correctly rejected.

For a separate truckload, create a shipment under **Manage → Shipments → Add shipment**, enter the carrier-confirmed legal cargo payload and packing allowance, save it, then select it under **Shared shipment** in the new pool. If sharing the existing truck, use a slot count that fits its remaining capacity. The database makes the final check.

The patch does not publish pools, alter product specifications, take payments or send WhatsApp messages automatically.

## Verification

- All 24 automated tests passed, including date-offset regression tests and local PostgreSQL-compatible tests for draft save, publication guards and creating a pool on another shipment.
- The Next.js production build and its TypeScript check passed.
- Automated browser verification could not run because this environment has no installed Chromium executable. Confirm the admin edit/save/publish flow after deploying the patch to your own Vercel project. No live admin session or production data was changed here.
