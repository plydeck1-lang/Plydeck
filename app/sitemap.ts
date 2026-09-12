import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://plydeck.vercel.app";
  const now = new Date();
  return [
    { url: base, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/about`, lastModified: now, changeFrequency: "monthly", priority: .7 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "monthly", priority: .4 },
    { url: `${base}/refund-policy`, lastModified: now, changeFrequency: "monthly", priority: .4 },
    { url: `${base}/privacy-policy`, lastModified: now, changeFrequency: "monthly", priority: .4 },
    { url: `${base}/shipping-policy`, lastModified: now, changeFrequency: "monthly", priority: .4 },
  ];
}
