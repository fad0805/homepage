import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  navigation: {
    title: "어디에도 없는 섬",
    items: [
      { href: "/characters", label: "등장인물" },
      { href: "#", label: "책장" },
      { href: "/", label: "놀러가기" },
    ],
  },
};

export default nextConfig;
