import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  navigation: {
    title: "어디에도 없는 섬",
    items: [
      { href: "#", label: "작가소개" },
      { href: "/characters", label: "등장인물" },
      { href: "#", label: "책장" },
      { href: "/links", label: "놀러가기" },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://api:8000/:path*",
      },
    ];
  },
};

export default nextConfig;
