import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dynamic2020.com";
  const routes = ["", "/notices", "/events", "/raffles", "/play", "/rewards", "/rankings", "/support", "/dashboard", "/community", "/reviews"];
  return routes.map((route) => ({ url: `${baseUrl}${route}`, lastModified: new Date(), changeFrequency: "daily", priority: route === "" ? 1 : 0.7 }));
}
