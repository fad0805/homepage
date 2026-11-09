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
};

export default nextConfig;
