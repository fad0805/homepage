"use client";

import { useEffect } from "react";

import { useAuth } from "@/components/auth-provider";

const SESSION_KEY = "missing-island-visit-tracked";

export function VisitTracker() {
  const { ready, isLoggedIn } = useAuth();

  useEffect(() => {
    if (!ready || isLoggedIn) return;

    try {
      if (window.sessionStorage.getItem(SESSION_KEY)) return;
      window.sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // Storage can be unavailable in private browsing; still count the visit.
    }

    fetch("/api/visits", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        referrer: document.referrer || "",
        path: window.location.pathname,
      }),
      keepalive: true,
    }).catch(() => {
      // Analytics must never break the page.
    });
  }, [ready, isLoggedIn]);

  return null;
}
