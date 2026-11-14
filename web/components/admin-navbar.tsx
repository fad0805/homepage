"use client";
import { Fragment } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import "@/public/styles/admin/navbar.scss";
import navigation from "@/config/navigation";
import { useAuth } from "@/components/auth-provider";

interface AdminNavbarProps {
  id?: string;
  showGroupLabels?: boolean;
}

export const AdminNavbar = ({
  id = "admin-navbar",
  showGroupLabels = false,
}: AdminNavbarProps) => {
  const currentPath = usePathname();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const groups = navigation.admin.rows
    .map((row, rowIndex) => ({
      label: navigation.admin.rowLabels?.[rowIndex],
      items: row.filter((item) => !item.adminOnly || isAdmin),
    }))
    .filter((group) => group.items.length > 0);

  const isActive = (href: string) => {
    if (href === "/admin") {
      return currentPath === href;
    }
    return currentPath === href || currentPath.startsWith(`${href}/`);
  };

  return <nav id={id}>
      {groups.map((group, groupIndex) => (
        <Fragment key={group.label ?? groupIndex}>
          {showGroupLabels && group.label ? (
            <div className="admin-navbar__group-label">{group.label}</div>
          ) : null}
          <div className="admin-navbar__row">
            {group.items.map((item) => (
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
        </Fragment>
      ))}
  </nav>;
};
