import { headers } from "next/headers";

import { getGalleryGrants } from "@/lib/gallery-auth";
import { serverApiFetch, serverApiFetchWithTotal } from "@/lib/server-api";
import { getCurrentUser } from "@/lib/server-auth";

import BooksClient from "./books-client";
import type { Book, Chapter } from "./types";

export const dynamic = "force-dynamic";

const CHAPTERS_PER_PAGE = 15;
const PINNED_CHAPTER_LIMIT = 100;

function parseId(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function fetchChapterPage(
  bookId: number,
  page: number,
  pinned: boolean,
) {
  const params = new URLSearchParams({
    book_id: String(bookId),
    include_body: "false",
    page: String(page),
    page_size: String(pinned ? PINNED_CHAPTER_LIMIT : CHAPTERS_PER_PAGE),
    pinned: String(pinned),
  });
  return serverApiFetchWithTotal<Chapter[]>(
    `/chapters?${params.toString()}`,
    { auth: true, tags: ["chapters"] },
  );
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
  let failed = false;

  try {
    books = await serverApiFetch<Book[]>("/books", {
      auth: true,
      tags: ["books"],
    });
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

  const [grants, user] = await Promise.all([
    getGalleryGrants(),
    getCurrentUser(),
  ]);
  const isLoggedIn = user !== null;
  const isAdmin = user?.role === "admin";
  const visibleBooks = books
    .filter(
      (book) =>
        (isLoggedIn || book.visible !== false) &&
        (isAdmin || book.category?.visible !== false),
    )
    .map((book) => ({
      ...book,
      locked: !isAdmin && book.protected && !grants.books.has(book.id),
    }));
  const visibleBookIds = new Set(visibleBooks.map((book) => book.id));

  let initialBookId = requestedBookId;
  if (initialBookId !== null && !visibleBookIds.has(initialBookId)) {
    initialBookId = null;
  }
  if (initialBookId === null && initialChapterId !== null) {
    try {
      const chapter = await serverApiFetch<Chapter>(
        `/chapters/${initialChapterId}`,
        { auth: true },
      );
      if (visibleBookIds.has(chapter.book_id)) {
        initialBookId = chapter.book_id;
      }
    } catch (error) {
      console.error(error);
    }
  }
  if (initialBookId === null && !initialIsMobile) {
    initialBookId =
      [...visibleBooks]
        .filter((book) => book.visible !== false)
        .sort((a, b) => a.order - b.order || a.id - b.id)[0]?.id ?? null;
  }

  let chapters: Chapter[] = [];
  let pinnedChapters: Chapter[] = [];
  let chapterTotal = 0;
  if (initialBookId !== null) {
    try {
      const [regular, pinned] = await Promise.all([
        fetchChapterPage(initialBookId, 1, false),
        fetchChapterPage(initialBookId, 1, true),
      ]);
      chapters = regular.data.filter(
        (chapter) => isLoggedIn || chapter.visible !== false,
      );
      chapterTotal = regular.total ?? chapters.length;
      pinnedChapters = pinned.data.filter(
        (chapter) => isLoggedIn || chapter.visible !== false,
      );
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <BooksClient
      key={`${initialBookId ?? "none"}-${initialChapterId ?? "none"}`}
      initialBooks={visibleBooks}
      initialChapters={chapters}
      initialPinnedChapters={pinnedChapters}
      initialChapterTotal={chapterTotal}
      initialBookId={initialBookId}
      initialChapterId={initialChapterId}
      initialIsMobile={initialIsMobile}
      initialUnlockedCategoryIds={[...grants.categories]}
    />
  );
}
