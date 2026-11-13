"use client";
import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AdminNavbar } from '@/components/admin-navbar';

import { useAuth } from "@/components/auth-provider";

import '@/public/styles/admin/globals.scss';

const ADMIN_ONLY_PATHS = [
  "/admin/author",
  "/admin/characters",
  "/admin/gallery",
  "/admin/export",
  "/admin/connections",
];

function isAdminOnlyPath(pathname: string) {
  if (pathname === "/admin") return true;
  return ADMIN_ONLY_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const { ready, isLoggedIn, isAdmin } = useAuth();
  const blocked = isAdminOnlyPath(pathname);

  useEffect(() => {
    if (ready && !isLoggedIn) {
      router.push('/signin');
      return;
    }
    if (ready && isLoggedIn && !isAdmin && blocked) {
      router.replace('/admin/books');
    }
  }, [ready, isLoggedIn, isAdmin, blocked, router]);

  if (ready && isLoggedIn && !isAdmin && blocked) {
    return null;
  }

  return (
    <div className="admin-layout">
      <AdminNavbar />
      {children}
    </div>
  );
}
