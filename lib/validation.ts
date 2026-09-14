import { z } from "zod";
const positive = z.number().finite().positive(),
  nonnegative = z.number().finite().nonnegative();
const image = z
  .string()
  .max(2000)
  .refine(
    (v) => (v.startsWith("/") && !v.startsWith("//")) || /^https:\/\//.test(v),
    "Use a local path or HTTPS image URL.",
  );
export const profileSchema = z.object({
  business_name: z.string().trim().min(2).max(160),
  contact_name: z.string().trim().min(2).max(100),
  phone: z.string().regex(/^[6-9]\d{9}$/),
  gstin: z.string().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/),
  address: z.string().trim().min(10).max(500),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  pincode: z.string().regex(/^[1-9]\d{5}$/),
  whatsapp_opt_in: z.boolean().default(false),
});
export const poolSchema = z.object({
  id: z.uuid(),
  code: z.string().regex(/^[A-Z0-9-]{3,40}$/),
  name: z.string().trim().min(3).max(160),
  category_id: z.uuid(),
  shipment_id: z.uuid(),
  city: z.string().trim().min(2).max(80),
  image_url: image,
  total_slots: z.number().int().min(1).max(100),
  closes_at: z.iso
    .datetime({
      offset: true,
      error: "Choose a valid booking closing date with a timezone.",
    })
    .transform((value) => new Date(value).toISOString()),
  config: z.object({
    thickness_primary: z.literal(16),
    thickness_secondary: z.literal(6),
    length_ft: z.literal(8),
    width_ft: z.literal(4),
    sheets_per_slot: z.literal(100),
    default_primary: z.literal(70),
    min_primary: z.literal(70),
    max_primary: z.literal(70),
    default_secondary: z.literal(30),
    min_secondary: z.literal(30),
    max_secondary: z.literal(30),
    rate_card: z.object({
      mr_16: positive.max(10000),
      bwp_16: positive.max(10000),
      mr_6: positive.max(10000),
      bwp_6: positive.max(10000),
    }),
    primary_rate: positive.max(10000),
    secondary_rate: positive.max(10000),
    margin_rate: nonnegative.max(1000),
    rounding_rate: nonnegative.max(100),
    gst_percent: z.literal(18),
    primary_weight: positive.max(300),
    secondary_weight: positive.max(300),
    costs: z.object({
      transport: nonnegative,
      unloading: nonnegative,
      pickup_loading: nonnegative,
      factory_packing: nonnegative,
      insurance: nonnegative,
      contingency: nonnegative,
      warehouse: nonnegative,
    }),
    core: z.string().trim().min(2).max(200),
    face: z.string().trim().min(2).max(200),
    bond: z.string().trim().min(2).max(200),
    tolerance: z.string().trim().min(2).max(200),
    specification: z.string().trim().min(20).max(5000),
  }),
});
export const categorySchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(2).max(100),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .max(100),
  description: z.string().trim().min(10).max(2000),
  image_url: image,
  active: z.boolean(),
});
export const shipmentSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(3).max(200),
    origin: z.string().trim().min(2).max(200),
    destination: z.string().trim().min(2).max(200),
    payload_kg: positive.max(100000),
    packing_kg: nonnegative.max(10000),
  })
  .refine((s) => s.packing_kg < s.payload_kg, "Packing exceeds payload.");
export const reservationSchema = z
  .object({
    pool_id: z.uuid(),
    slot_numbers: z.array(z.number().int().min(1).max(100)).min(1).max(100),
    expected_total: z.number().int().positive(),
    terms_version: z.literal("2026-09-direct-1"),
  })
  .refine(
    (v) => new Set(v.slot_numbers).size === v.slot_numbers.length,
    "Duplicate slots.",
  );
