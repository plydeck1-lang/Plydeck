import type { Metadata } from "next";
import { PolicyShell } from "@/components/policy-shell";

export const metadata: Metadata = {
  title: "Shipping & Delivery Policy | PLYDECK",
  description: "How PLYDECK coordinates shared shipments, city hubs, unloading, collection and delivery claims.",
};

export default function ShippingPolicyPage() {
  return (
    <PolicyShell
      eyebrow="FULFILMENT"
      title="Shipping & delivery policy"
      intro="PLYDECK pools are planned around a shared factory-to-city movement. The selected pool and accepted quotation define the actual route and fulfilment terms."
    >
      <section><h2>1. Shared shipment model</h2><p>Orders from one or more pools may be combined into a vehicle load where specifications, payload, destination and timing permit. Each buyer retains an individual order even when transport is shared.</p></section>
      <section><h2>2. Delivery destination</h2><p>Unless the accepted quotation states otherwise, the published destination is the named PLYDECK city hub or transit warehouse. Last-mile delivery to a project site, special unloading, crane or labour requirements are not included unless separately stated and accepted.</p></section>
      <section><h2>3. Indicative timeline</h2><p>The standard target is approximately seven calendar days from final pool confirmation and supplier acceptance to the named city hub, subject to the pool schedule. Production readiness, weather, route restrictions, vehicle availability and events outside reasonable control can affect timing. Material delays will be communicated through the order channel.</p></section>
      <section><h2>4. QC and dispatch</h2><p>PLYDECK records the agreed QC update before dispatch. A QC update does not replace the buyer’s obligation to inspect visible condition and quantity at handover.</p></section>
      <section><h2>5. Collection and storage</h2><p>Buyers should collect within 48 hours of the ready notice unless another period is stated. Extra storage, redelivery or handling caused by delayed collection may be charged after notice and agreement where required.</p></section>
      <section><h2>6. Damage, shortage and claims</h2><p>Visible transit damage or shortage must be recorded on the delivery or collection document and reported promptly with photographs and the order reference. Manufacturing defects are reviewed against the confirmed product specification and applicable supplier warranty.</p></section>
    </PolicyShell>
  );
}
