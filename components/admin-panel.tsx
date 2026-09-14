"use client";
import { useEffect, useState } from "react";
import {
  Plus,
  ArrowUpRight,
  Save,
  Upload,
  Truck,
  Layers3,
  ClipboardCheck,
  Settings2,
  MessageCircle,
  RefreshCcw,
  Ban,
  BadgeIndianRupee,
} from "lucide-react";
import { Dialog } from "./dialog";
import type {
  StoreData,
  Pool,
  Category,
  PoolConfig,
  Shipment,
  RateCard,
  Order,
  ManualPayment,
} from "@/lib/types";
import { initialConfig } from "@/lib/seed";
import {
  FIXED_SLOT_ITEMS,
  money,
  quoteSlot,
} from "@/lib/pricing";
import { api, DEMO, browserDb } from "@/lib/supabase";
import {
  bookingDateInput,
  bookingDateForSave,
  pendingSpecifications,
  poolPublishIssues,
  SPEC_LABELS,
} from "@/lib/pool-admin";

const POOL_CITIES = [
  { value: "Bengaluru", label: "Bangalore", code: "BLR" },
  { value: "Hyderabad", label: "Hyderabad", code: "HYD" },
] as const;
type Props = {
  data: StoreData;
  onDemoChange: (d: StoreData) => void;
  onRefresh: () => Promise<void>;
  onNotice: (s: string) => void;
  onError: (e: unknown) => void;
};
export function AdminPanel({
  data,
  onDemoChange,
  onRefresh,
  onNotice,
  onError,
}: Props) {
  const [tab, setTab] = useState("pools"),
    [pool, setPool] = useState<Pool | null>(null),
    [category, setCategory] = useState<Category | null>(null),
    [shipment, setShipment] = useState<Shipment | null>(null),
    [slotManager, setSlotManager] = useState<Pool | null>(null),
    [paymentOrder, setPaymentOrder] = useState<Order | null>(null),
    [busy, setBusy] = useState(false),
    [whatsappStatus, setWhatsappStatus] = useState<any>(null);
  useEffect(() => {
    if (tab !== "messages" || DEMO) return;
    void api<any>("admin/whatsapp/status")
      .then(setWhatsappStatus)
      .catch(onError);
  }, [tab]);
  async function save(entity: string, record: unknown) {
    setBusy(true);
    try {
      if (DEMO) {
        const key = entity as "pools" | "categories" | "shipments";
        const item = record as { id: string };
        onDemoChange({
          ...data,
          [key]: data[key].some((v) => v.id === item.id)
            ? data[key].map((v) => (v.id === item.id ? record : v))
            : [...data[key], record],
        });
      } else {
        await api("admin", { action: "save", entity, record });
        await onRefresh();
      }
      setPool(null);
      setCategory(null);
      setShipment(null);
      onNotice(
        entity === "pools" && (record as Pool).status === "draft"
          ? "Pool saved as draft. Use Publish pool to show it to customers."
          : "Changes saved.",
      );
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  async function transition(p: Pool, action: string) {
    if (action === "publish" && poolPublishIssues(p, data.categories).length) {
      setPool(structuredClone(p));
      return;
    }
    let note = "";
    if (action === "qc") {
      note =
        window.prompt(
          "QC report: record batch, sample count, checks, findings and any report URL.",
        ) ?? "";
      if (note.length < 20) {
        onError(new Error("Enter a QC report with at least 20 characters."));
        return;
      }
    }
    if (action === "cancel") {
      note =
        window.prompt(
          "Reason for pool cancellation (all affected reservations will be cancelled):",
        ) ?? "";
      if (!note) return;
    }
    if (
      !window.confirm(
        `${action.toUpperCase()} ${p.code}? This changes customer order availability and fulfilment status.`,
      )
    )
      return;
    setBusy(true);
    try {
      if (DEMO) {
        const orders = (data.orders ?? []).filter(
          (o) =>
            o.pool_id === p.id &&
            !["cancelled", "expired"].includes(o.status),
        );
        const filled = (p.allocations ?? []).filter((entry) =>
          ["reserved", "booked", "blocked"].includes(entry.status),
        ).length;
        if (action === "publish" && p.config.specification.length < 20)
          throw new Error("Add the complete product specification.");
        if (action === "confirm" && filled !== p.total_slots)
          throw new Error("All slots must be reserved or blocked before pool confirmation.");
        if (
          action === "confirm" &&
          orders.some((order) => order.paid_amount < Math.round(order.quote.total * 0.5))
        )
          throw new Error("Confirm 10% + 40% manual payments for every reserved order first.");
        if (
          action === "dispatch" &&
          orders.some((order) => order.paid_amount !== order.quote.total)
        )
          throw new Error("Confirm the final 50% payment for every reserved order first.");
        const status = (
          {
            publish: "live",
            confirm: "confirmed",
            qc: "qc_ready",
            dispatch: "dispatched",
            cancel: "cancelled",
          } as const
        )[action as "publish"];
        if (!status) throw new Error("Unknown action.");
        const next: Pool = {
          ...p,
          status,
          ...(action === "confirm"
            ? {
                confirmed_at: new Date().toISOString(),
                delivery_target: new Date(
                  Date.now() + 7 * 86400000,
                ).toISOString(),
              }
            : {}),
          ...(action === "qc" ? { qc_report: note } : {}),
        };
        onDemoChange({
          ...data,
          pools: data.pools.map((v) => (v.id === p.id ? next : v)),
          orders:
            action === "cancel"
              ? data.orders?.map((o) =>
                  o.pool_id === p.id ? { ...o, status: "cancelled" } : o,
                )
              : action === "dispatch"
                ? data.orders?.map((o) =>
                    o.pool_id === p.id ? { ...o, status: "dispatched" } : o,
                  )
                : data.orders,
        });
      } else {
        await api("admin", {
          action: "transition",
          pool_id: p.id,
          event: action,
          note,
        });
        await onRefresh();
      }
      onNotice("Pool updated.");
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  async function offerNext(poolId: string) {
    try {
      if (DEMO) {
        const next = data.waitlist
          ?.filter((w) => w.pool_id === poolId && w.status === "waiting")
          .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
        if (!next) throw new Error("No buyer is waiting.");
        const p = data.pools.find((p) => p.id === poolId)!;
        const free = Array.from(
          { length: p.total_slots },
          (_, i) => i + 1,
        ).find((n) => !p.allocations?.some((a) => a.slot_no === n));
        if (!free) throw new Error("No free slot.");
        onDemoChange({
          ...data,
          waitlist: data.waitlist?.map((w) =>
            w.id === next.id
              ? {
                  ...w,
                  status: "offered",
                  offered_slot: free,
                  offered_primary: p.config.default_primary,
                  offered_secondary: p.config.default_secondary,
                  offer_expires_at: new Date(
                    Date.now() + 24 * 3600000,
                  ).toISOString(),
                }
              : w,
          ),
        });
      } else {
        await api("admin", { action: "offer_next", pool_id: poolId });
        await onRefresh();
      }
      onNotice("Next waiting buyer has a 24-hour offer.");
    } catch (e) {
      onError(e);
    }
  }
  async function setSlotBlocked(p: Pool, slotNo: number, blocked: boolean) {
    const reason = blocked
      ? window.prompt("Reason for blocking this slot:", "Reserved by PLYDECK operations") ?? ""
      : "";
    if (blocked && reason.trim().length < 3) return;
    if (!blocked && !window.confirm(`Unblock slot ${slotNo} in ${p.code}?`)) return;
    setBusy(true);
    try {
      if (DEMO) {
        const existing = p.allocations ?? [];
        if (blocked && existing.some((entry) => entry.slot_no === slotNo))
          throw new Error("Only an available slot can be blocked.");
        const allocations = blocked
          ? [...existing, { slot_no: slotNo, status: "blocked", reason }]
          : existing.filter((entry) => !(entry.slot_no === slotNo && entry.status === "blocked"));
        const pools = data.pools.map((entry) => entry.id === p.id ? { ...entry, allocations } : entry);
        onDemoChange({ ...data, pools });
        setSlotManager({ ...p, allocations });
      } else {
        await api("admin", { action: "slot_block", pool_id: p.id, slot_no: slotNo, blocked, reason });
        await onRefresh();
        setSlotManager(null);
      }
      onNotice(blocked ? `Slot ${slotNo} blocked.` : `Slot ${slotNo} available again.`);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }
  async function confirmManualPayment(
    order: Order,
    entry: Pick<ManualPayment, "stage" | "method" | "reference" | "note" | "received_at">,
  ) {
    setBusy(true);
    try {
      const amount = paymentStageAmounts(order)[entry.stage];
      if (DEMO) {
        const payment: ManualPayment = {
          id: crypto.randomUUID(),
          order_id: order.id,
          amount,
          recorded_by: "demo-admin",
          created_at: new Date().toISOString(),
          ...entry,
        };
        const paidAmount = order.paid_amount + amount;
        const status = entry.stage === "booking" ? "booked" : entry.stage === "confirmation" ? "confirmed" : "paid";
        onDemoChange({
          ...data,
          manualPayments: [payment, ...(data.manualPayments ?? [])],
          orders: data.orders?.map((item) => item.id === order.id ? { ...item, paid_amount: paidAmount, status } : item),
        });
      } else {
        await api("admin", { action: "manual_payment", order_id: order.id, ...entry });
        await onRefresh();
      }
      setPaymentOrder(null);
      onNotice(`${paymentStageLabel(entry.stage)} payment confirmed.`);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }
  const freshPool = (): Pool => ({
    id: crypto.randomUUID(),
    code: `BLR-OEM-${String(data.pools.length + 1).padStart(3, "0")}`,
    name: "New OEM pool",
    category_id:
      data.categories.find((c) => c.slug === "oem-plywood")?.id ??
      data.categories[0]?.id ??
      "",
    shipment_id: data.shipments[0]?.id ?? "",
    city: "Bengaluru",
    image_url: "/plywood-studio.png",
    status: "draft",
    total_slots: 5,
    closes_at: new Date(Date.now() + 72 * 3600000).toISOString(),
    config: structuredClone(initialConfig),
    allocations: [],
  });
  return (
    <section className="admin-section">
      <div className="section-heading">
        <div>
          <div className="eyebrow">PLYDECK OPERATIONS</div>
          <h1>Manage the collective.</h1>
          <p>
            Publish materials, configure buying pools and move orders through
            fulfilment.
          </p>
        </div>
        <button className="button dark" onClick={() => setPool(freshPool())}>
          <Plus size={18} />
          Create pool
        </button>
      </div>
      <div className="admin-tabs">
        {[
          ["pools", "Pools", Layers3],
          ["categories", "Categories", Settings2],
          ["shipments", "Shipments", Truck],
          ["orders", "Orders", ClipboardCheck],
          ["messages", "WhatsApp log", MessageCircle],
        ].map(([id, label, Icon]) => {
          const I = Icon as typeof Layers3;
          return (
            <button
              key={id as string}
              className={tab === id ? "selected" : ""}
              onClick={() => setTab(id as string)}
            >
              <I size={17} />
              {label as string}
            </button>
          );
        })}
      </div>
      {tab === "pools" && (
        <div className="admin-pool-list">
          {data.pools.map((p) => (
            <article key={p.id} className="admin-pool">
              <div>
                <span className="eyebrow">
                  {p.code} · {p.city}
                </span>
                <h2>{p.name}</h2>
                <p>
                  {(p.allocations ?? []).filter((entry) => entry.status === "reserved" || entry.status === "booked").length} reserved ·{" "}
                  {(p.allocations ?? []).filter((entry) => entry.status === "blocked").length} blocked ·{" "}
                  {p.total_slots} total ·{" "}
                  {p.status.replaceAll("_", " ")} ·{" "}
                  {money(quoteSlot(p).total, 2)} / fixed slot incl. GST
                </p>
                {p.status === "draft" &&
                  poolPublishIssues(p, data.categories).length > 0 && (
                    <p id={`publish-requirements-${p.id}`} className="muted">
                      To enable Publish pool, choose Edit pool.{" "}
                      {poolPublishIssues(p, data.categories).join(" ")}
                    </p>
                  )}
              </div>
              <div className="admin-actions">
                {["draft", "live", "confirming"].includes(p.status) && (
                  <button
                    className="button outline small"
                    onClick={() => setSlotManager(structuredClone(p))}
                  >
                    <Ban size={16} /> Manage slots
                  </button>
                )}
                <button
                  className="button outline small"
                  onClick={() => setPool(structuredClone(p))}
                >
                  Edit pool
                </button>
                {p.status === "draft" && (
                  <button
                    className="button dark small"
                    disabled={
                      busy || poolPublishIssues(p, data.categories).length > 0
                    }
                    aria-describedby={
                      poolPublishIssues(p, data.categories).length
                        ? `publish-requirements-${p.id}`
                        : undefined
                    }
                    title={
                      poolPublishIssues(p, data.categories).join(" ") ||
                      "Make this pool available for bookings"
                    }
                    onClick={() => transition(p, "publish")}
                  >
                    Publish pool
                  </button>
                )}
                {p.status === "live" && (
                  <button
                    className="button dark small"
                    disabled={busy}
                    onClick={() => transition(p, "confirm")}
                  >
                    Confirm full pool
                  </button>
                )}
                {p.status === "confirming" && (
                  <button
                    className="button dark small"
                    disabled={busy}
                    onClick={() => transition(p, "confirm")}
                  >
                    Confirm & start timeline
                  </button>
                )}
                {p.status === "confirmed" && (
                  <button
                    className="button dark small"
                    disabled={busy}
                    onClick={() => transition(p, "qc")}
                  >
                    Release QC report
                  </button>
                )}
                {p.status === "qc_ready" && (
                  <button
                    className="button dark small"
                    disabled={busy}
                    onClick={() => transition(p, "dispatch")}
                  >
                    Mark dispatched
                  </button>
                )}
                {!["cancelled", "dispatched"].includes(p.status) && (
                  <button
                    className="text-button danger"
                    disabled={busy}
                    onClick={() => transition(p, "cancel")}
                  >
                    Cancel pool
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {tab === "categories" && (
        <>
          <button
            className="button outline"
            onClick={() =>
              setCategory({
                id: crypto.randomUUID(),
                name: "",
                slug: "",
                description: "",
                image_url: "/plywood-studio.png",
                active: true,
              })
            }
          >
            <Plus size={17} />
            Add category
          </button>
          <div className="admin-pool-list">
            {data.categories.map((c) => (
              <article className="admin-pool" key={c.id}>
                <div>
                  <h2>{c.name}</h2>
                  <p>{c.description}</p>
                  <span className="badge neutral">
                    {c.active ? "Visible" : "Hidden"}
                  </span>
                </div>
                <button
                  className="button outline small"
                  onClick={() => setCategory({ ...c })}
                >
                  Edit category
                </button>
              </article>
            ))}
          </div>
        </>
      )}
      {tab === "shipments" && (
        <>
          <p className="info-box">
            <InfoIcon />
            Delivery batches are used internally for payload checks. New pools
            are linked to the current batch automatically; the customer-facing
            pool price and specification are managed from the pool editor.
          </p>
          <button
            className="button outline"
            onClick={() =>
              setShipment({
                id: crypto.randomUUID(),
                name: "New shipment",
                origin: "Perumbavoor, Kerala",
                destination: "Bengaluru",
                payload_kg: 32000,
                packing_kg: 600,
              })
            }
          >
            <Plus size={17} />
            Add shipment
          </button>
          {data.shipments.map((s) => (
            <article className="admin-pool" key={s.id}>
              <div>
                <h2>{s.name}</h2>
                <p>
                  {s.origin} → {s.destination}
                </p>
                <p>
                  {s.payload_kg.toLocaleString("en-IN")} kg payload ·{" "}
                  {s.packing_kg} kg packing ·{" "}
                  {data.pools.filter((p) => p.shipment_id === s.id).length}{" "}
                  linked pools
                </p>
              </div>
              <button
                className="button outline small"
                onClick={() => setShipment({ ...s })}
              >
                Edit shipment
              </button>
            </article>
          ))}
        </>
      )}
      {tab === "orders" && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order / buyer</th>
                  <th>Pool / slots</th>
                  <th>Order value</th>
                  <th>Manual payment</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.orders?.map((o) => {
                  const nextStage = nextPaymentStage(o);
                  const poolStatus = data.pools.find((p) => p.id === o.pool_id)?.status;
                  const finalLocked = nextStage === "final" && poolStatus !== "qc_ready";
                  return <tr key={o.id}>
                    <td>
                      <strong>{o.id.slice(0, 8).toUpperCase()}</strong>
                      <small>
                        {o.profile_snapshot?.business_name}
                        <br />
                        {o.profile_snapshot?.gstin}
                      </small>
                    </td>
                    <td>
                      {data.pools.find((p) => p.id === o.pool_id)?.code}
                      <small>
                        {o.slot_numbers.map((n) => `S${n}`).join(", ")}
                      </small>
                    </td>
                    <td>
                      {money(o.quote.total, 2)}
                      <small>Includes GST · offline collection</small>
                    </td>
                    <td>
                      <strong>{money(o.paid_amount, 2)}</strong>
                      <small>{paymentProgressLabel(o)}</small>
                    </td>
                    <td>{o.status.replaceAll("_", " ")}</td>
                    <td>
                      {nextStage && !["cancelled", "expired", "dispatched"].includes(o.status) ? (
                        <button
                          className="button outline small"
                          disabled={busy || finalLocked}
                          title={finalLocked ? "Release the QC report before confirming final payment" : `Confirm ${paymentStageLabel(nextStage)} payment`}
                          onClick={() => setPaymentOrder(o)}
                        >
                          <BadgeIndianRupee size={16} />
                          {finalLocked ? "Final after QC" : `Confirm ${paymentStagePercent(nextStage)}`}
                        </button>
                      ) : (
                        <span className="badge neutral">Payment complete</span>
                      )}
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
            {!data.orders?.length && (
              <div className="empty-state">No orders yet.</div>
            )}
          </div>
          <h2 className="subheading">Waiting lists</h2>
          {data.pools.map((p) => (
            <div className="admin-pool" key={p.id}>
              <div>
                <strong>{p.code}</strong>
                <p>
                  {data.waitlist?.filter(
                    (w) => w.pool_id === p.id && w.status === "waiting",
                  ).length ?? 0}{" "}
                  waiting
                </p>
              </div>
              <button
                className="button outline small"
                onClick={() => offerNext(p.id)}
              >
                Offer next free slot <ArrowUpRight size={15} />
              </button>
            </div>
          ))}
        </>
      )}
      {tab === "messages" && (
        <div className="whatsapp-admin">
          <div className="info-box">
            <MessageCircle size={18} />
            <div>
              <strong>Transactional WhatsApp</strong>
              <p>
                {DEMO
                  ? "Demo mode records opted-in events as skipped. No provider call is made."
                  : whatsappStatus?.configured
                    ? "Meta Cloud API credentials are configured. The Vercel worker sends approved templates every five minutes."
                    : "Connect Meta WhatsApp credentials and approved templates before enabling sending."}
              </p>
            </div>
            <button
              className="icon-button"
              aria-label="Refresh WhatsApp status"
              onClick={() => {
                if (!DEMO)
                  void api<any>("admin/whatsapp/status")
                    .then(setWhatsappStatus)
                    .catch(onError);
              }}
            >
              <RefreshCcw size={16} />
            </button>
          </div>
          <div className="admin-pool">
            <div>
              <strong>
                {whatsappStatus?.enabled
                  ? "Sending enabled"
                  : "Sending disabled"}
              </strong>
              <p>
                {whatsappStatus?.templates ?? "Demo templates"} templates ·{" "}
                {whatsappStatus?.queue?.queued ?? 0} queued ·{" "}
                {whatsappStatus?.queue?.failed ?? 0} failed
              </p>
            </div>
            <span className="badge neutral">
              {whatsappStatus?.configured ? "Configured" : "Setup required"}
            </span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Purpose / template</th>
                  <th>Recipient</th>
                  <th>Status</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {(data.whatsappMessages ?? []).map((m) => (
                  <tr key={m.id}>
                    <td>{new Date(m.created_at).toLocaleString("en-IN")}</td>
                    <td>
                      <strong>{m.purpose.replaceAll("_", " ")}</strong>
                      <small>{m.template_name}</small>
                    </td>
                    <td>
                      ••••{m.recipient_phone.slice(-4)}
                      <small>
                        {m.order_id
                          ? `Order ${m.order_id.slice(0, 8).toUpperCase()}`
                          : "Waiting list"}
                      </small>
                    </td>
                    <td>
                      <span className="badge neutral">{m.status}</span>
                      <small>{m.attempts ?? 0} attempts</small>
                    </td>
                    <td>{m.error_message || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.whatsappMessages?.length && (
              <div className="empty-state">
                No WhatsApp events yet. Opted-in order events will appear here.
              </div>
            )}
          </div>
        </div>
      )}
      {pool && (
        <PoolEditor
          pool={pool}
          data={data}
          busy={busy}
          onClose={() => setPool(null)}
          onSave={(p) => save("pools", p)}
          onError={onError}
        />
      )}
      {category && (
        <Dialog
          title={category.name || "New category"}
          onClose={() => setCategory(null)}
        >
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void save("categories", category);
            }}
          >
            <label>
              Name
              <input
                required
                value={category.name}
                onChange={(e) =>
                  setCategory({ ...category, name: e.target.value })
                }
              />
            </label>
            <label>
              URL slug
              <input
                required
                pattern="[a-z0-9-]+"
                value={category.slug}
                onChange={(e) =>
                  setCategory({ ...category, slug: e.target.value })
                }
              />
            </label>
            <label>
              Description
              <textarea
                required
                value={category.description}
                onChange={(e) =>
                  setCategory({ ...category, description: e.target.value })
                }
              />
            </label>
            <ImageField
              value={category.image_url}
              onChange={(image_url) => setCategory({ ...category, image_url })}
              onError={onError}
            />
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={category.active}
                onChange={(e) =>
                  setCategory({ ...category, active: e.target.checked })
                }
              />
              Visible category
            </label>
            <button className="button dark" disabled={busy}>
              <Save size={17} />
              Save category
            </button>
          </form>
        </Dialog>
      )}
      {shipment && (
        <Dialog title="Shipment capacity" onClose={() => setShipment(null)}>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void save("shipments", shipment);
            }}
          >
            {(["name", "origin", "destination"] as const).map((k) => (
              <label key={k}>
                {k}
                <input
                  required
                  value={shipment[k]}
                  onChange={(e) =>
                    setShipment({ ...shipment, [k]: e.target.value })
                  }
                />
              </label>
            ))}
            {(["payload_kg", "packing_kg"] as const).map((k) => (
              <label key={k}>
                {k === "payload_kg"
                  ? "Legal cargo payload (kg)"
                  : "Packing / dunnage (kg)"}
                <input
                  type="number"
                  min={0}
                  required
                  value={shipment[k]}
                  onChange={(e) =>
                    setShipment({ ...shipment, [k]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
            <button className="button dark" disabled={busy}>
              Save shipment
            </button>
          </form>
        </Dialog>
      )}
      {slotManager && (
        <SlotManagerDialog
          pool={slotManager}
          busy={busy}
          onClose={() => setSlotManager(null)}
          onChange={(slotNo, blocked) => void setSlotBlocked(slotManager, slotNo, blocked)}
        />
      )}
      {paymentOrder && (
        <ManualPaymentDialog
          order={paymentOrder}
          poolStatus={data.pools.find((p) => p.id === paymentOrder.pool_id)?.status}
          busy={busy}
          onClose={() => setPaymentOrder(null)}
          onConfirm={(entry) => void confirmManualPayment(paymentOrder, entry)}
        />
      )}
    </section>
  );
}
type PaymentStage = ManualPayment["stage"];
function paymentStageAmounts(order: Order): Record<PaymentStage, number> {
  const booking = Math.round(order.quote.total * 0.1);
  const confirmation = Math.round(order.quote.total * 0.4);
  return { booking, confirmation, final: order.quote.total - booking - confirmation };
}
function nextPaymentStage(order: Order): PaymentStage | null {
  const amounts = paymentStageAmounts(order);
  if (order.paid_amount < amounts.booking) return "booking";
  if (order.paid_amount < amounts.booking + amounts.confirmation) return "confirmation";
  if (order.paid_amount < order.quote.total) return "final";
  return null;
}
function paymentStagePercent(stage: PaymentStage) {
  return stage === "booking" ? "10%" : stage === "confirmation" ? "40%" : "50%";
}
function paymentStageLabel(stage: PaymentStage) {
  return stage === "booking" ? "booking" : stage === "confirmation" ? "pool confirmation" : "final";
}
function paymentProgressLabel(order: Order) {
  const percent = Math.min(100, Math.round((order.paid_amount / order.quote.total) * 100));
  return `${percent}% confirmed · ${money(order.quote.total - order.paid_amount, 2)} balance`;
}
function SlotManagerDialog({
  pool,
  busy,
  onClose,
  onChange,
}: {
  pool: Pool;
  busy: boolean;
  onClose: () => void;
  onChange: (slotNo: number, blocked: boolean) => void;
}) {
  return (
    <Dialog title={`${pool.code} · Slot controls`} onClose={onClose}>
      <p className="muted">Block an available slot for an offline order, internal allocation or operational hold. Reserved slots cannot be blocked.</p>
      <div className="admin-slot-manager">
        {Array.from({ length: pool.total_slots }, (_, index) => {
          const slotNo = index + 1;
          const allocation = pool.allocations?.find((entry) => entry.slot_no === slotNo);
          const blocked = allocation?.status === "blocked";
          const available = !allocation;
          return (
            <div className={`admin-slot-control ${blocked ? "blocked" : allocation ? "reserved" : "available"}`} key={slotNo}>
              <Layers3 size={21} />
              <strong>Slot {String(slotNo).padStart(2, "0")}</strong>
              <span>{blocked ? "Blocked" : allocation ? allocation.status.replaceAll("_", " ") : "Available"}</span>
              {allocation?.reason && <small>{allocation.reason}</small>}
              {available && <button className="button outline small" disabled={busy} onClick={() => onChange(slotNo, true)}>Block</button>}
              {blocked && <button className="text-button danger" disabled={busy} onClick={() => onChange(slotNo, false)}>Unblock</button>}
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}
function ManualPaymentDialog({
  order,
  poolStatus,
  busy,
  onClose,
  onConfirm,
}: {
  order: Order;
  poolStatus?: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (entry: Pick<ManualPayment, "stage" | "method" | "reference" | "note" | "received_at">) => void;
}) {
  const stage = nextPaymentStage(order)!;
  const amount = paymentStageAmounts(order)[stage];
  const [method, setMethod] = useState<ManualPayment["method"]>("bank_transfer");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [receivedAt, setReceivedAt] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const finalLocked = stage === "final" && poolStatus !== "qc_ready";
  return (
    <Dialog title={`Confirm ${paymentStagePercent(stage)} manual payment`} onClose={onClose}>
      <form className="form-stack" onSubmit={(event) => {
        event.preventDefault();
        onConfirm({ stage, method, reference, note, received_at: new Date(receivedAt).toISOString() });
      }}>
        <div className="manual-payment-summary">
          <span>Order {order.id.slice(0, 8).toUpperCase()}</span>
          <strong>{money(amount, 2)}</strong>
          <small>{paymentStageLabel(stage)} · {paymentStagePercent(stage)} of order total</small>
        </div>
        {finalLocked && <p className="info-box">Release the QC report before confirming the final 50% payment.</p>}
        <label>Payment method
          <select value={method} onChange={(event) => setMethod(event.target.value as ManualPayment["method"])}>
            <option value="bank_transfer">Bank transfer</option>
            <option value="upi">UPI</option>
            <option value="cash">Cash</option>
            <option value="cheque">Cheque</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>Transaction / receipt reference
          <input required minLength={2} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="UTR, UPI reference, receipt number…" />
        </label>
        <label>Received date and time
          <input type="datetime-local" required value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} />
        </label>
        <label>Internal note
          <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional reconciliation note" />
        </label>
        <button className="button dark" disabled={busy || finalLocked}>
          <BadgeIndianRupee size={17} /> Confirm payment received
        </button>
        <p className="tiny muted">This is an audited offline receipt confirmation. No payment gateway transaction is created.</p>
      </form>
    </Dialog>
  );
}
function InfoIcon() {
  return <span aria-hidden>ⓘ</span>;
}
function ImageField({
  value,
  onChange,
  onError,
}: {
  value: string;
  onChange: (s: string) => void;
  onError: (e: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function upload(file: File) {
    setBusy(true);
    try {
      if (DEMO) {
        onError(
          new Error(
            "Uploads are enabled after connecting Supabase. Use a public image URL in demo mode.",
          ),
        );
        return;
      }
      const {
        data: { session },
      } = await browserDb().auth.getSession();
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onChange(data.url);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form-stack">
      <label>
        Product image URL
        <input
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://… or /plywood-studio.png"
        />
      </label>
      <label className="upload-label">
        <Upload size={17} />
        {busy ? "Uploading…" : "Upload image · JPEG, PNG or WebP · up to 5 MB"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(e) => {
            if (e.target.files?.[0]) void upload(e.target.files[0]);
          }}
        />
      </label>
    </div>
  );
}
function PoolEditor({
  pool,
  data,
  busy,
  onClose,
  onSave,
  onError,
}: {
  pool: Pool;
  data: StoreData;
  busy: boolean;
  onClose: () => void;
  onSave: (p: Pool) => void;
  onError: (e: unknown) => void;
}) {
  const [d, setD] = useState(pool),
    [ack, setAck] = useState(false),
    [closesInput, setClosesInput] = useState(() =>
      bookingDateInput(pool.closes_at),
    );
  const locked =
    (pool.allocations?.length ?? 0) > 0 ||
    !["draft", "live"].includes(pool.status);
  function config(k: keyof PoolConfig, value: unknown) {
    setD({ ...d, config: { ...d.config, [k]: value } });
  }
  function changeCity(city: (typeof POOL_CITIES)[number]["value"]) {
    const prefix = POOL_CITIES.find((entry) => entry.value === city)!.code;
    const code = /^(BLR|HYD)-/.test(d.code)
      ? d.code.replace(/^(BLR|HYD)-/, `${prefix}-`)
      : d.code;
    setD({ ...d, city, code });
  }
  function number(
    k: keyof PoolConfig,
    label: string,
    min = 0,
    step: any = "any",
  ) {
    return (
      <label key={k}>
        {label}
        <input
          type="number"
          min={min}
          step={step}
          required
          value={d.config[k] as number}
          onChange={(e) => config(k, Number(e.target.value))}
        />
      </label>
    );
  }
  function rate(key: keyof RateCard) {
    const item = FIXED_SLOT_ITEMS.find((entry) => entry.rateKey === key)!;
    return (
      <label className="rate-card-row" key={key}>
        <span>
          <strong>{item.name}</strong>
          <small>
            {item.thickness}mm · {item.size} · {item.quantity} sheets
          </small>
        </span>
        <span>
          Rate per sft (₹) + GST
          <input
            type="number"
            min={0.01}
            step="0.01"
            required
            value={d.config.rate_card[key]}
            onChange={(e) => {
              const value = Number(e.target.value);
              setD({
                ...d,
                config: {
                  ...d.config,
                  rate_card: { ...d.config.rate_card, [key]: value },
                  primary_rate: key === "mr_16" ? value : d.config.primary_rate,
                  secondary_rate:
                    key === "mr_6" ? value : d.config.secondary_rate,
                },
              });
            }}
          />
        </span>
      </label>
    );
  }
  return (
    <Dialog title={`${d.code} · Pool setup`} wide onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ack) {
            onError(new Error("Confirm the pool configuration before saving."));
            return;
          }
          try {
            const next = {
              ...d,
              closes_at: bookingDateForSave(d.closes_at, closesInput),
            };
            quoteSlot(next);
            onSave(next);
          } catch (e) {
            onError(e);
          }
        }}
      >
        {locked && (
          <p className="info-box">
            This pool has reservations or has entered fulfilment. Its commercial
            configuration is locked. Create a new pool for revised quantities or
            prices.
          </p>
        )}
        <fieldset disabled={locked || busy}>
          <div className="form-grid">
            <label>
              Pool code
              <input
                required
                value={d.code}
                onChange={(e) => setD({ ...d, code: e.target.value })}
              />
            </label>
            <label>
              Plywood item / pool name
              <input
                required
                value={d.name}
                onChange={(e) => setD({ ...d, name: e.target.value })}
              />
            </label>
            <label>
              City
              <select
                required
                value={d.city}
                onChange={(e) =>
                  changeCity(
                    e.target.value as (typeof POOL_CITIES)[number]["value"],
                  )
                }
              >
                {POOL_CITIES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Category
              <select
                value={d.category_id}
                onChange={(e) => setD({ ...d, category_id: e.target.value })}
              >
                {data.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Number of slots
              <input
                type="number"
                required
                min={1}
                max={100}
                value={d.total_slots}
                onChange={(e) =>
                  setD({ ...d, total_slots: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Booking closes (IST)
              <input
                type="datetime-local"
                required
                value={closesInput}
                onChange={(e) => setClosesInput(e.target.value)}
              />
              <small className="muted">India Standard Time (UTC+05:30)</small>
            </label>
          </div>
          <p className="info-box">
            Saving creates a draft. After reviewing the product and price,
            click <strong>Publish pool</strong> on the Pools tab. The pool will
            then appear automatically in its selected category and city.
          </p>
          <h3>Fixed slot contents &amp; selling rate card</h3>
          <p className="muted">
            Every slot contains these 100 sheets. Grade, thickness, size and
            quantity are locked; set only the current rate per sft for each
            plywood item.
          </p>
          <div className="admin-rate-card">
            {FIXED_SLOT_ITEMS.map((item) => rate(item.rateKey))}
          </div>
          <h3>Selling spread</h3>
          <div className="form-grid">
            {number("margin_rate", "PLYDECK spread ₹/sqft", 0)}
            {number("rounding_rate", "Round up rate to ₹/sqft", 0)}
            <label>
              GST
              <input value="18%" disabled />
            </label>
          </div>
          <h3>Product specification</h3>
          {pendingSpecifications(d.config).length > 0 && (
            <div className="info-box" role="status">
              <div>
                <strong>Complete before publishing</strong>
                <p>{pendingSpecifications(d.config).join(", ")}</p>
                <p>
                  You can save a draft while these details are pending. Enter
                  the actual supplier-confirmed values before making this pool
                  live.
                </p>
              </div>
            </div>
          )}
          <div className="form-grid">
            {(["core", "face", "bond", "tolerance"] as const).map((k) => (
              <label key={k}>
                {SPEC_LABELS[k]}
                <input
                  required
                  value={d.config[k]}
                  onChange={(e) => config(k, e.target.value)}
                />
              </label>
            ))}
          </div>
          <label>
            Full specification / supplier commitment
            <textarea
              required
              minLength={20}
              value={d.config.specification}
              onChange={(e) => config("specification", e.target.value)}
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            {d.status === "draft"
              ? "I have reviewed the category, fixed slot, four-item rate card and product specification. Supplier-confirmed specifications must be completed before publishing."
              : "I have checked all four rates and the complete product specification."}
          </label>
        </fieldset>
        <button className="button dark" disabled={busy || locked}>
          <Save size={17} />
          Save pool configuration
        </button>
      </form>
    </Dialog>
  );
}
