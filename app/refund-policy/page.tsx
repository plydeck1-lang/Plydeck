import type { Metadata } from "next";
import { PolicyShell } from "@/components/policy-shell";

export const metadata: Metadata = {
  title: "Refund Policy | PLYDECK",
  description: "PLYDECK pool cancellation, buyer default and refund timelines.",
};

export default function RefundPolicyPage() {
  return (
    <PolicyShell
      eyebrow="PAYMENTS & REFUNDS"
      title="Refund policy"
      intro="Refund treatment depends on whether the pool is still open, already committed to the supplier, or affected by a PLYDECK, supplier or QC failure."
    >
      <section><h2>1. Full-refund situations</h2><p>Amounts collected for undelivered goods are refundable if PLYDECK cancels an underfilled pool, cannot procure the confirmed specification, cancels because of supplier or QC failure, or receives a duplicate, excess or late payment that cannot secure the quoted slot.</p></section>
      <section><h2>2. Buyer cancellation before confirmation</h2><p>A buyer may request cancellation before pool confirmation and supplier commitment. Once reviewed and approved, the amount collected for the cancelled order is returned to the original payment method.</p></section>
      <section><h2>3. Buyer cancellation after confirmation</h2><p>After the pool is confirmed, 50% has been received and a supplier commitment has been made, the first 50% is treated as a committed amount for buyer-initiated cancellation. PLYDECK reviews actual committed costs, loss and any recovery achieved by reallocating or reselling the slot. Any balance determined refundable after that review will be returned. This does not apply where PLYDECK or the supplier fails to fulfil the confirmed order.</p></section>
      <section><h2>4. Failure to pay after QC</h2><p>If the final 50% is not paid by the due date, PLYDECK issues written notice and a further 48-hour cure period. If payment remains unpaid, the order may be cancelled and the slot offered to the next eligible waiting-list buyer. The committed first 50% is reviewed under the same cost-and-recovery principle described above.</p></section>
      <section><h2>5. Material changes</h2><p>If PLYDECK proposes a material change to the confirmed specification, price or delivery schedule, the buyer may accept it or decline it. Where the change is declined before fulfilment, amounts collected for the affected undelivered order are refundable.</p></section>
      <section><h2>6. Refund timing</h2><p>Approved refunds are initiated to the original payment method within seven business days. The payment provider or recipient bank may require additional settlement time. The platform will show a refund or review state where available.</p></section>
      <section><h2>7. How to request a cancellation</h2><p>Use the cancellation action under My orders. Include the order reference and reason. Do not raise multiple requests for the same payment; the operations team will review the order state, supplier commitment and payment record.</p></section>
    </PolicyShell>
  );
}
