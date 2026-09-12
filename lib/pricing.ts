import type { Pool, Quote, Stage, Costs, RateCard } from "./types";
export const TERMS_VERSION = "2026-09-p1";
export const FIXED_SLOT_ITEMS = [
  {
    rateKey: "mr_16",
    name: "MR Grade Plywood",
    thickness: 16,
    size: "8 × 4 ft",
    quantity: 50,
  },
  {
    rateKey: "bwp_16",
    name: "BWP Grade Plywood",
    thickness: 16,
    size: "8 × 4 ft",
    quantity: 20,
  },
  {
    rateKey: "mr_6",
    name: "MR Grade Plywood",
    thickness: 6,
    size: "8 × 4 ft",
    quantity: 15,
  },
  {
    rateKey: "bwp_6",
    name: "BWP Grade Plywood",
    thickness: 6,
    size: "8 × 4 ft",
    quantity: 15,
  },
] as const satisfies readonly {
  rateKey: keyof RateCard;
  name: string;
  thickness: number;
  size: string;
  quantity: number;
}[];
export const FIXED_PRIMARY_QTY = 70;
export const FIXED_SECONDARY_QTY = 30;
export const FIXED_SHEETS_PER_SLOT = 100;
export const COST_LABELS: Record<keyof Costs, string> = {
  transport: "Factory → Bengaluru freight",
  unloading: "Warehouse unloading",
  pickup_loading: "Loading for collection",
  factory_packing: "Factory loading & packing",
  insurance: "Transit insurance",
  contingency: "Handling contingency",
  warehouse: "Transit warehouse allocation",
};
export const money = (paise: number, decimals = 0) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(paise / 100);
export const rupees = (value: number) => money(Math.round(value * 100), 2);
export function quoteSlot(pool: Pool, slots = 1): Quote {
  const c = pool.config;
  if (!Number.isInteger(slots) || slots < 1 || slots > pool.total_slots)
    throw new Error("Invalid slot count.");
  const area = FIXED_SHEETS_PER_SLOT * 32 * slots;
  const lines = FIXED_SLOT_ITEMS.map((item) => ({
    label: `${item.name} · ${item.thickness}mm · ${item.size} · rate per sft`,
    amount: Math.round(
      item.quantity * slots * 32 * c.rate_card[item.rateKey] * 100,
    ),
    basis: `${item.quantity * slots} sheets × 32 sqft × ₹${c.rate_card[item.rateKey]}`,
  }));
  for (const k of Object.keys(COST_LABELS) as (keyof Costs)[])
    lines.push({
      label: COST_LABELS[k],
      amount: Math.round((c.costs[k] * 100) / pool.total_slots) * slots,
      basis: `₹${c.costs[k].toLocaleString("en-IN")} pool allocation ÷ ${pool.total_slots} slots × ${slots}`,
    });
  lines.push({
    label: "PLYDECK service & trading spread",
    amount: Math.round(area * c.margin_rate * 100),
    basis: `${area.toLocaleString("en-IN")} sqft × ₹${c.margin_rate}`,
  });
  let subtotal = lines.reduce((s, l) => s + l.amount, 0);
  if (c.rounding_rate > 0) {
    const rounded =
      Math.ceil((subtotal / (area * 100) - 1e-9) / c.rounding_rate) *
      c.rounding_rate;
    const uplift = Math.round(rounded * area * 100) - subtotal;
    if (uplift > 0) {
      lines.push({
        label: "Selling-rate rounding",
        amount: uplift,
        basis: `Rounded up to ₹${c.rounding_rate}/sqft increment`,
      });
      subtotal += uplift;
    }
  }
  const gst = Math.round((subtotal * c.gst_percent) / 100),
    total = subtotal + gst;
  const booking = Math.round(total * 0.1),
    confirmation = Math.round(total * 0.4);
  return {
    primary_qty: FIXED_PRIMARY_QTY,
    secondary_qty: FIXED_SECONDARY_QTY,
    slot_count: slots,
    sheets: FIXED_SHEETS_PER_SLOT * slots,
    area,
    weight_kg:
      (FIXED_PRIMARY_QTY * c.primary_weight +
        FIXED_SECONDARY_QTY * c.secondary_weight) *
      slots,
    lines,
    subtotal,
    gst,
    total,
    rate: subtotal / area / 100,
    stages: { booking, confirmation, dispatch: total - booking - confirmation },
    terms_version: TERMS_VERSION,
  };
}
export function nextStage(
  order: { paid_amount: number; quote: Quote; replacement?: boolean },
  status: string,
): Stage | null {
  if (
    order.paid_amount === 0 &&
    (status === "live" || (order.replacement && status === "qc_ready"))
  )
    return "booking";
  if (
    order.paid_amount === order.quote.stages.booking &&
    (status === "confirming" || (order.replacement && status === "qc_ready"))
  )
    return "confirmation";
  if (
    order.paid_amount ===
      order.quote.stages.booking + order.quote.stages.confirmation &&
    status === "qc_ready"
  )
    return "dispatch";
  return null;
}
