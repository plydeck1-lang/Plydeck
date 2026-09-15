import type { Pool, Quote, RateCard } from "./types";
export const TERMS_VERSION = "2026-09-final-rate-1";
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
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
  const gst = 0;
  const total = subtotal;
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
    terms_version: TERMS_VERSION,
  };
}
