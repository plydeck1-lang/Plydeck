import type { Metadata } from "next";
import { PolicyShell } from "@/components/policy-shell";

export const metadata: Metadata = {
  title: "Cancellation Policy | PLYDECK",
  description: "PLYDECK pool cancellation, slot release and waiting-list policy.",
};

export default function RefundPolicyPage() {
  return (
    <PolicyShell
      eyebrow="BOOKING & CANCELLATIONS"
      title="Cancellation policy"
      intro="PLYDECK uses offline commercial settlement, not an online gateway. This policy explains reservation release, verified offline amounts and waiting-list replacement."
    >
      <section><h2>1. PLYDECK cancellation</h2><p>If PLYDECK cancels an underfilled pool, cannot procure the confirmed specification, or cancels because of supplier or QC failure, all affected reservations are released and buyers are notified. Any verified offline amount received is reviewed and returned through the original offline method or an agreed bank account, subject to reconciliation and applicable deductions disclosed in the order agreement.</p></section>
      <section><h2>2. Buyer cancellation while pool is open</h2><p>A buyer may request cancellation while the pool is live or confirming. The order is marked cancelled and the slot may be released to the next waiting-list buyer. If an offline receipt has already been confirmed, operations reviews the applicable terms and records the settlement outside the platform; no automatic gateway refund exists.</p></section>
      <section><h2>3. Cancellation after supplier commitment</h2><p>After a pool is confirmed or enters QC, a buyer cancellation becomes a cancellation request for operations review. PLYDECK may retain the order record for audit, release the slot when commercially possible and offer it to the next eligible waiting-list buyer.</p></section>
      <section><h2>4. Material changes</h2><p>If PLYDECK proposes a material change to the confirmed specification, price or delivery schedule, the buyer may accept it or decline it. Where the change is declined before fulfilment, the affected reservation is cancelled.</p></section>
      <section><h2>5. How to request a cancellation</h2><p>Use the cancellation action under My orders. Include the order reference and reason. The platform records the request and shows the latest order status.</p></section>
    </PolicyShell>
  );
}
