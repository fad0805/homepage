"use client";
import React, { useEffect } from "react";
import { useRouter } from "next/navigation";

import { isAuthenticated } from "@/components/authentication";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  useEffect(() => {
    isAuthenticated(router).then((isAuth) => {
      if (!isAuth) {
        router.push('/signin');
      }
    });
  }, []);

  return (
    <div>
      {children}
    </div>
  );
}
