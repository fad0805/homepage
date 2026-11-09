import { headers } from "next/headers";

import { serverApiFetch } from "@/lib/server-api";

import BooksClient from "./books-client";
import type { Book, Chapter } from "./types";

export const dynamic = "force-dynamic";

function parseId(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export default async function BooksPage({
  searchParams,
}: {
  searchParams: Promise<{
    book?: string | string[];
    chapter?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const requestedBookId = parseId(params.book);
  const initialChapterId = parseId(params.chapter);
  const headerStore = await headers();
  const userAgent = headerStore.get("user-agent") ?? "";
  const initialIsMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent);

  let books: Book[] = [];
  let chapters: Chapter[] = [];
  let failed = false;

  try {
    [books, chapters] = await Promise.all([
      serverApiFetch<Book[]>("/books", {
        tags: ["books"],
      }),
      serverApiFetch<Chapter[]>("/chapters", {
        tags: ["chapters"],
      }),
    ]);
  } catch (error) {
    console.error(error);
    failed = true;
  }

  if (failed) {
    return (
      <div id="books-page">
        <p className="books-state">목차를 불러오지 못했습니다.</p>
      </div>
    );
  }

  let initialBookId = requestedBookId;
  if (initialBookId === null && initialChapterId !== null) {
    initialBookId =
      chapters.find((chapter) => chapter.id === initialChapterId)?.book_id ??
      null;
  }
  if (initialBookId === null && !initialIsMobile) {
    initialBookId =
      [...books]
        .filter((book) => book.visible !== false)
        .sort((a, b) => a.order - b.order || a.id - b.id)[0]?.id ?? null;
  }

  return (
    <BooksClient
      key={`${initialBookId ?? "none"}-${initialChapterId ?? "none"}`}
      initialBooks={books}
      initialChapters={chapters}
      initialBookId={initialBookId}
      initialChapterId={initialChapterId}
      initialIsMobile={initialIsMobile}
    />
  );
}
