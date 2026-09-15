# Validation notes

The local suite covers deterministic final-rate pricing, four-item composition, direct atomic reservations, slot exclusivity, admin slot blocking, sequential manual 10%/40%/50% receipt confirmation, payment-aware pool transitions, shared truck payload limits and opt-in WhatsApp booking events. The combined installer is checked for migration 010 and its existing-schema guard.

Run:

```powershell
npm.cmd run test
npm.cmd run build
```

No hosted Supabase project, WhatsApp provider, browser session, Git push or Vercel deployment is changed by the local tests. Before commercial use, run the connected acceptance flow in `docs/DEPLOYMENT.md` and verify your reviewed seller terms, supplier specifications and final rate card.

Migrations 001–009 remain as historical schema evolution. Migration 010 is the active pricing overlay: buyers reserve directly at the four published final rates, without an additional spread, operational allocation, rounding uplift or separate tax calculation.
