"use client";
import React, { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

import { isAuthenticated } from "@/components/authentication";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    console.log("Checking authentication for path:", pathname);
    isAuthenticated(router).then((isAuth) => {
      if (!isAuth) {
        router.push('/signin');
      }
    });
  }, [pathname, router]);

  return (
    <div>
      {children}
    </div>
  );
}
