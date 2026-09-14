# Validation notes

The local suite covers deterministic fixed-slot pricing, four-item composition, 18% GST, direct atomic reservations, slot exclusivity, admin slot blocking, sequential manual 10%/40%/50% receipt confirmation, payment-aware pool transitions, shared truck payload limits and opt-in WhatsApp booking events. The combined installer is checked for migration 009 and its existing-schema guard.

Run:

```powershell
npm.cmd run test
npm.cmd run build
```

No hosted Supabase project, WhatsApp provider, browser session, Git push or Vercel deployment is changed by the local tests. Before commercial use, run the connected acceptance flow in `docs/DEPLOYMENT.md` and verify your reviewed seller terms, supplier specifications, rate card and GST setup.

Migrations 001–008 remain as historical schema evolution. Migration 009 is the active overlay: buyers reserve directly, administrators manage blocks and offline payment confirmations, pools require 50% verified receipts to confirm, and dispatch requires full payment after QC.
