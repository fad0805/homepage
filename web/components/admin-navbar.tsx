"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import "@/public/styles/admin/navbar.scss";
import navigation from "@/config/navigation";
import { useAuth } from "@/components/auth-provider";


export const AdminNavbar = () => {
  const currentPath = usePathname();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const rows = navigation.admin.rows
    .map((row) => row.filter((item) => !item.adminOnly || isAdmin))
    .filter((row) => row.length > 0);

  const isActive = (href: string) => {
    if (href === "/admin") {
      return currentPath === href;
    }
    return currentPath === href || currentPath.startsWith(`${href}/`);
  };

  return <nav id="admin-navbar">
      {rows.map((row, rowIndex) => (
        <div className="admin-navbar__row" key={rowIndex}>
          {row.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={isActive(item.href) ? "active" : ""}
              onClick={(event) => {
                // Only intercept the exact active page. A parent menu such as
                // /admin/books must still navigate away from /admin/books/123.
                if (currentPath === item.href) {
                  event.preventDefault();
                  router.refresh();
                }
              }}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ))}
  </nav>;
};
