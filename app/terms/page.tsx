import type { Metadata } from "next";
import { PolicyShell } from "@/components/policy-shell";

export const metadata: Metadata = {
  title: "Terms & Conditions | PLYDECK",
  description: "Terms governing PLYDECK business accounts, buying pools, payments, QC, delivery and platform use.",
};

export default function TermsPage() {
  return (
    <PolicyShell
      eyebrow="LEGAL"
      title="Terms & conditions"
      intro="These terms explain how business buyers use PLYDECK, reserve pool slots and move through confirmation, QC and dispatch."
    >
      <section><h2>1. Scope and acceptance</h2><p>PLYDECK is a B2B demand aggregation and order-coordination platform. By creating a business account, accepting a quotation or paying for a pool slot, you agree to these terms, the pool-specific specification and quotation, and the applicable policies linked below. If they conflict, the accepted pool quotation and any written amendment agreed by both parties control for that order.</p></section>
      <section><h2>2. Business eligibility and account information</h2><p>You confirm that you act for a business and are authorised to place the order. You must provide accurate business name, GSTIN, billing address, contact person and mobile number, keep access credentials secure and promptly correct inaccurate information.</p></section>
      <section><h2>3. Pool contents and availability</h2><p>Each pool publishes its city, closing time, fixed slot contents, product specification, rate, GST, available slots and indicative fulfilment schedule. A checkout hold is temporary. A slot is reserved only after payment is successfully verified. Joining a waiting list does not guarantee availability, price or allocation.</p></section>
      <section><h2>4. Price, GST and payment milestones</h2><p>The accepted order summary shows the taxable value, GST and total. The standard schedule is 10% on booking, 40% on pool confirmation and 50% after QC but before dispatch. Due dates shown in the platform or payment notice form part of the order. Payment processing is provided by an authorised gateway; PLYDECK does not store full card credentials.</p></section>
      <section><h2>5. Pool confirmation and supplier commitment</h2><p>A pool may be confirmed when the required slots and payments are secured and the supplier accepts the order. PLYDECK may extend an underfilled pool, move a consenting buyer to a replacement pool, or cancel where commercial, supplier, transport or quality conditions cannot be met.</p></section>
      <section><h2>6. Quality check and specifications</h2><p>The confirmed written specification governs the goods. Product images may be representative unless identified as actual batch images. A QC update is provided before final payment. Any proposed material substitution or material commercial change requires buyer consent.</p></section>
      <section><h2>7. Delivery, collection and risk</h2><p>Unless a quotation states otherwise, the delivery target is to the published city hub. Local last-mile delivery, prolonged storage or special unloading may be separately quoted. Buyers must inspect visible condition and quantity at handover and record shortages or transit damage on the delivery document with supporting photographs.</p></section>
      <section><h2>8. Cancellations, default and refunds</h2><p>Cancellations and refunds are governed by the Refund Policy. After pool confirmation, 50% payment and supplier commitment, the committed amount may be retained against actual committed costs and loss caused by a buyer cancellation or payment default, subject to applicable law and resale recovery. A written cure period applies before a slot is reassigned.</p></section>
      <section><h2>9. Acceptable use</h2><p>You must not misuse the platform, interfere with security, submit false business information, attempt unauthorised access, reverse engineer restricted systems or use listings and supplier information for fraud or unlawful activity.</p></section>
      <section><h2>10. Communications</h2><p>Operational notices may be sent through the platform, email, SMS or phone. WhatsApp updates are optional and require consent. Consent may be withdrawn in Business details or through supported opt-out instructions without affecting essential order administration.</p></section>
      <section><h2>11. Liability and statutory rights</h2><p>Nothing in these terms excludes a right or liability that cannot legally be excluded. Each party remains responsible for direct losses caused by its breach, fraud, wilful misconduct or negligence. Business interruptions outside reasonable control may extend performance while the affected party works to mitigate them.</p></section>
      <section><h2>12. Governing framework and contact</h2><p>These terms are intended for B2B transactions in India. Applicable mandatory law and the dispute terms stated on the final tax invoice or signed commercial agreement prevail. Questions should be raised through the order channel or the business contact shown on your confirmation.</p></section>
    </PolicyShell>
  );
}
