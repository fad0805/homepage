"use client";
import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import "@/public/styles/admin/navbar.scss";
import navigation from "@/config/navigation";
import { useAuth } from "@/components/auth-provider";
import { useHorizontalScrollFade } from "@/lib/use-horizontal-scroll-fade";

interface AdminNavbarProps {
  id?: string;
  showGroupLabels?: boolean;
}

function ScrollFadeRow({ children }: { children: ReactNode }) {
  const { ref, fadeClassName } = useHorizontalScrollFade<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={["admin-navbar__row", fadeClassName]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
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

  return (
    <nav id={id}>
      {groups.map((group, groupIndex) => (
        <Fragment key={group.label ?? groupIndex}>
          {showGroupLabels && group.label ? (
            <div className="admin-navbar__group-label">{group.label}</div>
          ) : null}
          <ScrollFadeRow>
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${isActive(item.href) ? "active" : ""}${
                  item.iconOnly ? " admin-navbar__icon-link" : ""
                }`}
                title={item.iconOnly ? item.label : undefined}
                aria-label={item.iconOnly ? item.label : undefined}
                onClick={(event) => {
                  // Only intercept the exact active page. A parent menu such as
                  // /admin/books must still navigate away from /admin/books/123.
                  if (currentPath === item.href) {
                    event.preventDefault();
                    router.refresh();
                  }
                }}
              >
                {item.iconOnly ? (
                  <svg
                    className="admin-navbar__note-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M6 3.5h9l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 6 20V3.5Z" />
                    <path d="M14.5 3.5V8H19" />
                    <path d="M9 12h6M9 15.5h6" />
                  </svg>
                ) : (
                  item.label
                )}
              </Link>
            ))}
          </ScrollFadeRow>
        </Fragment>
      ))}
    </nav>
  );
};
