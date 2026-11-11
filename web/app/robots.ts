import type { MetadataRoute } from "next";

/**
 * Crawler policy.
 *
 * The illustration gallery is invite-only content, so it and the endpoints
 * that expose its images are kept out of search results. These rules are a
 * speed bump, not access control: only well-behaved crawlers obey robots.txt.
 *
 * If the gallery was already indexed, temporarily remove the "/illustrations"
 * entry so Google can fetch the page and read its noindex metadata, request
 * removal in Search Console, then restore the entry.
 */
const DISALLOWED_PATHS = [
  "/illustrations",
  "/search",
  "/admin",
  "/signin",
  "/revalidate",
  "/api/illustrations",
  "/uploads/illustrations",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOWED_PATHS,
      },
    ],
  };
}
