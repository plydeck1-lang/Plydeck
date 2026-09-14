# Validation notes

The local suite covers deterministic fixed-slot pricing, four-item composition, 18% GST, direct atomic reservations, slot exclusivity, shared truck payload limits, admin-only transitions, QC/dispatch without payment gates, cancellation slot release and opt-in WhatsApp booking events. The combined Supabase installer is checked for migration 008 and its existing-schema guard.

Run:

```powershell
npm.cmd run test
npm.cmd run build
```

No hosted Supabase project, WhatsApp provider, browser session, Git push or Vercel deployment is changed by the local tests. Before commercial use, run the connected acceptance flow in `docs/DEPLOYMENT.md` and verify your reviewed seller terms, supplier specifications, rate card and GST setup.

Migrations 001–007 remain as historical schema evolution. Migration 008 is the active overlay: payment tables are preserved for audit, their client execution is revoked, and booking/pool/cancellation functions use direct slot confirmation instead.
