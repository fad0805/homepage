import type { Metadata } from "next";
import Link from "next/link";

import { UnlockForm } from "./unlock-form";

import "@/public/styles/signin.scss";
import "@/public/styles/gallery.scss";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safeNext(value: string | string[] | undefined) {
  const raw = firstParam(value);
  if (!raw) return "/illustrations";
  // Only allow paths on this site. Reject "//host" and absolute URLs.
  if (!raw.startsWith("/") || raw.startsWith("//")) {
    return "/illustrations";
  }
  return raw;
}

export default async function GalleryUnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const fromIllustrations = next.startsWith("/illustrations");
  const fromBooks = next.startsWith("/books");
  const backHref = fromIllustrations
    ? "/illustrations"
    : fromBooks
      ? "/books"
      : "/";
  const backLabel = fromIllustrations
    ? "← 삽화 목록"
    : fromBooks
      ? "← 목차"
      : "← 처음으로";

  return (
    <div id="main" className="auth-page">
      <UnlockForm next={next} />
      <p className="gallery-back">
        <Link href={backHref}>{backLabel}</Link>
      </p>
    </div>
  );
}
