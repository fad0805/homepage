import { cookies } from "next/headers";
import { cache } from "react";

import { getCurrentUser } from "@/lib/server-auth";

const API_BASE = (
  process.env.API_INTERNAL_URL ?? "http://api:8000"
).replace(/\/+$/, "");

const GALLERY_COOKIE = "gallery_access";

/**
 * Check whether this browser may open the illustration pages.
 *
 * The API owns the invite codes and session rows, so the cookie is verified
 * there on every gated page. A logged-in administrator bypasses the gate and
 * does not need to enter a one-time code on their own site.
 */
export const isGalleryUnlocked = cache(async (): Promise<boolean> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(GALLERY_COOKIE)?.value;

  if (token) {
    try {
      const response = await fetch(`${API_BASE}/gallery/status`, {
        headers: {
          Accept: "application/json",
          Cookie: `${GALLERY_COOKIE}=${token}`,
        },
        cache: "no-store",
      });
      if (response.ok) {
        const data = (await response.json()) as { unlocked?: boolean };
        if (data.unlocked === true) {
          return true;
        }
      }
    } catch (error) {
      console.error("Failed to check gallery access.", error);
    }
  }

  const user = await getCurrentUser();
  return user !== null;
});
