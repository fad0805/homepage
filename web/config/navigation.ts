interface NavItem {
  href: string
  label: string
  authOnly?: boolean
  adminOnly?: boolean
}

interface NaviSection {
  title: string
  items: NavItem[]
}

interface AdminNaviSection {
  title: string
  rows: NavItem[][]
  rowLabels?: string[]
}

interface Navigation {
  main: NaviSection
  admin: AdminNaviSection
}

const navigation: Navigation = {
  main: {
    title: "어디에도 없는 섬",
    items: [
      { href: "/author", label: "작가소개" },
      { href: "/characters", label: "등장인물" },
      { href: "/books", label: "목차" },
      { href: "/illustrations", label: "삽화" },
      { href: "/memo", label: "주석", authOnly: true },
      { href: "/links", label: "놀러가기" },
    ],
  },
  admin: {
    title: "결계 관리자 대시보드",
    rowLabels: ["콘텐츠 관리", "운영"],
    rows: [
      [
        { href: "/admin/author", label: "프로필 관리" },
        { href: "/admin/characters", label: "등장인물 관리" },
        { href: "/admin/books", label: "책장 관리" },
        { href: "/admin/illustrations", label: "삽화 관리" },
        { href: "/admin/links", label: "놀러가기 관리" },
      ],
      [
        { href: "/admin", label: "대시보드", adminOnly: true },
        { href: "/admin/gallery", label: "열람 관리" },
        { href: "/admin/connections", label: "연결 관리" },
        { href: "/admin/appearance", label: "외관 관리" },
        { href: "/admin/account", label: "계정 관리" },
        { href: "/admin/export", label: "내보내기" },
      ],
    ],
  },
};

export default navigation;
