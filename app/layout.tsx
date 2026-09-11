import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'PLYDECK — Plywood, purchased together.', description: 'City-based plywood buying pools for retailers and contractors. Configure your sheets, see every cost and reserve a slot with 10%.', icons:{icon:'/plydeck-logo.png'} };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en-IN"><body>{children}</body></html>; }
