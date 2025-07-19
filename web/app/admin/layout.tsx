"use client";
import React, { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AdminNavbar } from '@/components/admin-navbar';

import { isAuthenticated } from "@/components/authentication";

import '@/public/styles/admin/globals.scss';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    isAuthenticated(router).then((isAuth) => {
      if (!isAuth) {
        router.push('/signin');
      }
    });
  }, [pathname, router]);

  return (
    <div>
      <AdminNavbar />
      {children}
    </div>
  );
}
