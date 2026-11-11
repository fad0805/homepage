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
// Admin, revalidation and API paths are intentionally absent: they are
// protected by authentication and advertising their names in a public file
// only helps an attacker map the application. Their responses carry an
// X-Robots-Tag: noindex header instead.
const DISALLOWED_PATHS = [
  "/illustrations",
  "/search",
  "/gallery",
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
