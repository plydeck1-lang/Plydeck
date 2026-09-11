"use client";
import { useEffect, useState, useCallback } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  MapPin,
  ChevronDown,
  Layers3,
  Truck,
  ShieldCheck,
  Clock3,
  Plus,
  Check,
  Package,
  UserRound,
  SlidersHorizontal,
  LogOut,
  Leaf,
  LockKeyhole,
  LoaderCircle,
  Info,
  MessageCircle,
} from "lucide-react";
import type { Pool, StoreData, Profile, Order, Stage } from "@/lib/types";
import { demoSeed } from "@/lib/seed";
import {
  quoteSlot,
  money,
  rupees,
  nextStage,
  TERMS_VERSION,
  FIXED_SLOT_ITEMS,
} from "@/lib/pricing";
import { api, browserDb, DEMO } from "@/lib/supabase";
import { Dialog } from "./dialog";
import { Terms } from "./terms";
import { AdminPanel } from "./admin-panel";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, fn: (arg: any) => void) => void;
    };
  }
}
const cities = ["Bengaluru", "Hyderabad", "Chennai", "Kochi", "Mumbai", "Pune"];
const emptyProfile: Profile = {
  business_name: "",
  contact_name: "",
  phone: "",
  gstin: "",
  address: "",
  city: "Bengaluru",
  pincode: "",
  state: "Karnataka",
  whatsapp_opt_in: false,
};
const statusLabel = (status: string) =>
  ({
    live: "Open for booking",
    confirming: "40% payment due",
    confirmed: "Pool confirmed",
    qc_ready: "QC complete",
    dispatched: "Dispatched",
    cancelled: "Cancelled",
    draft: "Draft",
  })[status] ?? status.replaceAll("_", " ");
function migrateDemoData(value: StoreData): StoreData {
  const fallback = demoSeed().pools[0].config;
  return {
    ...value,
    pools: value.pools.map((p) => {
      const c = {
        ...fallback,
        ...p.config,
        rate_card: { ...fallback.rate_card, ...p.config?.rate_card },
        thickness_primary: 16,
        thickness_secondary: 6,
        length_ft: 8,
        width_ft: 4,
        sheets_per_slot: 100,
        default_primary: 70,
        min_primary: 70,
        max_primary: 70,
        default_secondary: 30,
        min_secondary: 30,
        max_secondary: 30,
      };
      return { ...p, config: c };
    }),
    waitlist: value.waitlist?.map((w) => ({
      ...w,
      offered_primary: 70,
      offered_secondary: 30,
    })),
  };
}

export default function Storefront() {
  const [data, setData] = useState<StoreData>({
    categories: [],
    pools: [],
    shipments: [],
    orders: [],
  });
  const [ready, setReady] = useState(false),
    [city, setCity] = useState(""),
    [cityDialog, setCityDialog] = useState(false),
    [view, setView] = useState("pools"),
    [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<string | null>(null),
    [auth, setAuth] = useState(false),
    [terms, setTerms] = useState(false),
    [profileDialog, setProfileDialog] = useState(false),
    [user, setUser] = useState<string | null>(null);
  const [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [now, setNow] = useState(Date.now());
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const refresh = useCallback(async () => {
    if (DEMO) return;
    try {
      const res = await api<StoreData>("catalog");
      setData(res);
      if (res.profile) setProfile(res.profile);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => {
    const chosen = localStorage.getItem("plydeck-city");
    if (chosen) setCity(chosen);
    else setCityDialog(true);
    if (DEMO) {
      try {
        const local = localStorage.getItem("plydeck-demo-v1");
        const saved = migrateDemoData(local ? JSON.parse(local) : demoSeed());
        setData(saved);
        if (saved.profile) {
          setProfile(saved.profile);
          setUser("demo-buyer");
        }
      } catch {
        setData(demoSeed());
      }
      setReady(true);
      return;
    }
    void refresh();
    let unsubscribe = () => {};
    try {
      const sub = browserDb().auth.onAuthStateChange((_event, session) => {
        setUser(session?.user.id ?? null);
        setTimeout(() => void refresh(), 0);
      });
      unsubscribe = () => sub.data.subscription.unsubscribe();
    } catch (e) {
      setError((e as Error).message);
      setReady(true);
    }
    return unsubscribe;
  }, [refresh]);
  useEffect(() => {
    if (DEMO && ready)
      localStorage.setItem("plydeck-demo-v1", JSON.stringify(data));
  }, [data, ready]);
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
      if (!DEMO) void refresh();
    }, 30000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("plydeck-error", { detail: error }));
  }, [error]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const context = (document as any).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(
      context.registerTool(
        {
          name: "configure_plywood_pool",
          description:
            "Open a plywood pool configurator in the chosen city. Does not reserve a slot or make a payment.",
          inputSchema: {
            type: "object",
            properties: { poolCode: { type: "string" } },
            required: ["poolCode"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false },
          execute: async (input: unknown) => {
            const code = (input as { poolCode?: string })?.poolCode;
            const pool = data.pools.find((p) => p.code === code);
            if (!pool) throw new Error("Unknown pool.");
            setCity(pool.city);
            setSelected(pool.id);
            return {
              poolCode: pool.code,
              city: pool.city,
              action: "configurator_opened",
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
    return () => lifecycle.abort();
  }, [data.pools]);
  function chooseCity(value: string) {
    setCity(value);
    localStorage.setItem("plydeck-city", value);
    setCityDialog(false);
  }
  function demoUpdate(next: StoreData) {
    setData(next);
  }
  function queueDemoWhatsApp(
    order: Order | undefined,
    purpose: string,
    template_name: string,
    variables: Record<string, string> = {},
  ) {
    if (!DEMO || !profile.whatsapp_opt_in || !profile.phone) return;
    const message = {
      id: crypto.randomUUID(),
      order_id: order?.id ?? null,
      pool_id: order?.pool_id ?? null,
      user_id: "demo-buyer",
      recipient_phone: profile.phone,
      purpose,
      template_name,
      template_language: "en_US",
      variables,
      status: "skipped" as const,
      error_message:
        "Demo mode — no message sent. Connect Meta WhatsApp in production.",
      created_at: new Date().toISOString(),
    };
    setData((d) => ({
      ...d,
      whatsappMessages: [message, ...(d.whatsappMessages ?? [])],
    }));
  }
  async function logout() {
    if (DEMO) {
      setUser(null);
      setData((d) => ({ ...d, profile: null, isAdmin: false }));
      setProfile(emptyProfile);
    } else await browserDb().auth.signOut();
    setView("pools");
  }
  function notifyError(e: unknown) {
    setError(e instanceof Error ? e.message : String(e));
  }
  async function saveProfile(value: Profile) {
    try {
      if (DEMO) {
        setData((d) => ({ ...d, profile: value }));
        setUser("demo-buyer");
      } else {
        await api("profile", value);
        await refresh();
      }
      setProfile(value);
      setProfileDialog(false);
      setNotice("Business details saved.");
    } catch (e) {
      notifyError(e);
    }
  }
  async function waitlist(pool: Pool) {
    if (!user) {
      setAuth(true);
      return;
    }
    try {
      if (DEMO) {
        if (
          data.waitlist?.some(
            (w) => w.pool_id === pool.id && w.user_id === "demo-buyer",
          )
        )
          throw new Error("You are already on this waiting list.");
        setData((d) => ({
          ...d,
          waitlist: [
            ...(d.waitlist ?? []),
            {
              id: crypto.randomUUID(),
              pool_id: pool.id,
              user_id: "demo-buyer",
              created_at: new Date().toISOString(),
              status: "waiting",
            },
          ],
          pools: d.pools.map((p) =>
            p.id === pool.id
              ? { ...p, waitlist_count: (p.waitlist_count ?? 0) + 1 }
              : p,
          ),
        }));
      } else {
        await api("waitlist", { pool_id: pool.id });
        await refresh();
      }
      setNotice("You are on the waiting list. No payment has been taken.");
    } catch (e) {
      notifyError(e);
    }
  }
  async function payRazorpay(payload: {
    order_id: string;
    razorpay_order_id: string;
    key: string;
    amount: number;
  }) {
    if (!window.Razorpay)
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://checkout.razorpay.com/v1/checkout.js";
        s.onload = () => resolve();
        s.onerror = () =>
          reject(
            new Error(
              "Payment checkout could not load. Please retry from My orders.",
            ),
          );
        document.body.appendChild(s);
      });
    await new Promise<void>((resolve, reject) => {
      const checkout = new window.Razorpay!({
        key: payload.key,
        amount: payload.amount,
        currency: "INR",
        name: "PLYDECK",
        description: "Plywood pool payment",
        order_id: payload.razorpay_order_id,
        prefill: {
          name: profile.contact_name,
          email: profile.email,
          contact: profile.phone,
        },
        theme: { color: "#163d32" },
        handler: async (result: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const verified = await api<{
              verified: boolean;
              refund_pending?: boolean;
            }>("payments/verify", { ...result, order_id: payload.order_id });
            if (!verified.verified)
              throw new Error(
                "Payment received after this reservation became unavailable. It is in the full-refund queue; no slot was reserved.",
              );
            resolve();
          } catch (e) {
            reject(e);
          }
        },
        modal: {
          ondismiss: () =>
            reject(
              new Error(
                "Checkout closed. Any active slot hold expires after 15 minutes; resume from My orders.",
              ),
            ),
        },
      });
      checkout.on("payment.failed", () =>
        reject(
          new Error("Payment was not completed. You can retry from My orders."),
        ),
      );
      checkout.open();
    });
  }
  async function reserve(pool: Pool, slots: number[]) {
    if (!user) {
      setAuth(true);
      return;
    }
    if (!profile.business_name || !profile.gstin) {
      setProfileDialog(true);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const quote = quoteSlot(pool, slots.length);
      if (DEMO) {
        if (pool.status !== "live" || Date.parse(pool.closes_at) <= Date.now())
          throw new Error("This pool is no longer open.");
        if (slots.some((n) => pool.allocations?.some((a) => a.slot_no === n)))
          throw new Error("A selected slot is already booked.");
        const shipment = data.shipments.find((s) => s.id === pool.shipment_id)!;
        let projected = shipment.packing_kg;
        for (const p of data.pools.filter(
          (p) => p.shipment_id === shipment.id && p.status !== "cancelled",
        )) {
          const orders = (data.orders ?? []).filter(
            (o) =>
              o.pool_id === p.id &&
              !["cancelled", "defaulted", "refunded"].includes(o.status),
          );
          const actual = orders.reduce((sum, o) => sum + o.quote.weight_kg, 0);
          const used = orders.reduce(
            (sum, o) => sum + o.slot_numbers.length,
            0,
          );
          projected += actual + (p.total_slots - used) * quoteSlot(p).weight_kg;
        }
        if (projected > shipment.payload_kg)
          throw new Error(
            "The fixed slots assigned to this shipment exceed the truck payload.",
          );
        const order: Order = {
          id: crypto.randomUUID(),
          user_id: "demo-buyer",
          pool_id: pool.id,
          slot_numbers: slots,
          primary_qty: quote.primary_qty,
          secondary_qty: quote.secondary_qty,
          status: "booked",
          quote,
          paid_amount: quote.stages.booking,
          created_at: new Date().toISOString(),
          profile_snapshot: profile,
        };
        setData((d) => ({
          ...d,
          orders: [order, ...(d.orders ?? [])],
          pools: d.pools.map((p) =>
            p.id === pool.id
              ? {
                  ...p,
                  allocations: [
                    ...(p.allocations ?? []),
                    ...slots.map((slot_no) => ({ slot_no, status: "booked" })),
                  ],
                }
              : p,
          ),
        }));
        queueDemoWhatsApp(
          order,
          "booking_received",
          "plydeck_booking_received",
          {
            order_ref: order.id.slice(0, 8).toUpperCase(),
            pool_code: pool.code,
            amount: money(quote.stages.booking, 2),
          },
        );
      } else {
        const payment = await api<{
          order_id: string;
          razorpay_order_id: string;
          key: string;
          amount: number;
        }>("checkout", {
          pool_id: pool.id,
          slot_numbers: slots,
          expected_total: quote.total,
          terms_version: TERMS_VERSION,
        });
        await payRazorpay(payment);
        await refresh();
      }
      setSelected(null);
      setView("orders");
      setNotice(
        DEMO
          ? "Demo reservation created. No money was charged."
          : "Payment verified. Your slots are reserved.",
      );
    } catch (e) {
      notifyError(e);
      if (!DEMO) await refresh();
    } finally {
      setLoading(false);
    }
  }
  async function payStage(order: Order, stage: Stage) {
    setLoading(true);
    try {
      if (DEMO) {
        setData((d) => ({
          ...d,
          orders: d.orders?.map((o) =>
            o.id === order.id
              ? {
                  ...o,
                  paid_amount: o.paid_amount + o.quote.stages[stage],
                  status:
                    stage === "booking"
                      ? "booked"
                      : stage === "confirmation"
                        ? "confirmed"
                        : "paid",
                }
              : o,
          ),
        }));
      } else {
        const payment = await api<{
          order_id: string;
          razorpay_order_id: string;
          key: string;
          amount: number;
        }>("payments/create", { order_id: order.id, stage });
        await payRazorpay(payment);
        await refresh();
      }
      setNotice(
        DEMO
          ? "Demo instalment recorded. No money was charged."
          : "Payment verified.",
      );
    } catch (e) {
      notifyError(e);
    } finally {
      setLoading(false);
    }
  }
  async function requestCancellation(order: Order) {
    if (
      !window.confirm(
        "Request cancellation of this order? The published refund terms apply.",
      )
    )
      return;
    try {
      if (DEMO) {
        const p = data.pools.find((p) => p.id === order.pool_id);
        const refundable = p?.status === "live" || p?.status === "confirming";
        setData((d) => ({
          ...d,
          orders: d.orders?.map((o) =>
            o.id === order.id
              ? {
                  ...o,
                  status: refundable
                    ? "refund_pending"
                    : "cancellation_requested",
                }
              : o,
          ),
          pools: refundable
            ? d.pools.map((p) =>
                p.id === order.pool_id
                  ? {
                      ...p,
                      allocations: p.allocations?.filter(
                        (a) => !order.slot_numbers.includes(a.slot_no),
                      ),
                    }
                  : p,
              )
            : d.pools,
          refunds: [
            ...(d.refunds ?? []),
            {
              id: crypto.randomUUID(),
              order_id: order.id,
              amount: refundable ? order.paid_amount : 0,
              status: "review",
              reason: "Buyer cancellation request",
            },
          ],
        }));
      } else {
        await api("orders/cancel", { order_id: order.id });
        await refresh();
      }
      setNotice(
        "Cancellation request recorded. The applicable refund will be reviewed.",
      );
    } catch (e) {
      notifyError(e);
    }
  }
  const pools = data.pools.filter(
    (p) =>
      p.city === city &&
      p.status !== "draft" &&
      (category === "all" || p.category_id === category),
  );
  const live = pools.filter(
    (p) => p.status === "live" && Date.parse(p.closes_at) > now,
  );
  const selectedPool = data.pools.find((p) => p.id === selected);
  return (
    <>
      {DEMO && (
        <div className="demo-bar">
          <span>
            DEMO PREVIEW · Sample prices and bookings. No real payments.
          </span>
          <button
            onClick={() => {
              setData((d) => ({ ...d, isAdmin: true }));
              setView("admin");
            }}
          >
            Explore admin <ArrowUpRight size={13} />
          </button>
        </div>
      )}
      <header className="header">
        <button
          className="brand"
          onClick={() => setView("pools")}
          aria-label="PLYDECK home"
        >
          <img
            src="/plydeck-logo-nav.png"
            alt="Plydeсk"
            className="brand-logo"
          />
        </button>
        <button className="city-button" onClick={() => setCityDialog(true)}>
          <MapPin size={17} />
          <span>{city || "Choose your city"}</span>
          <ChevronDown size={14} />
        </button>
        <nav aria-label="Main navigation">
          <button
            className={view === "pools" ? "active" : ""}
            onClick={() => setView("pools")}
          >
            Live pools
          </button>
          <button
            className={view === "categories" ? "active" : ""}
            onClick={() => setView("categories")}
          >
            Plywood
          </button>
          <button
            className={view === "orders" ? "active" : ""}
            onClick={() => (user ? setView("orders") : setAuth(true))}
          >
            My orders
          </button>
          {data.isAdmin && (
            <button
              className={view === "admin" ? "active" : ""}
              onClick={() => setView("admin")}
            >
              Manage
            </button>
          )}
        </nav>
        {user ? (
          <div className="account-buttons">
            <button className="account" onClick={() => setProfileDialog(true)}>
              <UserRound size={17} />
              <span>{profile.business_name || "Business details"}</span>
            </button>
            <button
              className="icon-button"
              aria-label="Log out"
              onClick={logout}
            >
              <LogOut size={17} />
            </button>
          </div>
        ) : (
          <button className="button dark small" onClick={() => setAuth(true)}>
            Business login <ArrowUpRight size={15} />
          </button>
        )}
      </header>
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
      <main>
        {view === "pools" && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow">
                  <span className="short-rule" /> THE COLLECTIVE BUYING
                  ADVANTAGE
                </div>
                <h1>
                  Better plywood.
                  <br />
                  <span>Bought together.</span>
                </h1>
                <p>
                  Factory sourcing. Shared logistics. Every cost in view.
                  <br className="desktop-only" /> Join a plywood pool built for
                  your city.
                </p>
                <a href="#live-pools" className="button lime">
                  Explore {city || "city"} pools <ArrowRight size={18} />
                </a>
                <div className="hero-proof">
                  <span>
                    <ShieldCheck size={16} /> QC before dispatch
                  </span>
                  <span>
                    <Layers3 size={16} /> Reserve with 10%
                  </span>
                </div>
              </div>
              <div className="hero-image">
                <img
                  src="/plywood-studio.png"
                  alt="Layered plywood sheets stacked in a studio; representative product image"
                />
                <div className="image-tag">
                  <span>MATERIALS THAT BUILD MORE.</span>
                  <small>Factory to your city, together.</small>
                </div>
                <span className="image-caption">Representative imagery</span>
              </div>
            </section>
            <div className="how-strip">
              <div>
                <span>01</span>
                <p>
                  Choose your city<strong>Find a local buying pool</strong>
                </p>
              </div>
              <div>
                <span>02</span>
                <p>
                  Choose your slots<strong>Fixed 100-sheet composition</strong>
                </p>
              </div>
              <div>
                <span>03</span>
                <p>
                  Reserve with 10%<strong>Pay in clear milestones</strong>
                </p>
              </div>
              <div>
                <span>04</span>
                <p>
                  Quality checked<strong>Balance paid before dispatch</strong>
                </p>
              </div>
            </div>
            <section className="pool-section" id="live-pools">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">BUY BETTER, TOGETHER</div>
                  <h2>
                    Live pools in <span>{city || "your city"}</span>
                  </h2>
                  <p>
                    One shared shipment. Individual orders. A fixed, transparent
                    slot.
                  </p>
                </div>
                <button
                  className="text-button"
                  onClick={() => setCityDialog(true)}
                >
                  <MapPin size={17} />
                  Change city
                </button>
              </div>
              <div className="filter-row">
                <div className="category-tabs">
                  <button
                    className={category === "all" ? "chosen" : ""}
                    onClick={() => setCategory("all")}
                  >
                    All plywood{" "}
                    <span>
                      {
                        data.pools.filter(
                          (p) => p.city === city && p.status === "live",
                        ).length
                      }
                    </span>
                  </button>
                  {data.categories
                    .filter((c) => c.active)
                    .map((c) => (
                      <button
                        key={c.id}
                        className={category === c.id ? "chosen" : ""}
                        onClick={() => setCategory(c.id)}
                      >
                        {c.name}
                      </button>
                    ))}
                </div>
                <span className="filter-meta">
                  <SlidersHorizontal size={15} /> {live.length} open pools
                </span>
              </div>
              {!ready ? (
                <div className="empty-state">
                  <LoaderCircle className="spin" />
                  Loading pools…
                </div>
              ) : live.length === 0 ? (
                <div className="empty-state">
                  <Package size={38} />
                  <h3>No open pools {city ? `in ${city}` : "yet"}</h3>
                  <p>Choose another city or return when a new pool opens.</p>
                  <button
                    className="button dark"
                    onClick={() => setCityDialog(true)}
                  >
                    Choose city
                  </button>
                </div>
              ) : (
                <div className="pool-grid">
                  {live.map((pool) => (
                    <PoolCard
                      key={pool.id}
                      pool={pool}
                      onSelect={() => setSelected(pool.id)}
                      onWaitlist={() => waitlist(pool)}
                      now={now}
                    />
                  ))}
                </div>
              )}
              {pools.some(
                (p) => p.status !== "live" && p.status !== "cancelled",
              ) && (
                <div className="in-progress-pools">
                  <h3>Pools in progress</h3>
                  {pools
                    .filter(
                      (p) => p.status !== "live" && p.status !== "cancelled",
                    )
                    .map((p) => (
                      <button
                        key={p.id}
                        className="progress-pool"
                        onClick={() => setSelected(p.id)}
                      >
                        {p.code}
                        <span>{statusLabel(p.status)}</span>
                        <ArrowUpRight size={16} />
                      </button>
                    ))}
                </div>
              )}
            </section>
            <section className="bottom-callout">
              <ShieldCheck size={37} />
              <div>
                <h3>Your material. Your numbers. No guesswork.</h3>
                <p>
                  See the ex-factory reference rates, taxable value, GST and all
                  three payments before you book.
                </p>
              </div>
              <button className="text-button" onClick={() => setTerms(true)}>
                How payments & refunds work <ArrowUpRight size={18} />
              </button>
            </section>
          </>
        )}
        {view === "categories" && (
          <section className="catalog-section">
            <div className="eyebrow">THE MATERIAL LIBRARY</div>
            <h1>
              Plywood for the
              <br />
              <span>way you build.</span>
            </h1>
            <div className="category-grid">
              {data.categories
                .filter((c) => c.active)
                .map((c, i) => (
                  <article className="category-card" key={c.id}>
                    <div className={`category-image crop-${i}`}>
                      <img
                        src={c.image_url || "/plywood-studio.png"}
                        alt={`Representative ${c.name}`}
                      />
                      <span>0{i + 1}</span>
                    </div>
                    <h2>{c.name}</h2>
                    <p>{c.description}</p>
                    <button
                      className="text-button"
                      onClick={() => {
                        setCategory(c.id);
                        setView("pools");
                      }}
                    >
                      View available pools <ArrowUpRight size={17} />
                    </button>
                  </article>
                ))}
            </div>
          </section>
        )}
        {view === "orders" && (
          <section className="orders-section">
            <div className="section-heading">
              <div>
                <div className="eyebrow">YOUR PLYDECK ORDERS</div>
                <h1>
                  From reservation
                  <br />
                  <span>to ready for dispatch.</span>
                </h1>
              </div>
              <button
                className="button outline"
                onClick={() => setView("pools")}
              >
                Browse pools <Plus size={17} />
              </button>
            </div>
            <p className="info-box">
              <MessageCircle size={17} /> WhatsApp order updates are sent only
              when you opt in under Business details.{" "}
              {DEMO
                ? "Demo mode records notifications as skipped; it never sends a message."
                : ""}
            </p>
            {!data.orders?.length ? (
              <div className="empty-state">
                <Package size={36} />
                <h3>Your first pool starts here.</h3>
                <p>
                  Reserve a slot to see your price, GST and payment milestones.
                </p>
                <button
                  className="button dark"
                  onClick={() => setView("pools")}
                >
                  Find a pool
                </button>
              </div>
            ) : (
              data.orders.map((order) => {
                const pool = data.pools.find((p) => p.id === order.pool_id);
                if (!pool) return null;
                const stage = [
                  "cancelled",
                  "defaulted",
                  "refund_pending",
                  "refunded",
                  "cancellation_requested",
                  "expired",
                ].includes(order.status)
                  ? null
                  : nextStage(order, pool.status);
                return (
                  <article className="order-card" key={order.id}>
                    <div className="order-top">
                      <div>
                        <span className="eyebrow">
                          {pool.code} · {order.id.slice(0, 8).toUpperCase()}
                        </span>
                        <h2>{pool.name}</h2>
                        <p>
                          Slots{" "}
                          {order.slot_numbers.map((n) => `S${n}`).join(", ")} ·
                          100-sheet fixed MR + BWP composition per slot
                        </p>
                      </div>
                      <span className="badge neutral">
                        {statusLabel(order.status)}
                      </span>
                    </div>
                    <div className="order-money">
                      <div>
                        <span>Total incl. GST</span>
                        <strong>{money(order.quote.total, 2)}</strong>
                      </div>
                      <div>
                        <span>Paid</span>
                        <strong>{money(order.paid_amount, 2)}</strong>
                      </div>
                      <div>
                        <span>Outstanding</span>
                        <strong>
                          {money(
                            [
                              "cancelled",
                              "defaulted",
                              "refund_pending",
                              "refunded",
                              "expired",
                              "cancellation_requested",
                            ].includes(order.status)
                              ? 0
                              : order.quote.total - order.paid_amount,
                            2,
                          )}
                        </strong>
                      </div>
                    </div>
                    <Milestones quote={order.quote} paid={order.paid_amount} />
                    {pool.delivery_target && (
                      <p className="order-note">
                        <Truck size={17} /> Target hub delivery:{" "}
                        {new Date(pool.delivery_target).toLocaleDateString(
                          "en-IN",
                          { day: "numeric", month: "long", year: "numeric" },
                        )}
                      </p>
                    )}
                    {(order.payment_due_at || pool.payment_due_at) &&
                      stage &&
                      stage !== "booking" && (
                        <p className="order-note">
                          <Clock3 size={17} /> Payment due:{" "}
                          {new Date(
                            order.payment_due_at || pool.payment_due_at!,
                          ).toLocaleString("en-IN")}
                        </p>
                      )}
                    {pool.qc_report && (
                      <details className="breakdown">
                        <summary>Quality check report</summary>
                        <p className="preserve-lines">{pool.qc_report}</p>
                      </details>
                    )}
                    <details className="breakdown">
                      <summary>View fixed contents, price &amp; GST</summary>
                      <FixedSlotContents />
                      <CustomerPriceSummary pool={pool} quote={order.quote} />
                    </details>
                    <div className="order-actions">
                      {stage && (
                        <button
                          className="button dark"
                          disabled={loading}
                          onClick={() => payStage(order, stage)}
                        >
                          Pay{" "}
                          {stage === "booking"
                            ? "10% booking"
                            : stage === "confirmation"
                              ? "40% confirmation"
                              : "50% dispatch"}{" "}
                          · {money(order.quote.stages[stage], 2)}
                          <ArrowRight size={17} />
                        </button>
                      )}
                      {![
                        "cancelled",
                        "defaulted",
                        "refund_pending",
                        "refunded",
                        "dispatched",
                        "cancellation_requested",
                      ].includes(order.status) && (
                        <button
                          className="text-button"
                          onClick={() => requestCancellation(order)}
                        >
                          Request cancellation
                        </button>
                      )}
                    </div>
                  </article>
                );
              })
            )}
            {!!data.waitlist?.filter((w) => w.user_id === user || DEMO)
              .length && (
              <div className="waitlist-orders">
                <h2>Your waiting lists</h2>
                {data.waitlist
                  ?.filter((w) => w.user_id === user || DEMO)
                  .map((w) => (
                    <div key={w.id} className="progress-pool">
                      {data.pools.find((p) => p.id === w.pool_id)?.code}
                      <span>
                        {w.status}
                        {w.offer_expires_at
                          ? ` · Offer expires ${new Date(w.offer_expires_at).toLocaleString("en-IN")}`
                          : ""}
                      </span>
                      {w.status === "offered" && (
                        <button
                          className="button small dark"
                          onClick={() => setSelected(w.pool_id)}
                        >
                          View offer
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </section>
        )}
        {view === "admin" && data.isAdmin && (
          <AdminPanel
            data={data}
            onDemoChange={demoUpdate}
            onRefresh={refresh}
            onNotice={setNotice}
            onError={notifyError}
          />
        )}
      </main>
      <footer>
        <div className="footer-brand">
          <img src="/plydeck-logo.png" alt="Plydeсk" className="footer-logo" />
        </div>
        <p>Plywood, purchased together.</p>
        <div>
          <button onClick={() => setTerms(true)}>Terms & refunds</button>
          <button onClick={() => setProfileDialog(true)}>
            Business details
          </button>
          <span>© {new Date().getFullYear()} PLYDECK</span>
        </div>
      </footer>
      {cityDialog && (
        <Dialog
          title="Where are you building?"
          onClose={() => setCityDialog(false)}
        >
          <p className="muted">
            Choose your delivery city to see available plywood pools.
          </p>
          <div className="city-grid">
            {cities.map((c) => (
              <button
                key={c}
                className={city === c ? "selected" : ""}
                onClick={() => chooseCity(c)}
              >
                <MapPin size={22} />
                <strong>{c}</strong>
                <span>
                  {c === "Bengaluru"
                    ? "OEM pools available"
                    : "Explore availability"}
                </span>
                {city === c && <Check size={17} />}
              </button>
            ))}
          </div>
          <p className="tiny muted">
            Prices and fulfilment are specific to the selected city hub.
          </p>
        </Dialog>
      )}
      {selectedPool && (
        <SlotDialog
          pool={selectedPool}
          offer={data.waitlist?.find(
            (w) =>
              w.pool_id === selectedPool.id &&
              w.user_id === user &&
              w.status === "offered" &&
              Date.parse(w.offer_expires_at ?? "") > Date.now(),
          )}
          loading={loading}
          loggedIn={!!user}
          onClose={() => setSelected(null)}
          onReserve={reserve}
          onTerms={() => setTerms(true)}
          onWaitlist={() => waitlist(selectedPool)}
        />
      )}
      {auth && (
        <AuthDialog
          onClose={() => setAuth(false)}
          onDemo={() => {
            setUser("demo-buyer");
            setAuth(false);
            setProfileDialog(true);
          }}
          onSignedIn={() => {
            setAuth(false);
            void refresh();
          }}
          onError={notifyError}
        />
      )}
      {profileDialog && (
        <ProfileDialog
          profile={profile}
          loggedIn={!!user}
          onClose={() => setProfileDialog(false)}
          onLogin={() => {
            setProfileDialog(false);
            setAuth(true);
          }}
          onSave={saveProfile}
        />
      )}
      {terms && (
        <Dialog
          title="Payment, delivery & refund terms"
          wide
          onClose={() => setTerms(false)}
        >
          <Terms />
        </Dialog>
      )}
    </>
  );
}

function PoolCard({
  pool,
  onSelect,
  onWaitlist,
  now,
}: {
  pool: Pool;
  onSelect: () => void;
  onWaitlist: () => void;
  now: number;
}) {
  const quote = quoteSlot(pool);
  const booked = pool.allocations?.length ?? 0;
  const available = pool.total_slots - booked;
  const hours = Math.max(
    0,
    Math.ceil((Date.parse(pool.closes_at) - now) / 3600000),
  );
  return (
    <article className="pool-card">
      <div className="pool-card-image">
        <img
          src={pool.image_url || "/plywood-studio.png"}
          alt="Representative layered OEM plywood sheets"
        />
        <span className="badge image-badge">FIXED OEM SLOT</span>
        <span className="pool-image-code">{pool.code}</span>
      </div>
      <div className="pool-card-body">
        <div className="pool-meta">
          <span>
            <MapPin size={14} />
            {pool.city}
          </span>
          <span>
            <Clock3 size={14} />
            {hours}h to close
          </span>
        </div>
        <h3>{pool.name}</h3>
        <p className="pool-spec">
          {pool.config.core} · {pool.config.face} face
        </p>
        <div className="spec-chips">
          <span>MR + BWP grades</span>
          <span>16mm + 6mm</span>
          <span>100 fixed sheets / slot</span>
        </div>
        <div className="pool-price">
          <div>
            <strong>{rupees(quote.rate)}</strong>
            <span>/ sqft + GST</span>
          </div>
          <small>Four-item fixed slot · rate-card pricing</small>
        </div>
        <div className="slot-availability">
          <div>
            <strong>
              {available} of {pool.total_slots} slots available
            </strong>
            <span>{booked} reserved / held</span>
          </div>
          <div
            className="slot-track"
            aria-label={`${booked} of ${pool.total_slots} slots occupied`}
          >
            {Array.from({ length: pool.total_slots }, (_, i) => (
              <span key={i} className={i < booked ? "filled" : ""} />
            ))}
          </div>
        </div>
        <button
          className={`button ${available ? "dark" : "outline"} full`}
          onClick={available ? onSelect : onWaitlist}
        >
          {available ? "View & reserve slot" : "Join waiting list"}
          <ArrowUpRight size={18} />
        </button>
        <p className="booking-caption">
          <LockKeyhole size={13} />
          {available ? (
            <>
              Reserve from <strong>{money(quote.stages.booking, 2)}</strong> ·
              10% today
            </>
          ) : (
            <>No payment required · {pool.waitlist_count ?? 0} waiting</>
          )}
        </p>
      </div>
    </article>
  );
}
function FixedSlotContents() {
  return (
    <div className="fixed-slot-grid">
      {FIXED_SLOT_ITEMS.map((item) => (
        <div className="fixed-slot-item" key={item.rateKey}>
          <span>{item.name}</span>
          <strong>
            {item.thickness}mm · {item.size}
          </strong>
          <b>{item.quantity} sheets</b>
        </div>
      ))}
    </div>
  );
}
function CustomerPriceSummary({
  pool,
  quote,
}: {
  pool: Pool;
  quote: ReturnType<typeof quoteSlot>;
}) {
  const c = pool.config;
  return (
    <div className="cost-lines">
      {FIXED_SLOT_ITEMS.map((item, index) => (
        <div key={item.rateKey}>
          <span>
            {item.name} · {item.thickness}mm
            <small>{quote.lines[index].basis}</small>
          </span>
          <strong>{money(quote.lines[index].amount, 2)}</strong>
        </div>
      ))}
      <div className="cost-subtotal">
        <span>Taxable order value</span>
        <strong>{money(quote.subtotal, 2)}</strong>
      </div>
      <div>
        <span>GST ({c.gst_percent}%)</span>
        <strong>{money(quote.gst, 2)}</strong>
      </div>
      <div className="cost-total">
        <span>Order total</span>
        <strong>{money(quote.total, 2)}</strong>
      </div>
    </div>
  );
}
function Milestones({
  quote,
  paid = 0,
}: {
  quote: ReturnType<typeof quoteSlot>;
  paid?: number;
}) {
  let cumulative = 0;
  return (
    <div className="milestones">
      {(["booking", "confirmation", "dispatch"] as Stage[]).map((stage, i) => {
        cumulative += quote.stages[stage];
        const completed = paid >= cumulative;
        return (
          <div key={stage} className={completed ? "complete" : ""}>
            <span className="milestone-number">
              {completed ? <Check size={15} /> : i + 1}
            </span>
            <strong>
              {[10, 40, 50][i]}% ·{" "}
              {["Book your slot", "Pool confirmation", "After QC"][i]}
            </strong>
            <b>{money(quote.stages[stage], 2)}</b>
            <small>
              {completed
                ? "Payment received"
                : [
                    "Reserve today",
                    "Due on confirmation notice",
                    "Before dispatch",
                  ][i]}
            </small>
          </div>
        );
      })}
    </div>
  );
}

function SlotDialog({
  pool,
  offer,
  loading,
  loggedIn,
  onClose,
  onReserve,
  onTerms,
  onWaitlist,
}: {
  pool: Pool;
  offer?: NonNullable<StoreData["waitlist"]>[number];
  loading: boolean;
  loggedIn: boolean;
  onClose: () => void;
  onReserve: (p: Pool, n: number[]) => void;
  onTerms: () => void;
  onWaitlist: () => void;
}) {
  const replacement = pool.status === "qc_ready" && !!offer;
  const [slots, setSlots] = useState<number[]>(
      offer?.offered_slot ? [offer.offered_slot] : [],
    ),
    [accepted, setAccepted] = useState(false);
  const c = pool.config,
    quote = quoteSlot(pool, Math.max(1, slots.length)),
    closed =
      !replacement &&
      (pool.status !== "live" || Date.parse(pool.closes_at) <= Date.now());
  return (
    <Dialog title={`${pool.code} · Fixed slot details`} wide onClose={onClose}>
      <div className="configure-grid">
        <div className="configure-main">
          <span className="eyebrow">
            {pool.city.toUpperCase()} · FIXED OEM SLOT
          </span>
          <h2>{pool.name}</h2>
          {replacement && (
            <p className="info-box">
              Waiting-list replacement: this released slot keeps the same fixed
              plywood composition because QC is complete. Review the QC report
              before payment. All three instalments must clear before dispatch.
            </p>
          )}
          <p className="muted">
            {c.core} · {c.face} face · 8 × 4 ft sheets
          </p>
          <div className="config-block">
            <h3>01 / Choose your slots</h3>
            <p className="muted">
              Every slot contains the same fixed 100-sheet plywood composition
              shown below.
            </p>
            <div className="slot-picker">
              {Array.from({ length: pool.total_slots }, (_, i) => {
                const n = i + 1,
                  taken = pool.allocations?.some((a) => a.slot_no === n);
                return (
                  <button
                    key={n}
                    disabled={
                      taken ||
                      closed ||
                      (replacement && n !== offer?.offered_slot)
                    }
                    className={`${slots.includes(n) ? "selected" : ""} ${taken ? "taken" : ""}`}
                    onClick={() =>
                      setSlots(
                        slots.includes(n)
                          ? slots.filter((s) => s !== n)
                          : [...slots, n].sort((a, b) => a - b),
                      )
                    }
                  >
                    <Layers3 size={22} />
                    <strong>Slot {String(n).padStart(2, "0")}</strong>
                    <span>
                      {taken
                        ? "Reserved / held"
                        : slots.includes(n)
                          ? "Selected"
                          : "Available"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="config-block">
            <h3>02 / Fixed plywood in each slot</h3>
            <p className="muted">
              The grade, thickness, size and quantity are locked for every
              buyer.
            </p>
            <FixedSlotContents />
            <p className="tiny muted">
              100 sheets per slot · 3,200 sqft · fixed composition locked at
              booking.
            </p>
          </div>
          <details className="breakdown">
            <summary>Material & delivery details</summary>
            <dl className="material-details">
              <dt>Core</dt>
              <dd>{c.core}</dd>
              <dt>Face</dt>
              <dd>{c.face}</dd>
              <dt>Bond grade</dt>
              <dd>{c.bond}</dd>
              <dt>Tolerance</dt>
              <dd>{c.tolerance}</dd>
            </dl>
            <p>{c.specification}</p>
            <p>
              Target: city hub delivery within a week after final pool
              confirmation. QC and cleared final payment are required before
              dispatch. Local delivery is separately quoted.
            </p>
          </details>
          <div className="config-block">
            <h3>03 / Know your payment milestones</h3>
            <Milestones quote={quote} />
          </div>
          <button className="text-button" onClick={onWaitlist}>
            Prefer to wait? Join this pool’s waiting list{" "}
            <ArrowRight size={15} />
          </button>
        </div>
        <aside className="quote-panel">
          <div className="quote-heading">
            <span>YOUR ORDER ESTIMATE</span>
            <h3>
              {slots.length || 1} slot{slots.length > 1 ? "s" : ""} ·{" "}
              {quote.sheets} sheets
            </h3>
            <p>
              {quote.area.toLocaleString("en-IN")} sqft · {rupees(quote.rate)}
              /sqft + GST
            </p>
            {!slots.length && (
              <small>
                Select a slot to reserve. Estimate shown for one slot.
              </small>
            )}
          </div>
          <CustomerPriceSummary pool={pool} quote={quote} />
          <div className="pay-today">
            <span>Pay 10% to reserve</span>
            <strong>{money(quote.stages.booking, 2)}</strong>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            <span>
              I accept the{" "}
              <button className="inline-link" onClick={onTerms}>
                payment and refund terms
              </button>
              , including the commitment conditions after 50% payment and pool
              confirmation.
            </span>
          </label>
          <button
            className="button lime full"
            disabled={!slots.length || !accepted || loading || closed}
            onClick={() => onReserve(pool, slots)}
          >
            {loading ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <LockKeyhole size={17} />
            )}{" "}
            {closed
              ? "Pool closed"
              : loggedIn
                ? DEMO
                  ? "Reserve in demo"
                  : "Pay 10% & reserve"
                : "Log in to reserve"}
          </button>
          <p className="tiny muted centered">
            {DEMO
              ? "Demo simulation. No payment will be collected."
              : "Secure checkout by Razorpay. GST invoice details required."}
          </p>
        </aside>
      </div>
    </Dialog>
  );
}

function AuthDialog({
  onClose,
  onDemo,
  onSignedIn,
  onError,
}: {
  onClose: () => void;
  onDemo: () => void;
  onSignedIn: () => void;
  onError: (e: unknown) => void;
}) {
  const [register, setRegister] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const db = browserDb();
      const result = register
        ? await db.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: process.env.NEXT_PUBLIC_APP_URL },
          })
        : await db.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (result.data.session) onSignedIn();
      else
        setMessage(
          "Check your email to confirm your account, then return here to log in.",
        );
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={register ? "Create your business account" : "Welcome to PLYDECK"}
      onClose={onClose}
    >
      <p className="muted">
        Keep your pool reservations, payments and business details in one place.
      </p>
      {DEMO ? (
        <div className="demo-login">
          <Layers3 size={40} />
          <h3>Try the complete booking flow</h3>
          <p>
            This preview uses a local demo account. Please use sample business
            details.
          </p>
          <button className="button dark full" onClick={onDemo}>
            Continue as demo buyer <ArrowRight size={17} />
          </button>
        </div>
      ) : (
        <form className="form-stack" onSubmit={submit}>
          <label>
            Email address
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              minLength={8}
              autoComplete={register ? "new-password" : "current-password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {message && <p role="status">{message}</p>}
          <button className="button dark full" disabled={busy}>
            {busy ? "Please wait…" : register ? "Create account" : "Log in"}
            <ArrowRight size={17} />
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => setRegister(!register)}
          >
            {register
              ? "Already registered? Log in"
              : "New to PLYDECK? Create an account"}
          </button>
          <button
            type="button"
            className="text-button"
            onClick={async () => {
              if (!email) {
                setMessage("Enter your email address first.");
                return;
              }
              const { error } = await browserDb().auth.resetPasswordForEmail(
                email,
                {
                  redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
                },
              );
              setMessage(error ? error.message : "Password reset email sent.");
            }}
          >
            Forgot password?
          </button>
        </form>
      )}
    </Dialog>
  );
}
function ProfileDialog({
  profile,
  loggedIn,
  onClose,
  onLogin,
  onSave,
}: {
  profile: Profile;
  loggedIn: boolean;
  onClose: () => void;
  onLogin: () => void;
  onSave: (p: Profile) => void;
}) {
  const [draft, setDraft] = useState(profile),
    [busy, setBusy] = useState(false);
  function field(
    key: keyof Profile,
    label: string,
    props: Record<string, unknown> = {},
  ) {
    return (
      <label key={key}>
        {label}
        <input
          required
          value={String(draft[key] ?? "")}
          onChange={(e) =>
            setDraft({
              ...draft,
              [key]:
                key === "gstin" ? e.target.value.toUpperCase() : e.target.value,
            })
          }
          {...props}
        />
      </label>
    );
  }
  return (
    <Dialog title="Your business & billing details" onClose={onClose}>
      {!loggedIn ? (
        <>
          <p>Please log in to manage your business details.</p>
          <button className="button dark" onClick={onLogin}>
            Log in
          </button>
        </>
      ) : (
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await onSave(draft);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="muted">
            Used for GST invoicing and order fulfilment.{" "}
            {DEMO ? "Use sample details in this demo." : ""}
          </p>
          {field("business_name", "Registered business name")}
          {field("contact_name", "Contact person")}
          {field("phone", "Mobile number", {
            type: "tel",
            pattern: "[6-9][0-9]{9}",
            maxLength: 10,
          })}
          {field("gstin", "GSTIN", {
            pattern: "[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]",
            maxLength: 15,
            minLength: 15,
          })}
          {field("address", "Billing address")}
          <div className="form-grid">
            {field("city", "City")}
            {field("state", "State")}
            {field("pincode", "PIN code", {
              pattern: "[1-9][0-9]{5}",
              maxLength: 6,
            })}
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={!!draft.whatsapp_opt_in}
              onChange={(e) =>
                setDraft({ ...draft, whatsapp_opt_in: e.target.checked })
              }
            />
            <span>
              <MessageCircle size={15} /> Send order updates on WhatsApp
              (optional). I consent to transactional notifications on this
              number.
            </span>
          </label>
          <button className="button dark full" disabled={busy}>
            {busy ? "Saving…" : "Save business details"}
            <Check size={17} />
          </button>
        </form>
      )}
    </Dialog>
  );
}
