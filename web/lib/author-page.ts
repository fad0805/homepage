import { notFound } from "next/navigation";

import type { AuthorPageData } from "@/config/author";
import { serverApiFetch } from "@/lib/server-api";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function authorSlugFromParam(value: string) {
  const slug = value.toLowerCase();
  if (!SLUG_PATTERN.test(slug)) {
    notFound();
  }
  return slug;
}

export async function fetchSingleAuthorSlug() {
  try {
    const data = await serverApiFetch<{ slug: string | null }>(
      "/profiles/single-author",
      { tags: ["profiles"] },
    );
    return data.slug;
  } catch {
    return null;
  }
}

export async function fetchAuthorPage(slug: string) {
  try {
    return await serverApiFetch<AuthorPageData>(
      `/profiles/by-slug/${encodeURIComponent(slug)}`,
      { tags: ["profiles"] },
    );
  } catch {
    notFound();
  }
}
