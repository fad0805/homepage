"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { usePathname, useRouter } from "next/navigation";

import { isAuthenticated } from "@/components/authentication";

const LONG_PRESS_MS = 700;
const MOVE_TOLERANCE_PX = 10;

export function FooterShortcut({
  copyrightName,
}: {
  copyrightName: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPoint = useRef<{ x: number; y: number } | null>(null);

  const clearPress = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    startPoint.current = null;
  }, []);

  useEffect(() => () => clearPress(), [clearPress]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLSpanElement>) => {
    // Desktop keeps the Q shortcut; this hidden entry is touch/pen only.
    if (event.pointerType === "mouse") return;
    if (pathname.startsWith("/admin") || pathname === "/signin") return;

    // Block touch text selection / lookup while keeping scroll via touch-action.
    event.preventDefault();
    clearPress();
    startPoint.current = { x: event.clientX, y: event.clientY };
    timer.current = setTimeout(() => {
      timer.current = null;
      startPoint.current = null;
      navigator.vibrate?.(15);
      void isAuthenticated(router).then((isAuth) => {
        router.push(isAuth ? "/admin" : "/signin");
      });
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const start = startPoint.current;
    if (!start) return;

    if (
      Math.abs(event.clientX - start.x) > MOVE_TOLERANCE_PX ||
      Math.abs(event.clientY - start.y) > MOVE_TOLERANCE_PX
    ) {
      clearPress();
    }
  };

  const handleContextMenu = (event: ReactMouseEvent<HTMLSpanElement>) => {
    event.preventDefault();
  };

  const name = copyrightName.trim();

  return (
    <span
      className="footer-shortcut"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={clearPress}
      onPointerCancel={clearPress}
      onPointerLeave={clearPress}
      onContextMenu={handleContextMenu}
    >
      {`©${name ? ` ${name}.` : ""} All rights reserved. No external use permitted.`}
    </span>
  );
}
