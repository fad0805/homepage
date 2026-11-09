"use client";
import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminNavbar } from '@/components/admin-navbar';

import { useAuth } from "@/components/auth-provider";

import '@/public/styles/admin/globals.scss';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const { ready, isLoggedIn } = useAuth();

  useEffect(() => {
    if (ready && !isLoggedIn) {
      router.push('/signin');
    }
  }, [ready, isLoggedIn, router]);

  return (
    <div className="admin-layout">
      <AdminNavbar />
      {children}
    </div>
  );
}
