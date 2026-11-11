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
  chapter_ids?: number[];
  book_ids?: number[];
}

export interface GalleryGrants {
  illustrations: Set<number>;
  chapters: Set<number>;
  books: Set<number>;
}

const EMPTY_GRANTS: GalleryGrants = {
  illustrations: new Set<number>(),
  chapters: new Set<number>(),
  books: new Set<number>(),
};

function toNumberSet(values: unknown): Set<number> {
  if (!Array.isArray(values)) {
    return new Set<number>();
  }
  return new Set(
    values.filter((value): value is number => typeof value === "number"),
  );
}

/**
 * Resources this browser may open.
 *
 * The API owns the invite codes and session grants, so the cookie is verified
 * there. A logged-in administrator is handled by the `is*Unlocked` helpers and
 * never needs a one-time code on their own site.
 */
export const getGalleryGrants = cache(async (): Promise<GalleryGrants> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(GALLERY_COOKIE)?.value;
  if (!token) {
    return EMPTY_GRANTS;
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
      return EMPTY_GRANTS;
    }

    const data = (await response.json()) as GalleryStatusResponse;
    if (data.unlocked !== true) {
      return EMPTY_GRANTS;
    }

    return {
      illustrations: toNumberSet(data.illustration_ids),
      chapters: toNumberSet(data.chapter_ids),
      books: toNumberSet(data.book_ids),
    };
  } catch (error) {
    console.error("Failed to check gallery access.", error);
    return EMPTY_GRANTS;
  }
});

export const isIllustrationUnlocked = cache(
  async (illustrationId: number): Promise<boolean> => {
    const grants = await getGalleryGrants();
    if (grants.illustrations.has(illustrationId)) {
      return true;
    }
    const user = await getCurrentUser();
    return user !== null;
  },
);

export const isChapterUnlocked = cache(
  async (chapterId: number, bookId: number): Promise<boolean> => {
    const grants = await getGalleryGrants();
    if (
      grants.chapters.has(chapterId) ||
      grants.books.has(bookId)
    ) {
      return true;
    }
    const user = await getCurrentUser();
    return user !== null;
  },
);

export const isBookUnlocked = cache(
  async (bookId: number): Promise<boolean> => {
    const grants = await getGalleryGrants();
    if (grants.books.has(bookId)) {
      return true;
    }
    const user = await getCurrentUser();
    return user !== null;
  },
);
