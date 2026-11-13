"use client";

import { useCallback, useState } from "react";

export function AdminLogoutButton() {
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/users/signout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      window.location.href = "/signin";
    }
  }, [loggingOut]);

  return (
    <button
      type="button"
      className="admin-account-logout"
      onClick={handleLogout}
      disabled={loggingOut}
    >
      {loggingOut ? "로그아웃 중..." : "로그아웃"}
    </button>
  );
}
