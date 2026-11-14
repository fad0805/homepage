"use client";

import { useEffect, useState } from "react";

import { useTheme } from "@/components/theme-provider";

import "@/public/styles/theme-toggle.scss";

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z" />
    </svg>
  );
}

interface ThemeToggleProps {
  variant?: "floating" | "drawer";
}

export function ThemeToggle({
  variant = "floating",
}: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Theme is stored on the client, so wait for hydration before rendering.
  if (!mounted) return null;

  const nextTheme = theme === "dark" ? "light" : "dark";
  const label =
    nextTheme === "dark" ? "다크 테마로 전환" : "라이트 테마로 전환";

  return (
    <button
      className={`theme-toggle${
        variant === "drawer" ? " theme-toggle--drawer" : ""
      }`}
      type="button"
      title={label}
      aria-label={label}
      onClick={() => setTheme(nextTheme)}
    >
      {nextTheme === "dark" ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}
