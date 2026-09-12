import type { Metadata } from 'next';
import './globals.css';
import './brand.css';
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://plydeck.vercel.app';
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'PLYDECK | Buy Better. Grow Better.', template: '%s' },
  description: 'A city-based B2B demand aggregation platform connecting interior contractors, retailers and OEM plywood factories through transparent buying pools.',
  icons:{icon:'/plydeck-logo.png'},
  openGraph: {
    title: 'PLYDECK | Collective plywood buying for business',
    description: 'Factory supply, aggregated city demand, shared truckloads and QC-led fulfilment.',
    type: 'website',
    locale: 'en_IN',
  },
};
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en-IN"><body>{children}</body></html>; }
