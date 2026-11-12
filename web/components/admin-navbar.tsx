"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

import "@/public/styles/admin/navbar.scss";
import navigation from "@/config/navigation";


export const AdminNavbar = () => {
  const currentPath = usePathname();

  const isActive = (href: string) => {
    if (href === "/admin") {
      return currentPath === href;
    }
    return currentPath === href || currentPath.startsWith(`${href}/`);
  };

  return <nav id="admin-navbar">
      {navigation.admin.rows.map((row, rowIndex) => (
        <div className="admin-navbar__row" key={rowIndex}>
          {row.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={isActive(item.href) ? "active" : ""}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ))}
  </nav>;
};
