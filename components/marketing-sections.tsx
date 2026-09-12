"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeIndianRupee,
  BarChart3,
  Boxes,
  Building2,
  Check,
  ClipboardCheck,
  Factory,
  Handshake,
  Layers3,
  MapPinned,
  PackageCheck,
  ShieldCheck,
  Truck,
  Warehouse,
} from "lucide-react";

const materialCategories = [
  { name: "OEM Grade Hardwood Calibrated Okoume Face", note: "Live pools", icon: Layers3, live: true },
  { name: "OEM Grade Hardwood Calibrated Recon Face", note: "Live pools", icon: Factory, live: true },
  { name: "Alternate ISI Gurjan Face", note: "Live pools", icon: ShieldCheck, live: true },
  { name: "Full Red Core Plywood", note: "Live pools", icon: Boxes, live: true },
  { name: "Semi-Calibrated Hardwood Okoume Face", note: "Live pools", icon: PackageCheck, live: true },
  { name: "Neem & Eucalyptus Plywood", note: "Live pools", icon: Warehouse, live: true },
  { name: "PF 710 Plywood", note: "Live pools", icon: ClipboardCheck, live: true },
];

const audiences = [
  {
    kicker: "FOR INTERIOR CONTRACTORS & RETAILERS",
    title: "Buy closer to factory economics without carrying a full truck alone.",
    copy: "Reserve a standard slot, see the material rate and GST before payment, and follow one order from booking to QC and dispatch.",
    icon: Building2,
    points: [
      "Lower sourcing friction through aggregated city demand",
      "Predictable fixed 100-sheet slot for project and stock planning",
      "10/40/50 milestone payments instead of an opaque full advance",
      "QC evidence and WhatsApp order updates before dispatch",
    ],
    metric: "10%",
    metricLabel: "to reserve an available slot",
  },
  {
    kicker: "FOR OEM PLYWOOD FACTORIES",
    title: "Convert fragmented enquiries into production-ready truckload demand.",
    copy: "PLYDECK standardises the buying unit, consolidates orders by city and gives factories a clearer demand signal before production and dispatch.",
    icon: Factory,
    points: [
      "Fewer small negotiations and clearer batch specifications",
      "Aggregated orders aligned to vehicle payload and destination",
      "Structured payment checkpoints before production and dispatch",
      "Repeat demand data by grade, thickness, city and pool velocity",
    ],
    metric: "1 load",
    metricLabel: "built from multiple verified buyers",
  },
];

const faqs = [
  {
    q: "What is a PLYDECK buying pool?",
    a: "A buying pool combines verified B2B demand from multiple buyers into a shared city-bound shipment. Each buyer reserves one or more published slots and receives an individual order, invoice and payment schedule.",
  },
  {
    q: "What is included in one OEM plywood slot?",
    a: "The current OEM slot contains 100 sheets: 50 MR 16mm, 20 BWP 16mm, 15 MR 6mm and 15 BWP 6mm, all in 8 × 4 ft size. The published composition is fixed for every buyer in that pool.",
  },
  {
    q: "How do the 10%, 40% and 50% payments work?",
    a: "You pay 10% to reserve. A further 40% is due when the pool fills and moves to supplier confirmation. The final 50% is due after the QC report is released and before dispatch.",
  },
  {
    q: "Are rates the same in every city?",
    a: "No. Pools are city-specific because factory origin, truck utilisation, handling and fulfilment conditions can differ. Always rely on the rate and total displayed inside the selected pool.",
  },
  {
    q: "How is quality checked?",
    a: "The confirmed product specification governs the supply. PLYDECK records the batch QC result before requesting the final payment. Buyers should also record visible shortages or transit damage at collection or delivery.",
  },
  {
    q: "What happens if a pool does not fill?",
    a: "PLYDECK may extend or cancel an underfilled pool. If PLYDECK cancels before fulfilment, collected amounts for the undelivered order are refundable under the published refund policy.",
  },
  {
    q: "Can I change the sheet mix in a slot?",
    a: "Not in the current OEM pool. Fixed composition keeps production, payload, costing and QC consistent across buyers. New compositions can be opened as separate pools when enough demand exists.",
  },
  {
    q: "Do I need a GST-registered business account?",
    a: "Yes. Slot booking is designed for retailers, contractors and other business buyers. Business, GST and billing details must be completed before a paid reservation.",
  },
];

const factoryLocations = [
  {
    name: "Kerala",
    title: "Kerala plywood manufacturing cluster",
    copy: "OEM plywood sourcing, batch planning and quality coordination from established manufacturing belts in Kerala.",
    focus: "Plywood · Core panels · OEM production",
  },
  {
    name: "Mangalore",
    title: "Mangalore coastal supply cluster",
    copy: "A strategic coastal Karnataka sourcing point for southern-market plywood and panel movement.",
    focus: "Plywood · Panels · South India routes",
  },
  {
    name: "Tamil Nadu",
    title: "Tamil Nadu manufacturing network",
    copy: "A developing supplier network for plywood, engineered boards and future category-specific pools.",
    focus: "Plywood · Engineered boards · Future pools",
  },
  {
    name: "More clusters",
    title: "Supplier network expansion",
    copy: "Additional factory clusters are added only after product, capacity, commercial and fulfilment checks.",
    focus: "Supplier audit · Demand validation · Route fit",
  },
];

export function MaterialCategoryShowcase({
  onBrowsePlywood,
}: {
  onBrowsePlywood: () => void;
}) {
  return (
    <section className="material-showcase" id="materials">
      <div className="marketing-heading">
        <div>
          <span className="brand-kicker">PLYWOOD CATEGORIES, ORGANISED FOR B2B</span>
          <h2>Choose the plywood category your business needs.</h2>
        </div>
        <p>
          Browse category-led live pools with published specifications, fixed
          buying slots and city-based fulfilment.
        </p>
      </div>
      <div className="material-rail" aria-label="PLYDECK material categories">
        {materialCategories.map(({ name, note, icon: Icon, live }) => (
          <button
            type="button"
            className={`material-tile ${live ? "is-live" : ""}`}
            key={name}
            onClick={live ? onBrowsePlywood : undefined}
            aria-disabled={!live}
          >
            <span className="material-icon"><Icon size={24} /></span>
            <strong>{name}</strong>
            <small>{note}</small>
            {live && <ArrowRight size={17} />}
          </button>
        ))}
      </div>
    </section>
  );
}

export function MarketingSections({
  city,
  onBrowse,
  onLogin,
}: {
  city: string;
  onBrowse: () => void;
  onLogin: () => void;
}) {
  const [audience, setAudience] = useState(0);
  const [factoryLocation, setFactoryLocation] = useState(0);
  const slide = audiences[audience];
  const SlideIcon = slide.icon;
  const location = factoryLocations[factoryLocation];

  return (
    <>
      <section className="moat-section" id="why-plydeck">
        <div className="moat-intro">
          <span className="brand-kicker brand-kicker-light">THE PLYDECK ADVANTAGE</span>
          <h2>Not another catalogue. A demand-to-dispatch system.</h2>
          <p>
            PLYDECK coordinates the commercial pieces that ordinary material
            listings leave fragmented—from a standard buying unit to truckload
            utilisation, payment discipline and QC-led release.
          </p>
        </div>
        <div className="moat-grid">
          <article>
            <span>01</span><Layers3 size={25} />
            <h3>Aggregated demand</h3>
            <p>City demand is combined into a commercially meaningful factory order.</p>
          </article>
          <article>
            <span>02</span><Truck size={25} />
            <h3>Payload-led pools</h3>
            <p>Every slot is planned against sheets, weight, vehicle capacity and route.</p>
          </article>
          <article>
            <span>03</span><ShieldCheck size={25} />
            <h3>Controlled fulfilment</h3>
            <p>Milestone payments, locked specifications and QC reduce avoidable surprises.</p>
          </article>
          <article>
            <span>04</span><BarChart3 size={25} />
            <h3>Demand intelligence</h3>
            <p>Pool velocity reveals what grades, thicknesses and cities should open next.</p>
          </article>
        </div>
      </section>

      <section className="audience-section" id="for-business">
        <div className="marketing-heading">
          <div>
            <span className="brand-kicker">ONE PLATFORM, TWO-SIDED VALUE</span>
            <h2>Better buying for contractors. Better demand for factories.</h2>
          </div>
          <div className="carousel-controls" aria-label="Choose audience slide">
            <button
              type="button"
              onClick={() => setAudience((audience + audiences.length - 1) % audiences.length)}
              aria-label="Previous audience"
            ><ArrowLeft size={18} /></button>
            <span>{String(audience + 1).padStart(2, "0")} / {String(audiences.length).padStart(2, "0")}</span>
            <button
              type="button"
              onClick={() => setAudience((audience + 1) % audiences.length)}
              aria-label="Next audience"
            ><ArrowRight size={18} /></button>
          </div>
        </div>
        <div className="audience-card" aria-live="polite">
          <div className="audience-copy">
            <span className="audience-icon"><SlideIcon size={30} /></span>
            <span className="brand-kicker">{slide.kicker}</span>
            <h3>{slide.title}</h3>
            <p>{slide.copy}</p>
            <div className="audience-dots" role="tablist" aria-label="Audience slides">
              {audiences.map((item, index) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={index === audience}
                  aria-label={item.kicker}
                  className={index === audience ? "active" : ""}
                  key={item.kicker}
                  onClick={() => setAudience(index)}
                />
              ))}
            </div>
          </div>
          <div className="audience-points">
            {slide.points.map((point) => (
              <div key={point}><Check size={18} /><span>{point}</span></div>
            ))}
            <div className="audience-metric">
              <strong>{slide.metric}</strong>
              <span>{slide.metricLabel}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="factory-network" id="factory-network">
        <div className="marketing-heading">
          <div>
            <span className="brand-kicker">FACTORY SOURCING NETWORK</span>
            <h2>Production clusters across South India.</h2>
          </div>
          <p>
            PLYDECK aggregates demand in the markets we serve and coordinates
            supply from the most suitable audited manufacturing cluster.
          </p>
        </div>
        <div className="factory-location-tabs" role="tablist" aria-label="Factory sourcing locations">
          {factoryLocations.map((item, index) => (
            <button
              type="button"
              role="tab"
              aria-selected={index === factoryLocation}
              className={index === factoryLocation ? "active" : ""}
              onClick={() => setFactoryLocation(index)}
              key={item.name}
            >{item.name}</button>
          ))}
        </div>
        <div className="factory-location-card" aria-live="polite">
          <div className="factory-location-map"><MapPinned size={38} /><span>OEM<br />SOURCE</span></div>
          <div>
            <span className="brand-kicker">{location.name.toUpperCase()}</span>
            <h3>{location.title}</h3>
            <p>{location.copy}</p>
            <small>{location.focus}</small>
          </div>
          <div className="served-markets">
            <span>CURRENTLY SERVING</span>
            <strong>Bangalore</strong>
            <strong>Hyderabad</strong>
          </div>
        </div>
        <p className="factory-disclaimer">Factory sourcing locations are supply clusters, not retail outlets. Pool availability depends on product specification, supplier approval, payload and verified buyer demand.</p>
      </section>

      <section className="process-section" id="how-it-works">
        <div className="marketing-heading centered-heading">
          <div>
            <span className="brand-kicker">FROM DEMAND TO DISPATCH</span>
            <h2>A buying process your team can actually follow.</h2>
          </div>
        </div>
        <div className="process-grid">
          <article><span>01</span><BadgeIndianRupee size={24} /><h3>Review the pool</h3><p>Check the fixed slot, rate per sft, GST, closing time and city.</p></article>
          <article><span>02</span><Handshake size={24} /><h3>Reserve with 10%</h3><p>Log in with GST details, select available slots and complete payment.</p></article>
          <article><span>03</span><Factory size={24} /><h3>Confirm at 40%</h3><p>When the pool fills, the shared order moves to supplier commitment.</p></article>
          <article><span>04</span><ClipboardCheck size={24} /><h3>QC and dispatch</h3><p>Review the QC update, pay the final 50% and receive dispatch status.</p></article>
        </div>
      </section>

      <section className="faq-section" id="faq">
        <div className="faq-heading">
          <span className="brand-kicker">FREQUENTLY ASKED QUESTIONS</span>
          <h2>Everything to know before you reserve.</h2>
          <p>Clear answers for business buyers joining a PLYDECK pool.</p>
        </div>
        <div className="faq-list">
          {faqs.map((faq, index) => (
            <details key={faq.q} open={index === 0}>
              <summary><span>{String(index + 1).padStart(2, "0")}</span>{faq.q}<b>+</b></summary>
              <p>{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="home-cta">
        <div>
          <span className="brand-kicker brand-kicker-light">BUY BETTER. GROW BETTER.</span>
          <h2>Ready to join the next {city || "city"} truckload?</h2>
          <p>See live slots first. Create your business account only when you are ready to reserve.</p>
        </div>
        <div className="home-cta-actions">
          <button type="button" className="button copper" onClick={onBrowse}>Browse live pools <ArrowRight size={18} /></button>
          <button type="button" className="button light-outline" onClick={onLogin}>Business login</button>
        </div>
      </section>
    </>
  );
}
