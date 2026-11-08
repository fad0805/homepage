"use client";

import { useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

import { isAuthenticated } from "@/components/authentication";

const TAP_WINDOW_MS = 2500;
const REQUIRED_TAPS = 5;

export function FooterShortcut() {
  const router = useRouter();
  const pathname = usePathname();
  const taps = useRef<number[]>([]);

  const handleTap = () => {
    if (pathname.startsWith("/admin") || pathname === "/signin") {
      return;
    }

    const now = Date.now();
    taps.current = [
      ...taps.current.filter((time) => now - time <= TAP_WINDOW_MS),
      now,
    ];

    if (taps.current.length < REQUIRED_TAPS) {
      return;
    }

    taps.current = [];
    isAuthenticated(router).then((isAuth) => {
      if (isAuth) {
        router.push("/admin");
      } else {
        router.push("/signin");
      }
    });
  };

  return (
    <span className="footer-shortcut" onClick={handleTap}>
      © Rimien Siarte. All rights reserved. No external use permitted.
    </span>
  );
}
