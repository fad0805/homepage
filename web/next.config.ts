import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Illustration uploads are one small file per request through the
    // streaming /api/illustrations/bulk route handler.
    middlewareClientMaxBodySize: "60mb",
    // Next.js rewrites time out after 30s by default. A large Scrivener
    // import can take longer than that even though the API still succeeds.
    proxyTimeout: 5 * 60 * 1000,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://api:8000/:path*",
      },
      {
        source: "/uploads/:path*",
        destination: "http://api:8000/uploads/:path*",
      },
    ];
  },
  async headers() {
    // Defence in depth alongside robots.txt: crawlers that ignore the
    // Disallow rules still receive an explicit noindex instruction.
    const noIndex = [
      {
        key: "X-Robots-Tag",
        value: "noindex, nofollow, noarchive, noimageindex",
      },
    ];

    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      { source: "/illustrations", headers: noIndex },
      { source: "/illustrations/:path*", headers: noIndex },
      { source: "/bookmark", headers: noIndex },
      { source: "/bookmark/:path*", headers: noIndex },
      { source: "/planner", headers: noIndex },
      { source: "/planner/:path*", headers: noIndex },
      { source: "/search", headers: noIndex },
      { source: "/gallery", headers: noIndex },
      { source: "/gallery/:path*", headers: noIndex },
      { source: "/admin", headers: noIndex },
      { source: "/admin/:path*", headers: noIndex },
      { source: "/api/:path*", headers: noIndex },
      { source: "/uploads/:path*", headers: noIndex },
    ];
  },
};

export default nextConfig;
