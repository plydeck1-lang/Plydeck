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
import type { Pool, StoreData, Profile, Order } from "@/lib/types";
import { demoSeed } from "@/lib/seed";
import {
  quoteSlot,
  money,
  rupees,
  TERMS_VERSION,
  FIXED_SLOT_ITEMS,
} from "@/lib/pricing";
import { api, browserDb, DEMO } from "@/lib/supabase";
import { Dialog } from "./dialog";
import { Terms } from "./terms";
import { AdminPanel } from "./admin-panel";
import {
  MarketingSections,
  MaterialCategoryShowcase,
} from "./marketing-sections";
import { SiteFooter } from "./site-footer";

const cities = ["Bengaluru", "Hyderabad"];
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
    confirming: "Pool confirmation in progress",
    confirmed: "Pool confirmed",
    qc_ready: "QC complete",
    dispatched: "Dispatched",
    cancelled: "Cancelled",
    draft: "Draft",
  })[status] ?? status.replaceAll("_", " ");
const displayCity = (value: string) => value === "Bengaluru" ? "Bangalore" : value;
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
        margin_rate: 0,
        rounding_rate: 0,
        gst_percent: 0,
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
            "Open a plywood pool configurator in the chosen city. This does not reserve a slot until the buyer confirms.",
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
      setNotice("You are on the waiting list.");
    } catch (e) {
      notifyError(e);
    }
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
              !["cancelled", "expired"].includes(o.status),
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
          paid_amount: 0,
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
          },
        );
      } else {
        await api<{ reserved: true }>("reservations", {
          pool_id: pool.id,
          slot_numbers: slots,
          expected_total: quote.total,
          terms_version: TERMS_VERSION,
        });
        await refresh();
      }
      setSelected(null);
      setView("orders");
      setNotice("Reservation confirmed. Your selected slots are now locked.");
    } catch (e) {
      notifyError(e);
      if (!DEMO) await refresh();
    } finally {
      setLoading(false);
    }
  }
  async function requestCancellation(order: Order) {
    if (
      !window.confirm(
        "Request cancellation of this slot reservation?",
      )
    )
      return;
    try {
      if (DEMO) {
        const p = data.pools.find((p) => p.id === order.pool_id);
        const releasable = p?.status === "live" || p?.status === "confirming";
        setData((d) => ({
          ...d,
          orders: d.orders?.map((o) =>
            o.id === order.id
              ? {
                  ...o,
                  status: releasable ? "cancelled" : "cancellation_requested",
                }
              : o,
          ),
          pools: releasable
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
        }));
      } else {
        await api("orders/cancel", { order_id: order.id });
        await refresh();
      }
      setNotice("Cancellation request recorded.");
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
  function goToHomeSection(id: string) {
    setView("pools");
    window.setTimeout(
      () => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }),
      0,
    );
  }
  return (
    <>
      {DEMO && (
        <div className="demo-bar">
          <span>DEMO PREVIEW · Sample prices and direct slot reservations.</span>
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
      <div className="brand-announcement">
        <span>BUY BETTER. GROW BETTER.</span>
        <b>Currently serving Bangalore &amp; Hyderabad</b>
        <button type="button" onClick={() => goToHomeSection("live-pools")}>View live pools <ArrowRight size={13} /></button>
      </div>
      <header className="header">
        <button
          className="brand"
          onClick={() => setView("pools")}
          aria-label="PLYDECK home"
        >
          <span className="brand-logo-frame">
            <img src="/plydeck-logo-transparent.png" alt="PLYDECK — Buy better. Grow better." className="brand-logo" />
          </span>
        </button>
        <button className="city-button" onClick={() => setCityDialog(true)}>
          <MapPin size={17} />
          <span>{city ? displayCity(city) : "Choose your city"}</span>
          <ChevronDown size={14} />
        </button>
        <nav aria-label="Main navigation">
          <button
            className={view === "pools" ? "active" : ""}
            onClick={() => goToHomeSection("live-pools")}
          >
            Live pools
          </button>
          <button onClick={() => goToHomeSection("why-plydeck")}>Why PLYDECK</button>
          <button
            className={view === "categories" ? "active" : ""}
            onClick={() => setView("categories")}
          >
            Plywood
          </button>
          <button onClick={() => goToHomeSection("faq")}>FAQs</button>
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
                  <span className="short-rule" /> B2B PLYWOOD, AGGREGATED BY
                  CITY
                </div>
                <h1>
                  Factory-scale plywood rates.
                  <br />
                  <span>One slot at a time.</span>
                </h1>
                <p>
                  PLYDECK combines verified business demand into shared
                  truckloads—giving contractors and retailers a clearer route
                  from factory supply to city fulfilment.
                </p>
                <div className="hero-actions">
                  <a href="#live-pools" className="button copper">
                    Explore {city ? displayCity(city) : "city"} pools <ArrowRight size={18} />
                  </a>
                  <button className="button ghost" type="button" onClick={() => goToHomeSection("how-it-works")}>
                    How pooling works
                  </button>
                </div>
                <div className="hero-proof">
                  <span>
                    <ShieldCheck size={16} /> QC before dispatch
                  </span>
                  <span>
                    <Layers3 size={16} /> Direct slot booking
                  </span>
                  <span>
                    <Truck size={16} /> Shared truckload
                  </span>
                </div>
              </div>
              <div className="hero-image">
                <img
                  src="/plywood-factory-stock.png"
                  alt="Finished plywood stock stacked for dispatch inside an OEM production factory"
                />
                <div className="image-tag">
                  <span>FACTORY STOCK. SHARED DEMAND.</span>
                  <small>Currently serving Bangalore &amp; Hyderabad.</small>
                </div>
                <div className="hero-stat hero-stat-top"><strong>100</strong><span>fixed sheets<br />per OEM slot</span></div>
                <div className="hero-stat hero-stat-bottom"><strong>1 click</strong><span>to confirm<br />and lock a slot</span></div>
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
                  Confirm reservation<strong>Lock your selected slots</strong>
                </p>
              </div>
              <div>
                <span>04</span>
                <p>
                  Quality checked<strong>Track through dispatch</strong>
                </p>
              </div>
            </div>
            <MaterialCategoryShowcase
              onBrowsePlywood={(categoryName) => {
                const matchingCategory = data.categories.find(
                  (item) =>
                    item.active &&
                    item.name.trim().toLowerCase() ===
                      categoryName.trim().toLowerCase(),
                );
                setCategory(matchingCategory?.id ?? "all");
                goToHomeSection("live-pools");
              }}
            />
            <section className="pool-section" id="live-pools">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">BUY BETTER, TOGETHER</div>
                  <h2>
                    Live pools in <span>{city ? displayCity(city) : "your city"}</span>
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
                  <h3>No open pools {city ? `in ${displayCity(city)}` : "yet"}</h3>
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
                      categoryName={
                        data.categories.find((item) => item.id === pool.category_id)
                          ?.name ?? "Plywood"
                      }
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
                  See every final rate and the complete slot value before you
                  confirm and lock a slot.
                </p>
              </div>
              <button className="text-button" onClick={() => setTerms(true)}>
                Booking and cancellation terms <ArrowUpRight size={18} />
              </button>
            </section>
            <MarketingSections
              city={city ? displayCity(city) : city}
              onBrowse={() => goToHomeSection("live-pools")}
              onLogin={() => setAuth(true)}
            />
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
                  Reserve a slot to see its fixed contents and final price.
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
                        <span>Order total</span>
                        <strong>{money(order.quote.total, 2)}</strong>
                      </div>
                      <div>
                        <span>Reserved slots</span>
                        <strong>{order.slot_numbers.length}</strong>
                      </div>
                      <div>
                        <span>Payment confirmed</span>
                        <strong>{money(order.paid_amount, 2)}</strong>
                      </div>
                      <div>
                        <span>Balance</span>
                        <strong>{money(Math.max(0, order.quote.total - order.paid_amount), 2)}</strong>
                      </div>
                    </div>
                    <p className="tiny muted">Payments are confirmed manually by PLYDECK operations after offline receipt verification.</p>
                    {pool.delivery_target && (
                      <p className="order-note">
                        <Truck size={17} /> Target hub delivery:{" "}
                        {new Date(pool.delivery_target).toLocaleDateString(
                          "en-IN",
                          { day: "numeric", month: "long", year: "numeric" },
                        )}
                      </p>
                    )}
                    {pool.qc_report && (
                      <details className="breakdown">
                        <summary>Quality check report</summary>
                        <p className="preserve-lines">{pool.qc_report}</p>
                      </details>
                    )}
                    <details className="breakdown">
                      <summary>View fixed contents &amp; price</summary>
                      <FixedSlotContents pool={pool} />
                      <CustomerPriceSummary quote={order.quote} />
                    </details>
                    <div className="order-actions">
                      {![
                        "cancelled",
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
      <SiteFooter />
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
                <strong>{displayCity(c)}</strong>
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
          title="Booking, delivery & cancellation terms"
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
  categoryName,
  onSelect,
  onWaitlist,
  now,
}: {
  pool: Pool;
  categoryName: string;
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
      <div className="pool-card-body">
        <div className="pool-card-topline">
          <span className="badge pool-category-badge">{categoryName}</span>
          <span className="pool-code">{pool.code}</span>
        </div>
        <div className="pool-meta">
          <span>
            <MapPin size={14} />
            {displayCity(pool.city)}
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
            <span>/ sqft</span>
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
            <>Confirm directly · selected slots lock immediately</>
          ) : (
            <>{pool.waitlist_count ?? 0} buyers waiting</>
          )}
        </p>
      </div>
    </article>
  );
}
function FixedSlotContents({ pool }: { pool: Pool }) {
  return (
    <div className="fixed-slot-grid">
      {FIXED_SLOT_ITEMS.map((item) => (
        <div className="fixed-slot-item" key={item.rateKey}>
          <span>{item.name}</span>
          <strong>
            {item.thickness}mm · {item.size}
          </strong>
          <b>{item.quantity} sheets</b>
          <small className="fixed-slot-rate">
            Final rate per sft · {rupees(pool.config.rate_card[item.rateKey])}/sft
          </small>
        </div>
      ))}
    </div>
  );
}
function CustomerPriceSummary({ quote }: { quote: ReturnType<typeof quoteSlot> }) {
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
      <div className="cost-total">
        <span>Order total</span>
        <strong>{money(quote.total, 2)}</strong>
      </div>
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
            {displayCity(pool.city).toUpperCase()} · FIXED OEM SLOT
          </span>
          <h2>{pool.name}</h2>
          {replacement && (
            <p className="info-box">
              Waiting-list replacement: this released slot keeps the same fixed
              plywood composition because QC is complete. Review the QC report
              before confirming the replacement slot.
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
            <FixedSlotContents pool={pool} />
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
              Target: city hub delivery within a week after pool confirmation.
              QC is recorded before dispatch. Local delivery is separately
              quoted.
            </p>
          </details>
          <div className="config-block">
            <h3>03 / Confirm and lock</h3>
            <p className="muted">
              Confirming creates your order immediately and locks the selected
              slots. No online payment or payment gateway is used.
            </p>
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
              /sqft
            </p>
            {!slots.length && (
              <small>
                Select a slot to reserve. Estimate shown for one slot.
              </small>
            )}
          </div>
          <CustomerPriceSummary quote={quote} />
          <div className="pay-today reservation-lock-summary">
            <span>Booking method</span>
            <strong>Direct confirmation</strong>
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
                booking and cancellation terms
              </button>
              . I understand that confirming immediately locks the selected
              slots against my business account.
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
                  ? "Confirm demo reservation"
                  : "Confirm & lock slots"
                : "Log in to reserve"}
          </button>
          <p className="tiny muted centered">
            No online payment is collected. Verified business and billing
            details are required for the reservation record.
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
        Keep your pool reservations and business details in one place.
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
            Used for business invoicing and order fulfilment.{" "}
            {DEMO ? "Use sample details in this demo." : ""}
          </p>
          {field("business_name", "Registered business name")}
          {field("contact_name", "Contact person")}
          {field("phone", "Mobile number", {
            type: "tel",
            pattern: "[6-9][0-9]{9}",
            maxLength: 10,
          })}
          {field("gstin", "Business tax ID", {
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
