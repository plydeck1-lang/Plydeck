export type PoolStatus =
  | "draft"
  | "live"
  | "confirming"
  | "confirmed"
  | "qc_ready"
  | "dispatched"
  | "cancelled";
export type Stage = "booking" | "confirmation" | "dispatch";
export type Costs = {
  transport: number;
  unloading: number;
  pickup_loading: number;
  factory_packing: number;
  insurance: number;
  contingency: number;
  warehouse: number;
};
export type RateCard = {
  mr_16: number;
  bwp_16: number;
  mr_6: number;
  bwp_6: number;
};
export type PoolConfig = {
  thickness_primary: number;
  thickness_secondary: number;
  length_ft: number;
  width_ft: number;
  /** Fixed combined sheet count. Kept with legacy aggregate fields for order/RPC compatibility. */
  sheets_per_slot: number;
  /** Legacy 16mm aggregate: always 70 (50 MR + 20 BWP). */
  default_primary: number;
  min_primary: number;
  max_primary: number;
  /** Legacy 6mm aggregate: always 30 (15 MR + 15 BWP). */
  default_secondary: number;
  min_secondary: number;
  max_secondary: number;
  rate_card: RateCard;
  primary_rate: number;
  secondary_rate: number;
  margin_rate: number;
  rounding_rate: number;
  gst_percent: number;
  primary_weight: number;
  secondary_weight: number;
  costs: Costs;
  core: string;
  face: string;
  bond: string;
  tolerance: string;
  specification: string;
};
export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string;
  image_url: string;
  active: boolean;
};
export type Shipment = {
  id: string;
  name: string;
  origin: string;
  destination: string;
  payload_kg: number;
  packing_kg: number;
};
export type Pool = {
  id: string;
  code: string;
  name: string;
  category_id: string;
  shipment_id: string;
  city: string;
  image_url: string;
  status: PoolStatus;
  total_slots: number;
  closes_at: string;
  config: PoolConfig;
  updated_at?: string;
  confirmed_at?: string;
  delivery_target?: string;
  qc_report?: string;
  payment_due_at?: string;
  allocations?: { slot_no: number; status: string }[];
  waitlist_count?: number;
};
export type Profile = {
  id?: string;
  business_name: string;
  contact_name: string;
  phone: string;
  gstin: string;
  address: string;
  city: string;
  pincode: string;
  state: string;
  email?: string;
  whatsapp_opt_in?: boolean;
};
export type QuoteLine = { label: string; amount: number; basis: string };
export type Quote = {
  primary_qty: number;
  secondary_qty: number;
  slot_count: number;
  sheets: number;
  area: number;
  weight_kg: number;
  lines: QuoteLine[];
  subtotal: number;
  gst: number;
  total: number;
  rate: number;
  stages: Record<Stage, number>;
  terms_version: string;
};
export type Order = {
  id: string;
  pool_id: string;
  user_id: string;
  slot_numbers: number[];
  primary_qty: number;
  secondary_qty: number;
  status: string;
  quote: Quote;
  paid_amount: number;
  created_at: string;
  expires_at?: string;
  profile_snapshot?: Profile;
  refund_reason?: string;
  replacement?: boolean;
  payment_due_at?: string;
};
export type WhatsAppMessageStatus =
  "queued" | "sending" | "sent" | "delivered" | "read" | "failed" | "skipped";
export type WhatsAppMessage = {
  id: string;
  order_id?: string | null;
  pool_id?: string | null;
  user_id?: string | null;
  recipient_phone: string;
  purpose: string;
  template_name: string;
  template_language: string;
  variables?: Record<string, string>;
  variable_order?: string[];
  status: WhatsAppMessageStatus;
  provider_message_id?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  attempts?: number;
  last_attempt_at?: string | null;
  created_at: string;
  sent_at?: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
};
export type StoreData = {
  categories: Category[];
  pools: Pool[];
  shipments: Shipment[];
  profile?: Profile | null;
  orders?: Order[];
  isAdmin?: boolean;
  waitlist?: {
    id: string;
    pool_id: string;
    user_id: string;
    created_at: string;
    status: string;
    offered_slot?: number;
    offered_primary?: number;
    offered_secondary?: number;
    offer_expires_at?: string;
  }[];
  refunds?: {
    id: string;
    order_id: string;
    amount: number;
    status: string;
    reason: string;
  }[];
  whatsappMessages?: WhatsAppMessage[];
  whatsapp?: { enabled: boolean; configured: boolean; reason?: string };
};
