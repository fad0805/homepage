"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Link } from "@heroui/react";

import "@/public/styles/admin/navbar.scss";
import navigation from "@/config/navigation";


export const AdminNavbar = () => {
  interface MenuItem {
      label: string;
      href: string;
  };
  const menuList = (now: string) => {
    const menuItems = navigation.admin.items;
    return menuItems.map((item: MenuItem, index: number) => {
      return <Link
          key={index}
          href={item.href}
          className={ now === item.href ? "active" : ""}
      >{item.label}</Link>;
    });
  };

  const currentPath = usePathname();
  const [menu, setMenu] = useState(menuList(currentPath));

  useEffect(() => {
      setMenu(menuList(currentPath));
  }, [currentPath]);

  return <nav id="admin-navbar">
      { menu }
  </nav>;
};
