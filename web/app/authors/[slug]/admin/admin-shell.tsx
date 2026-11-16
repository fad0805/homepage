"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { AdminLogoutButton } from "@/components/admin-logout-button";
import { AdminNavbar } from "@/components/admin-navbar";
import { useAuth } from "@/components/auth-provider";
import { adminBasePathFromPathname } from "@/lib/admin-route";
import { signinPathForPathname } from "@/lib/signin-route";

import "@/public/styles/admin/globals.scss";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { ready, isLoggedIn, isAdmin } = useAuth();
  const adminBase = adminBasePathFromPathname(pathname);
  const normalizedPath = pathname.replace(/\/+$/, "");
  const blocked = adminBase !== null && normalizedPath === adminBase;

  useEffect(() => {
    if (ready && !isLoggedIn) {
      router.push(signinPathForPathname(pathname));
      return;
    }
    if (ready && isLoggedIn && !isAdmin && blocked) {
      router.replace(adminBase ? `${adminBase}/author` : "/admin/author");
    }
  }, [ready, isLoggedIn, isAdmin, blocked, adminBase, pathname, router]);

  // Do not render admin content until the role check has finished. This
  // prevents a non-admin from briefly seeing the dashboard or admin-only
  // pages before the client redirect runs.
  if (!ready || !isLoggedIn) {
    return null;
  }

  if (!isAdmin && blocked) {
    return null;
  }

  return (
    <div className="admin-layout">
      <AdminNavbar />
      {children}
      <div className="admin-account-bar">
        <AdminLogoutButton />
      </div>
    </div>
  );
}
