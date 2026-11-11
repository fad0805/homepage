import { cookies } from "next/headers";
import { cache } from "react";

import { getCurrentUser } from "@/lib/server-auth";

const API_BASE = (
  process.env.API_INTERNAL_URL ?? "http://api:8000"
).replace(/\/+$/, "");

const GALLERY_COOKIE = "gallery_access";

interface GalleryStatusResponse {
  unlocked?: boolean;
  illustration_ids?: number[];
}

/**
 * Illustrations this browser may open.
 *
 * The API owns the invite codes and the session grants, so the cookie is
 * verified there. A logged-in administrator is handled separately by
 * `isIllustrationUnlocked` and never needs a one-time code on their own site.
 */
export const getGalleryIllustrationIds = cache(
  async (): Promise<Set<number>> => {
    const cookieStore = await cookies();
    const token = cookieStore.get(GALLERY_COOKIE)?.value;
    if (!token) {
      return new Set<number>();
    }

    try {
      const response = await fetch(`${API_BASE}/gallery/status`, {
        headers: {
          Accept: "application/json",
          Cookie: `${GALLERY_COOKIE}=${token}`,
        },
        cache: "no-store",
      });
      if (!response.ok) {
        return new Set<number>();
      }

      const data = (await response.json()) as GalleryStatusResponse;
      if (data.unlocked !== true || !Array.isArray(data.illustration_ids)) {
        return new Set<number>();
      }

      return new Set(
        data.illustration_ids.filter(
          (id): id is number => typeof id === "number",
        ),
      );
    } catch (error) {
      console.error("Failed to check gallery access.", error);
      return new Set<number>();
    }
  },
);

export const isIllustrationUnlocked = cache(
  async (illustrationId: number): Promise<boolean> => {
    const ids = await getGalleryIllustrationIds();
    if (ids.has(illustrationId)) {
      return true;
    }

    // The site owner should not have to unlock their own gallery.
    const user = await getCurrentUser();
    return user !== null;
  },
);
