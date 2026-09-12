import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SiteFooter } from "./site-footer";

export function PolicyShell({
  eyebrow,
  title,
  intro,
  updated = "12 September 2026",
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="policy-header">
        <Link href="/" aria-label="Return to PLYDECK home">
          <span className="policy-logo-frame">
            <img src="/plydeck-logo-transparent.png" alt="PLYDECK — Buy better. Grow better." />
          </span>
        </Link>
        <Link href="/" className="policy-back"><ArrowLeft size={16} /> Back to pools</Link>
      </header>
      <main className="policy-main">
        <div className="policy-hero">
          <span className="brand-kicker">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{intro}</p>
          <small>Last updated: {updated}</small>
        </div>
        <article className="policy-content">{children}</article>
      </main>
      <SiteFooter />
    </>
  );
}
