# PLYDECK — complete build and Supabase setup

This source archive contains the whole Next.js webapp, not an update-only patch. It includes all SQL, the public storefront, pool/slot configuration, business login, GST pricing, direct slot reservations, admin controls and WhatsApp integration code.

Important: extract the archive directly into the folder whose `package.json` belongs to PLYDECK. Do not leave the extracted source as a child folder inside an older PLYDECK project. A nested copy causes the parent TypeScript configuration to compile new components against old root types.

If this build is copied over an older Razorpay-enabled PLYDECK folder, run the cleanup script once before building. Archive extraction does not delete obsolete routes:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\remove-legacy-razorpay.ps1
```

## 1. Run the local demo in VS Code on Windows

Extract to a new folder such as `C:\plydeck`, or extract directly over your existing repository root after preserving `.env.local`. Open the one folder containing `package.json`, `app`, `components` and `lib` together in VS Code. In Terminal > New Terminal:

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run dev
```

Open http://localhost:3000. Select Bengaluru. Use sample business details in demo. Do not copy over an existing `.env.local`; preserve your own credentials if updating an existing project.

## 2. Set up Supabase

Open `supabase/README_SQL.md` and choose the matching path:

- New project: run `supabase/install/PLYDECK_NEW_PROJECT_SETUP.sql` once.
- Phase 1 already installed: run migrations 003, 004, 005, 006, 007, then 008.
- Phase 2 already installed: run migrations 004, 005, 006, 007, then 008 in order.
- Migration 007 already installed: run only migration 008.

Keep PLYDECK in its own Supabase project. Set the project's public URL, anon key and server service-role key in `.env.local`. Enable Email Auth and configure redirects. Change `NEXT_PUBLIC_DEMO_MODE=false` for connected mode. Restart the app after environment changes.

## 3. Create your admin account

Register in PLYDECK and confirm the email. In Supabase > Authentication > Users, copy your UUID. Replace the placeholder in `supabase/admin/CREATE_FIRST_ADMIN.sql`, then run it in SQL Editor. Log back in and open Manage.

## 4. Connect services

Use `docs/DEPLOYMENT.md` for Supabase, Git and Vercel setup. Use `docs/WHATSAPP_SETUP.md` for Meta credentials, approved templates, callbacks and the cron worker. Enter secrets only in your local environment file or Vercel Environment Variables. No real credentials are included.

WhatsApp is disabled by default. It requires an enabled worker schedule on a Vercel plan that supports the chosen cron frequency (or an external scheduler calling the secured endpoint). Set the callback to `https://YOUR_DOMAIN/api/whatsapp/webhook`.

## 5. Verify the build

```powershell
npm.cmd run test
npm.cmd run build
```

Use `npm.cmd run dev` for development. `npm.cmd run start` runs the built production app after a successful build. Upload/commit the entire source tree with its lockfile, excluding node_modules, .next and secret environment files.

For a new Git repository:

```powershell
git init
git add .
git commit -m "Build PLYDECK storefront, commerce and WhatsApp notifications"
git branch -M main
git remote add origin YOUR_REPOSITORY_URL
git push -u origin main
```

For an existing repository, copy the source files into it while preserving your Git history and environment file, then commit and push normally.

The app is responsive for desktop and mobile browsers. Native Android/iOS app binaries are not included. Test hosted Auth, direct slot reservation, admin transitions and WhatsApp delivery with your accounts before accepting commercial bookings.
