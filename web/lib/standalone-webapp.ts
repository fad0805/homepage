"use client";

import { useEffect, useState } from "react";

/** Detect an installed PWA, where opening a new tab would leave the app. */
export function isStandaloneWebApp(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    window.matchMedia?.("(display-mode: minimal-ui)").matches === true ||
    window.matchMedia?.("(display-mode: fullscreen)").matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function useStandaloneWebApp(): boolean {
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setStandalone(isStandaloneWebApp());
  }, []);

  return standalone;
}
