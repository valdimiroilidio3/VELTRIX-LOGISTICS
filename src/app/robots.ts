import type { MetadataRoute } from "next";

const base = process.env.APP_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/services", "/about", "/contact", "/privacy", "/terms", "/request-quote", "/tracking"],
        disallow: ["/app", "/api", "/login", "/tracking/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
