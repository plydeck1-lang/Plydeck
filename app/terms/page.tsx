import type { Metadata } from "next";
import { PolicyShell } from "@/components/policy-shell";

export const metadata: Metadata = {
  title: "Terms & Conditions | PLYDECK",
  description: "Terms governing PLYDECK business accounts, buying pools, QC, delivery and platform use.",
};

export default function TermsPage() {
  return (
    <PolicyShell
      eyebrow="LEGAL"
      title="Terms & conditions"
      intro="These terms explain how business buyers use PLYDECK, reserve pool slots and move through confirmation, QC and dispatch."
    >
      <section><h2>1. Scope and acceptance</h2><p>PLYDECK is a B2B demand aggregation and order-coordination platform. By creating a business account, accepting a quotation or confirming a pool slot, you agree to these terms, the pool-specific specification and quotation, and the applicable policies linked below. If they conflict, the accepted pool quotation and any written amendment agreed by both parties control for that order.</p></section>
      <section><h2>2. Business eligibility and account information</h2><p>You confirm that you act for a business and are authorised to place the order. You must provide accurate business name, tax-registration number, billing address, contact person and mobile number, keep access credentials secure and promptly correct inaccurate information.</p></section>
      <section><h2>3. Pool contents and availability</h2><p>Each pool publishes its city, closing time, fixed slot contents, product specification, final rates, available slots and indicative fulfilment schedule. Confirming a slot immediately creates an order record and locks the selected slot. Joining a waiting list does not guarantee availability, price or allocation.</p></section>
      <section><h2>4. Final rates and offline payments</h2><p>Each admin-entered per-sqft rate is the final rate used for its plywood line. The accepted order summary shows the four plywood lines and complete order total without an additional selling spread or checkout uplift. No online payment gateway is used. PLYDECK operations manually records verified offline receipts in three stages: 10% booking, a further 40% before pool confirmation, and the final 50% after QC and before dispatch.</p></section>
      <section><h2>5. Pool confirmation and supplier commitment</h2><p>A pool may be confirmed when every slot is either reserved or operationally blocked, each reserved order has 50% manually confirmed, and the supplier accepts the order. PLYDECK may extend an underfilled pool, move a consenting buyer to a replacement pool, or cancel where commercial, supplier, transport or quality conditions cannot be met.</p></section>
      <section><h2>6. Quality check and specifications</h2><p>The confirmed written specification governs the goods. Product images may be representative unless identified as actual batch images. A QC update is recorded before dispatch. Any proposed material substitution or material commercial change requires buyer consent.</p></section>
      <section><h2>7. Delivery, collection and risk</h2><p>Unless a quotation states otherwise, the delivery target is to the published city hub. Local last-mile delivery, prolonged storage or special unloading may be separately quoted. Buyers must inspect visible condition and quantity at handover and record shortages or transit damage on the delivery document with supporting photographs.</p></section>
      <section><h2>8. Cancellations</h2><p>Cancellations are governed by the Cancellation Policy. While a pool is live or confirming, a buyer may cancel and release the slot. After supplier commitment, PLYDECK records a cancellation request for review and may offer the slot to the next eligible waiting-list buyer.</p></section>
      <section><h2>9. Acceptable use</h2><p>You must not misuse the platform, interfere with security, submit false business information, attempt unauthorised access, reverse engineer restricted systems or use listings and supplier information for fraud or unlawful activity.</p></section>
      <section><h2>10. Communications</h2><p>Operational notices may be sent through the platform, email, SMS or phone. WhatsApp updates are optional and require consent. Consent may be withdrawn in Business details or through supported opt-out instructions without affecting essential order administration.</p></section>
      <section><h2>11. Liability and statutory rights</h2><p>Nothing in these terms excludes a right or liability that cannot legally be excluded. Each party remains responsible for direct losses caused by its breach, fraud, wilful misconduct or negligence. Business interruptions outside reasonable control may extend performance while the affected party works to mitigate them.</p></section>
      <section><h2>12. Governing framework and contact</h2><p>These terms are intended for B2B transactions in India. Applicable mandatory law and the dispute terms stated on the final tax invoice or signed commercial agreement prevail. Questions should be raised through the order channel or the business contact shown on your confirmation.</p></section>
    </PolicyShell>
  );
}
