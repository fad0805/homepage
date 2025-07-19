import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  navigation: {
    title: "어디에도 없는 섬",
    items: [
      { href: "/profile", label: "작가소개" },
      { href: "/characters", label: "등장인물" },
      { href: "/books", label: "목차" },
      { href: "/links", label: "놀러가기" },
    ],
  },
  admin_navigation: {
    title: "결계 관리자 대시보드",
    items: [
      { href: "/admin", label: "대시보드" },
      { href: "/admin/profile", label: "프로필 관리" },
      { href: "/admin/characters", label: "등장인물 관리" },
      { href: "/admin/books", label: "책장 관리" },
      { href: "/admin/links", label: "링크 관리" },
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
