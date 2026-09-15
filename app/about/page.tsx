import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, Factory, Layers3, ShieldCheck } from "lucide-react";
import { PolicyShell } from "@/components/policy-shell";

export const metadata: Metadata = {
  title: "About PLYDECK | Collective B2B Material Buying",
  description: "Learn how PLYDECK connects fragmented contractor demand with OEM factory supply through city-based buying pools.",
};

export default function AboutPage() {
  return (
    <PolicyShell
      eyebrow="ABOUT PLYDECK"
      title="Building a better bridge between project demand and factory supply."
      intro="PLYDECK is an India-first B2B aggregation platform created for interior contractors, material retailers and OEM factories."
    >
      <section>
        <h2>Why PLYDECK exists</h2>
        <p>
          Interior businesses often need dependable material at competitive rates, but an individual project may not justify a full factory truckload. At the same time, OEM factories receive fragmented enquiries that are difficult to standardise, plan and fulfil efficiently.
        </p>
        <p>
          PLYDECK creates a structured middle layer: publish a defined material slot, aggregate verified demand by city, align the order to transport capacity, directly lock reservations and move the pool through supplier confirmation, quality check and dispatch.
        </p>
      </section>
      <div className="about-principles">
        <article><Building2 size={25} /><h3>Buyer clarity</h3><p>Fixed contents, visible final rates and complete order value before confirmation.</p></article>
        <article><Factory size={25} /><h3>Factory-ready demand</h3><p>Consolidated quantities with a shared destination and defined specification.</p></article>
        <article><Layers3 size={25} /><h3>Standardised pools</h3><p>A repeatable buying unit that supports costing, payload and batch planning.</p></article>
        <article><ShieldCheck size={25} /><h3>Controlled release</h3><p>QC-led release and documented order progress before dispatch.</p></article>
      </div>
      <section>
        <h2>What PLYDECK is—and is not</h2>
        <p>
          PLYDECK is a pooled procurement and order-coordination platform. It is not a conventional retail catalogue promising instant stock across every category. Products become bookable only when a pool is published for a city with defined commercial and fulfilment terms.
        </p>
      </section>
      <section id="contact" className="policy-contact">
        <h2>Work with PLYDECK</h2>
        <p>
          Contractors and retailers can create a business account and browse city pools. OEM factories interested in opening verified supply pools can contact PLYDECK using the business contact shown in the platform or on an order confirmation.
        </p>
        <Link href="/#live-pools" className="button dark">Explore live pools <ArrowRight size={17} /></Link>
      </section>
    </PolicyShell>
  );
}
