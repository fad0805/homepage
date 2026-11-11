import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Illustration uploads are proxied through Next.js to the API. Keep
    // enough headroom for a batch of high-resolution photos.
    middlewareClientMaxBodySize: "100mb",
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
      { source: "/illustrations", headers: noIndex },
      { source: "/illustrations/:path*", headers: noIndex },
      { source: "/search", headers: noIndex },
    ];
  },
};

export default nextConfig;
