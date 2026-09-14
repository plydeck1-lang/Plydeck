import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-grid">
        <div className="site-footer-brand">
          <div className="footer-logo-frame">
            <img src="/plydeck-logo-transparent.png" alt="PLYDECK — Buy better. Grow better." />
          </div>
          <p>
            A city-based B2B demand aggregation platform for plywood and
            interior materials.
          </p>
          <span><MapPin size={15} /> Currently serving Bangalore &amp; Hyderabad</span>
        </div>
        <div>
          <h3>Platform</h3>
          <Link href="/#live-pools">Live pools</Link>
          <Link href="/#materials">Material categories</Link>
          <Link href="/#factory-network">Factory network</Link>
          <Link href="/#how-it-works">How it works</Link>
          <Link href="/#faq">FAQs</Link>
        </div>
        <div>
          <h3>Company</h3>
          <Link href="/about">About PLYDECK</Link>
          <Link href="/#for-business">For contractors</Link>
          <Link href="/#for-business">For OEM factories</Link>
          <Link href="/about#contact">Business enquiries <ArrowUpRight size={13} /></Link>
        </div>
        <div>
          <h3>Policies</h3>
          <Link href="/terms">Terms &amp; conditions</Link>
          <Link href="/refund-policy">Cancellation policy</Link>
          <Link href="/privacy-policy">Privacy policy</Link>
          <Link href="/shipping-policy">Shipping &amp; delivery</Link>
        </div>
      </div>
      <div className="site-footer-bottom">
        <span>© {new Date().getFullYear()} PLYDECK. All rights reserved.</span>
        <span>Buy better. Grow better.</span>
      </div>
    </footer>
  );
}
