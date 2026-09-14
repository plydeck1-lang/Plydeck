import type { Metadata } from "next";
import { PolicyShell } from "@/components/policy-shell";

export const metadata: Metadata = {
  title: "Privacy Policy | PLYDECK",
  description: "How PLYDECK handles business account, order and communication data.",
};

export default function PrivacyPolicyPage() {
  return (
    <PolicyShell
      eyebrow="PRIVACY"
      title="Privacy policy"
      intro="This policy describes the information PLYDECK uses to operate business accounts, pooled orders, fulfilment and optional WhatsApp notifications."
    >
      <section><h2>1. Information we collect</h2><p>We may collect account identifiers, business and GST details, billing and delivery addresses, contact information, pool and order activity, support communications, consent choices, security logs and basic device or browser information needed to protect and operate the service.</p></section>
      <section><h2>2. Why we use it</h2><p>Information is used to authenticate users, verify business details, prepare quotations and invoices, reserve slots, coordinate suppliers and logistics, perform quality and delivery administration, prevent fraud, provide support and meet tax, accounting and legal obligations.</p></section>
      <section><h2>3. Service providers and disclosures</h2><p>PLYDECK uses specialist providers for hosting, database and authentication, and opted-in business messaging. Relevant information is shared only to the extent required for those services, order fulfilment, legal compliance or protection of the platform and its users. Supplier and logistics partners may receive the business and order details necessary to fulfil a confirmed order.</p></section>
      <section><h2>4. Payments</h2><p>PLYDECK does not collect online payment or card/banking credentials for slot reservations. Commercial settlement, invoicing or tax records agreed after reservation are handled through the business order process.</p></section>
      <section><h2>5. WhatsApp consent</h2><p>WhatsApp operational updates are sent only after explicit opt-in. You may withdraw consent under Business details or through supported opt-out instructions. Withdrawal stops optional WhatsApp sends but does not prevent essential order administration through other available channels.</p></section>
      <section><h2>6. Retention and security</h2><p>We retain information for as long as necessary to operate the account and order, resolve disputes and meet tax, accounting, fraud-prevention and legal duties. We use access controls and technical safeguards appropriate to the service, but no internet system can guarantee absolute security.</p></section>
      <section><h2>7. Your choices</h2><p>Business users may review and update profile information in the platform. Requests concerning access, correction, deletion or consent should be made through the authenticated order channel or the business contact shown on an order confirmation. Some records must be retained where law or legitimate dispute and accounting needs require it.</p></section>
      <section><h2>8. Updates</h2><p>This policy may be updated as the platform, providers or legal requirements change. The current version and updated date will be published on this page.</p></section>
    </PolicyShell>
  );
}
