"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { ImageLightbox, type LightboxImage } from "@/components/image-lightbox";
import { Pagination } from "@/components/pagination";
import { RssSubscribe } from "@/components/rss-subscribe";
import { formatDateTime } from "@/lib/datetime";
import { matchesAllTokens, searchTokens } from "@/lib/search";
import type { Book, BookCategory, Chapter } from "./types";

import "@/public/styles/books.scss";

const CHAPTERS_PER_PAGE = 15;
const BODY_SEARCH_PAGE_SIZE = 100;

function createdTime(value: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function compareChaptersByCreatedDesc(a: Chapter, b: Chapter) {
  const aTime = createdTime(a.created_at);
  const bTime = createdTime(b.created_at);
  if (aTime === null && bTime === null) return b.id - a.id;
  if (aTime === null) return 1;
  if (bTime === null) return -1;
  return bTime - aTime || b.id - a.id;
}

async function fetchChapterSearchPage(
  query: string,
  page: number,
  signal: AbortSignal,
) {
  const params = new URLSearchParams({
    q: query,
    include_body: "false",
    ids_only: "true",
    page: String(page),
    page_size: String(BODY_SEARCH_PAGE_SIZE),
  });
  const response = await fetch(`/api/chapters?${params.toString()}`, {
    signal,
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to search chapters");
  const ids = (await response.json()) as number[];
  const rawTotal = response.headers.get("x-total-count");
  const total = rawTotal === null ? ids.length : Number(rawTotal);
  return {
    ids,
    total: Number.isFinite(total) ? total : ids.length,
  };
}

function TagChip({ tag }: { tag: string }) {
  return (
    <Link
      className="tag is-clickable"
      href={`/search?q=${encodeURIComponent(tag)}`}
    >
      {tag}
    </Link>
  );
}

function InlineUnlockForm({ label }: { label: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/gallery/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code }),
      });

      if (!response.ok) {
        let detail = "비밀번호가 올바르지 않거나 만료되었습니다.";
        try {
          const data = (await response.json()) as { detail?: unknown };
          if (typeof data.detail === "string") {
            detail = data.detail;
          }
        } catch {
          // Ignore malformed error bodies.
        }
        setError(detail);
        return;
      }

      setCode("");
      router.refresh();
    } catch {
      setError("요청에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="books-unlock">
      <p>{label}</p>
      <form className="books-unlock__form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="XXXX-XXXX-XXXX"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? "확인 중..." : "입장"}
        </button>
      </form>
      {error ? <p className="books-unlock__error">{error}</p> : null}
    </div>
  );
}

function ChapterDetail({
  chapter,
  bookTitle,
  bodyLoading = false,
}: {
  chapter: Chapter;
  bookTitle: string;
  bodyLoading?: boolean;
}) {
  const [lightbox, setLightbox] = useState<{
    images: LightboxImage[];
    index: number;
  } | null>(null);

  useEffect(() => {
    setLightbox(null);
  }, [chapter.id]);

  const handleBodyImageClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLImageElement)) return;
    if (target.closest(".rich-page-preview-block, .rich-page-preview")) {
      return;
    }

    const body = event.currentTarget;
    const images = Array.from(body.querySelectorAll("img")).filter(
      (image) => !image.closest(".rich-page-preview-block, .rich-page-preview"),
    );
    const index = images.indexOf(target);
    if (index === -1) return;

    event.preventDefault();
    event.stopPropagation();
    setLightbox({
      images: images.map((image) => ({
        src: image.currentSrc || image.src,
        alt: image.alt || null,
      })),
      index,
    });
  };

  return (
    <article className="chapter-detail">
      <p className="chapter-detail__book">{bookTitle}</p>
      <h2 className="chapter-detail__title">
        {chapter.title}
        {chapter.visible === false ? (
          <span className="books-private-badge">비공개</span>
        ) : null}
        {chapter.visible !== false && chapter.protected ? (
          <span className="books-protected-badge">보호</span>
        ) : null}
      </h2>
      {chapter.subtitle ? (
        <p className="chapter-detail__subtitle">{chapter.subtitle}</p>
      ) : null}
      {chapter.locked ? (
        <InlineUnlockForm label="이 글은 열람 비밀번호가 필요합니다." />
      ) : bodyLoading ? (
        <p className="chapter-detail__empty">본문을 불러오는 중...</p>
      ) : chapter.body ? (
        <div
          className="chapter-detail__body"
          onClick={handleBodyImageClick}
          dangerouslySetInnerHTML={{ __html: chapter.body }}
        />
      ) : (
        <p className="chapter-detail__empty">내용이 아직 없습니다.</p>
      )}
      {chapter.tags?.length ? (
        <div className="tag-list chapter-detail__tags">
          {chapter.tags.map((tag) => (
            <TagChip tag={tag} key={tag} />
          ))}
        </div>
      ) : null}
      {lightbox ? (
        <ImageLightbox
          images={lightbox.images}
          index={lightbox.index}
          onIndexChange={(index) =>
            setLightbox((current) =>
              current ? { ...current, index } : current,
            )
          }
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </article>
  );
}

interface BooksClientProps {
  initialBooks: Book[];
  initialChapters: Chapter[];
  initialBookId: number | null;
  initialChapterId: number | null;
  initialIsMobile: boolean;
  initialUnlockedCategoryIds?: number[];
}

export default function BooksClient({
  initialBooks,
  initialChapters,
  initialBookId,
  initialChapterId,
  initialIsMobile,
  initialUnlockedCategoryIds = [],
}: BooksClientProps) {
  const { isLoggedIn, isAdmin } = useAuth();
  const books = initialBooks;
  const chapters = initialChapters;
  const [activeBookId, setActiveBookId] = useState<number | null>(() => {
    if (initialBookId !== null) return initialBookId;
    if (initialChapterId === null) return null;
    return (
      initialChapters.find((chapter) => chapter.id === initialChapterId)
        ?.book_id ?? null
    );
  });
  const [activeChapterId, setActiveChapterId] = useState<number | null>(
    initialChapterId,
  );
  const [chapterBody, setChapterBody] = useState<{
    id: number;
    body: string | null;
  } | null>(null);
  const [chapterBodyLoading, setChapterBodyLoading] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(
    () => new Set(),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [bodySearch, setBodySearch] = useState<{
    query: string;
    ids: Set<number>;
    total: number;
    page: number;
  } | null>(null);
  const [bodySearchLoading, setBodySearchLoading] = useState(false);
  const [bodySearchError, setBodySearchError] = useState<
    "initial" | "more" | null
  >(null);
  const bodySearchRequestRef = useRef<AbortController | null>(null);
  const [chapterPage, setChapterPage] = useState(1);
  const [isMobile, setIsMobile] = useState(initialIsMobile);
  const [now, setNow] = useState(() => Date.now());
  const [unlockedCategories, setUnlockedCategories] = useState<Set<number>>(
    () => new Set(initialUnlockedCategoryIds),
  );
  const [unlockCategory, setUnlockCategory] =
    useState<BookCategory | null>(null);
  const [categoryCode, setCategoryCode] = useState("");
  const [categoryCodeError, setCategoryCodeError] = useState<string | null>(
    null,
  );
  const [categoryCodeLoading, setCategoryCodeLoading] = useState(false);
  const viewDepthRef = useRef(0);
  const initialViewRef = useRef({
    bookId: activeBookId,
    chapterId: activeChapterId,
  });

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // The chapter list is metadata-only, so body matches are resolved by the
  // API when a query is present. Title and tag matches keep working instantly
  // on the client while this request is in flight.
  useEffect(() => {
    if (searchTokens(searchQuery).length === 0) {
      bodySearchRequestRef.current?.abort();
      setBodySearch(null);
      setBodySearchLoading(false);
      setBodySearchError(null);
      return;
    }

    bodySearchRequestRef.current?.abort();
    const controller = new AbortController();
    bodySearchRequestRef.current = controller;
    setBodySearchLoading(true);
    setBodySearchError(null);
    const timer = window.setTimeout(() => {
      fetchChapterSearchPage(searchQuery, 1, controller.signal)
        .then(({ ids, total }) => {
          if (controller.signal.aborted) return;
          setBodySearch({
            query: searchQuery,
            ids: new Set(ids),
            total,
            page: 1,
          });
          setBodySearchError(null);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          // Title/tag matches still work, but the user must know that body
          // search did not complete.
          setBodySearch({
            query: searchQuery,
            ids: new Set(),
            total: 0,
            page: 1,
          });
          setBodySearchError("initial");
        })
        .finally(() => {
          if (!controller.signal.aborted) setBodySearchLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      bodySearchRequestRef.current?.abort();
    };
  }, [searchQuery]);

  const loadMoreBodySearch = () => {
    const current = bodySearch;
    if (!current || current.query !== searchQuery || bodySearchLoading) {
      return;
    }
    const nextPage = current.page + 1;
    if ((nextPage - 1) * BODY_SEARCH_PAGE_SIZE >= current.total) {
      return;
    }

    bodySearchRequestRef.current?.abort();
    const controller = new AbortController();
    bodySearchRequestRef.current = controller;
    setBodySearchLoading(true);
    setBodySearchError(null);
    fetchChapterSearchPage(current.query, nextPage, controller.signal)
      .then(({ ids, total }) => {
        if (controller.signal.aborted) return;
        setBodySearch((previous) =>
          previous && previous.query === current.query
            ? {
                query: current.query,
                ids: new Set([...previous.ids, ...ids]),
                total,
                page: nextPage,
              }
            : previous,
        );
        setBodySearchError(null);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setBodySearchError("more");
      })
      .finally(() => {
        if (!controller.signal.aborted) setBodySearchLoading(false);
      });
  };

  // The chapter list is metadata-only, so load the body only for the chapter
  // the reader actually opened. Locked chapters let the unlock form handle it.
  useEffect(() => {
    if (activeChapterId === null) {
      setChapterBody(null);
      setChapterBodyLoading(false);
      return;
    }
    const chapter = chapters.find((item) => item.id === activeChapterId);
    if (!chapter || chapter.locked) {
      setChapterBody(null);
      setChapterBodyLoading(false);
      return;
    }

    let cancelled = false;
    setChapterBody(null);
    setChapterBodyLoading(true);
    fetch(`/api/chapters/${activeChapterId}`)
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load chapter body");
        return response.json() as Promise<Chapter>;
      })
      .then((data) => {
        if (!cancelled) {
          setChapterBody({
            id: activeChapterId,
            body: data.body ?? null,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChapterBody({ id: activeChapterId, body: null });
        }
      })
      .finally(() => {
        if (!cancelled) setChapterBodyLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeChapterId, chapters]);

  // Mobile book/chapter selection does not change the URL, so tag the
  // current history entry and push one per view. The browser back button can
  // then walk chapter -> chapter list -> book list instead of leaving /books.
  useEffect(() => {
    window.history.replaceState(
      {
        ...window.history.state,
        booksView: initialViewRef.current,
        booksDepth: 0,
      },
      "",
    );

    const handlePopState = (event: PopStateEvent) => {
      const view = event.state?.booksView;
      if (!view) return;
      viewDepthRef.current =
        typeof event.state?.booksDepth === "number"
          ? event.state.booksDepth
          : 0;
      setActiveBookId(view.bookId ?? null);
      setActiveChapterId(view.chapterId ?? null);
      setChapterPage(1);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 899px)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (activeChapterId === null) return;
    fetch(`/api/chapters/${activeChapterId}/view`, {
      method: "POST",
    }).catch(() => {
      // View counting must never break the reading experience.
    });
  }, [activeChapterId]);

  const visibleBooks = useMemo(
    () =>
      books
        .filter(
          (book) =>
            (isLoggedIn || book.visible !== false) &&
            (isAdmin || book.category?.visible !== false),
        )
        .sort((a, b) => a.order - b.order || a.id - b.id),
    [books, isAdmin, isLoggedIn],
  );

  const categoryList = useMemo(() => {
    const found = new Map<number, BookCategory>();
    for (const book of visibleBooks) {
      if (!book.category) continue;
      found.set(book.category.id, book.category);
    }
    return [...found.values()].sort(
      (a, b) => a.order - b.order || a.id - b.id,
    );
  }, [visibleBooks]);

  const visibleChapters = useMemo(
    () =>
      chapters
        .filter(
          (chapter) =>
            (isLoggedIn || chapter.visible !== false) &&
            (!chapter.published_at ||
              new Date(chapter.published_at).getTime() <= now),
        )
        .sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return compareChaptersByCreatedDesc(a, b);
        }),
    [chapters, isLoggedIn, now],
  );

  const chapterCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const chapter of visibleChapters) {
      counts.set(chapter.book_id, (counts.get(chapter.book_id) ?? 0) + 1);
    }
    return counts;
  }, [visibleChapters]);

  const bodyMatchedChapterIds = useMemo(() => {
    if (bodySearch?.query !== searchQuery) return new Set<number>();
    const visibleChapterIds = new Set(
      visibleChapters.map((chapter) => chapter.id),
    );
    return new Set(
      [...bodySearch.ids].filter((id) => visibleChapterIds.has(id)),
    );
  }, [bodySearch, searchQuery, visibleChapters]);

  const bodySearchHasMore =
    bodySearch !== null &&
    bodySearch.query === searchQuery &&
    bodySearch.page * BODY_SEARCH_PAGE_SIZE < bodySearch.total;

  const filteredBooks = useMemo(() => {
    const tokens = searchTokens(searchQuery);
    if (tokens.length === 0) return visibleBooks;

    const chapterValues = new Map<number, string[]>();
    for (const chapter of visibleChapters) {
      const values = chapterValues.get(chapter.book_id) ?? [];
      values.push(
        chapter.title,
        chapter.subtitle ?? "",
        ...(chapter.tags ?? []),
      );
      chapterValues.set(chapter.book_id, values);
    }

    const bodyMatchedBookIds = new Set<number>();
    for (const chapter of visibleChapters) {
      if (bodyMatchedChapterIds.has(chapter.id)) {
        bodyMatchedBookIds.add(chapter.book_id);
      }
    }

    return visibleBooks.filter(
      (book) =>
        bodyMatchedBookIds.has(book.id) ||
        matchesAllTokens(
          [
            book.title,
            book.description,
            book.category?.name,
            ...(book.tags ?? []),
            ...(chapterValues.get(book.id) ?? []),
          ],
          tokens,
        ),
    );
  }, [
    visibleBooks,
    searchQuery,
    visibleChapters,
    bodyMatchedChapterIds,
  ]);

  const groupedBooks = useMemo(() => {
    const result: { category: BookCategory | null; books: Book[] }[] = [];
    const uncategorized = filteredBooks.filter((book) => !book.category);
    if (uncategorized.length > 0) {
      result.push({ category: null, books: uncategorized });
    }
    for (const category of categoryList) {
      const items = filteredBooks.filter(
        (book) => book.category_id === category.id,
      );
      if (items.length > 0) {
        result.push({ category, books: items });
      }
    }
    return result;
  }, [categoryList, filteredBooks]);

  useEffect(() => {
    if (isMobile) return;
    if (filteredBooks.length === 0) return;
    if (
      activeBookId !== null &&
      filteredBooks.some((book) => book.id === activeBookId)
    ) {
      return;
    }
    setActiveBookId(filteredBooks[0].id);
    setActiveChapterId(null);
  }, [activeBookId, filteredBooks, isMobile]);

  const activeBook =
    filteredBooks.find((book) => book.id === activeBookId) ?? null;

  const activeChapters = useMemo(() => {
    if (!activeBook) return [];
    const bookChapters = visibleChapters.filter(
      (chapter) => chapter.book_id === activeBook.id,
    );
    const tokens = searchTokens(searchQuery);
    if (tokens.length === 0) return bookChapters;

    return bookChapters.filter(
      (chapter) =>
        bodyMatchedChapterIds.has(chapter.id) ||
        matchesAllTokens(
          [
            chapter.title,
            chapter.subtitle,
            ...(chapter.tags ?? []),
          ],
          tokens,
        ),
    );
  }, [
    activeBook,
    searchQuery,
    visibleChapters,
    bodyMatchedChapterIds,
  ]);

  const activeChapter =
    activeBook && activeChapterId !== null
      ? activeChapters.find((chapter) => chapter.id === activeChapterId) ??
        null
      : null;

  const pinnedChapters = activeChapters.filter(
    (chapter) => chapter.pinned,
  );
  const regularChapters = activeChapters.filter(
    (chapter) => !chapter.pinned,
  );
  const totalChapterPages = Math.max(
    1,
    Math.ceil(regularChapters.length / CHAPTERS_PER_PAGE),
  );
  const pagedChapters = regularChapters.slice(
    (chapterPage - 1) * CHAPTERS_PER_PAGE,
    chapterPage * CHAPTERS_PER_PAGE,
  );

  useEffect(() => {
    setChapterPage(1);
  }, [activeBookId, searchQuery]);

  useEffect(() => {
    if (chapterPage > totalChapterPages) {
      setChapterPage(totalChapterPages);
    }
  }, [chapterPage, totalChapterPages]);

  const pushView = (view: {
    bookId: number | null;
    chapterId: number | null;
  }) => {
    if (!isMobile) return;
    const depth = viewDepthRef.current + 1;
    window.history.pushState(
      {
        ...window.history.state,
        booksView: view,
        booksDepth: depth,
      },
      "",
    );
    viewDepthRef.current = depth;
  };

  const goBackTo = (view: {
    bookId: number | null;
    chapterId: number | null;
  }) => {
    if (viewDepthRef.current > 0) {
      window.history.back();
      return;
    }
    window.history.replaceState(
      {
        ...window.history.state,
        booksView: view,
        booksDepth: 0,
      },
      "",
    );
    setActiveBookId(view.bookId);
    setActiveChapterId(view.chapterId);
    setChapterPage(1);
  };

  const selectBook = (bookId: number) => {
    if (isMobile) {
      pushView({ bookId, chapterId: null });
    }
    setActiveBookId(bookId);
    setActiveChapterId(null);
  };

  const selectChapter = (chapterId: number) => {
    if (isMobile) {
      pushView({ bookId: activeBookId, chapterId });
    }
    setActiveChapterId(chapterId);
  };

  const renderChapterButton = (chapter: Chapter) => (
    <button
      type="button"
      className={`books-chapter-link${
        chapter.pinned ? " is-pinned" : ""
      }`}
      onClick={() => selectChapter(chapter.id)}
      key={chapter.id}
    >
      <span className="books-chapter-link__main">
        <span className="books-chapter-link__title">
          {chapter.title}
          {chapter.visible === false ? (
            <span className="books-private-badge">비공개</span>
          ) : null}
          {chapter.visible !== false && chapter.protected ? (
            <span className="books-protected-badge">보호</span>
          ) : null}
        </span>
      </span>
      <span className="books-chapter-link__time">
        {formatDateTime(chapter.created_at)}
      </span>
      <span className="books-chapter-link__arrow" aria-hidden="true">
        →
      </span>
    </button>
  );

  const toggleCategory = (category: BookCategory) => {
    const locked =
      category.protected &&
      !isAdmin &&
      !unlockedCategories.has(category.id);
    if (locked && !expandedCategories.has(category.id)) {
      setCategoryCode("");
      setCategoryCodeError(null);
      setUnlockCategory(category);
      return;
    }
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category.id)) {
        next.delete(category.id);
      } else {
        next.add(category.id);
      }
      return next;
    });
  };

  const submitCategoryUnlock = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!unlockCategory || categoryCodeLoading) return;
    setCategoryCodeLoading(true);
    setCategoryCodeError(null);
    try {
      const response = await fetch("/api/gallery/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: categoryCode }),
      });
      if (!response.ok) {
        let detail = "비밀번호가 올바르지 않거나 만료되었습니다.";
        try {
          const data = (await response.json()) as { detail?: unknown };
          if (typeof data.detail === "string") detail = data.detail;
        } catch {
          // Ignore malformed error bodies.
        }
        setCategoryCodeError(detail);
        return;
      }
      const categoryId = unlockCategory.id;
      setUnlockedCategories((prev) => new Set(prev).add(categoryId));
      setExpandedCategories((prev) => new Set(prev).add(categoryId));
      setUnlockCategory(null);
      setCategoryCode("");
    } catch {
      setCategoryCodeError("요청에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setCategoryCodeLoading(false);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setActiveChapterId(null);
  };

  const bookList = (
    <div className="books-books-column">
      <div className="books-books__rss">
        <RssSubscribe path="/books/rss.xml" label="전체 RSS 구독" />
      </div>
      <div className="books-search">
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => handleSearchChange(event.target.value)}
          placeholder="검색"
          aria-label="책, 게시글, 태그 검색"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => handleSearchChange("")}
            aria-label="검색 초기화"
          >
            ×
          </button>
        ) : null}
      </div>
      {bodySearchHasMore ? (
        <button
          type="button"
          className="books-search-more"
          onClick={loadMoreBodySearch}
          disabled={bodySearchLoading}
        >
          {bodySearchLoading
            ? "본문 검색 중…"
            : `본문 검색 결과 더 보기 (${bodySearch.ids.size}/${bodySearch.total})`}
        </button>
      ) : null}
      {bodySearchError ? (
        <p className="books-search-error" role="alert">
          {bodySearchError === "initial"
            ? "본문 검색에 실패했습니다. 제목·태그 검색 결과만 표시됩니다."
            : "본문 검색 결과를 더 불러오지 못했습니다. 다시 시도해 주세요."}
        </p>
      ) : null}
      <div className="books-books">
        {groupedBooks.length === 0 ? (
          <p className="books-list-empty">검색 결과가 없습니다.</p>
        ) : (
          groupedBooks.map((group) => {
            const categoryId = group.category?.id;
            const isOpen =
              categoryId === undefined ||
              searchQuery.trim() !== "" ||
              expandedCategories.has(categoryId);
            return (
              <div
                className={`books-group${isOpen ? " is-open" : ""}`}
                key={categoryId ?? "uncategorized"}
              >
                {group.category && categoryId !== undefined ? (
                  <button
                    type="button"
                    className="books-group__toggle"
                    onClick={() =>
                      group.category
                        ? toggleCategory(group.category)
                        : undefined
                    }
                    aria-expanded={isOpen}
                  >
                    <span className="books-group__label">
                      <span>{group.category.name}</span>
                      {group.category.visible === false ? (
                        <span className="books-private-badge">비공개</span>
                      ) : null}
                    </span>
                    <span className="books-group__meta">
                      {group.category.visible !== false &&
                      group.category.protected ? (
                        <span className="books-protected-badge">
                          보호
                        </span>
                      ) : null}
                      <span
                        className="books-group__chevron"
                        aria-hidden="true"
                      >
                        ▸
                      </span>
                    </span>
                  </button>
                ) : null}
                {isOpen
                  ? group.books.map((book) => (
                      <button
                        type="button"
                        className={`books-book-button${
                          book.id === activeBookId ? " is-active" : ""
                        }`}
                        onClick={() => selectBook(book.id)}
                        aria-pressed={book.id === activeBookId}
                        key={book.id}
                      >
                        <span className="books-book-button__main">
                          <span className="books-book-button__title">
                            {book.title}
                            {book.visible === false ? (
                              <span className="books-private-badge">
                                비공개
                              </span>
                            ) : null}
                            {book.visible !== false && book.protected ? (
                              <span className="books-protected-badge">
                                보호
                              </span>
                            ) : null}
                          </span>
                        </span>
                        <span className="books-book-button__count">
                          {chapterCounts.get(book.id) ?? 0}
                        </span>
                      </button>
                    ))
                  : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  const chapterPanel = activeBook ? (
    <>
      {isMobile ? (
        <button
          type="button"
          className="books-panel__back"
          onClick={() => goBackTo({ bookId: null, chapterId: null })}
        >
          ← 목차
        </button>
      ) : null}
      <header className="books-panel__header">
        <div>
          <h2>
            {activeBook.title}
            {activeBook.visible === false ? (
              <span className="books-private-badge">비공개</span>
            ) : null}
            {activeBook.visible !== false && activeBook.protected ? (
              <span className="books-protected-badge">보호</span>
            ) : null}
          </h2>
          {activeBook.description ? (
            <p>{activeBook.description}</p>
          ) : null}
          {activeBook.category || activeBook.tags?.length ? (
            <div className="tag-list books-panel__tags">
              {activeBook.category ? (
                <span className="tag is-category">
                  {activeBook.category.name}
                </span>
              ) : null}
              {activeBook.tags?.map((tag) => (
                <TagChip tag={tag} key={tag} />
              ))}
            </div>
          ) : null}
        </div>
        {activeBook.locked ? null : (
          <RssSubscribe
            path={`/books/${activeBook.id}/rss.xml`}
            label="RSS"
          />
        )}
      </header>

      {activeBook.locked ? (
        <InlineUnlockForm label="이 책은 열람 비밀번호가 필요합니다." />
      ) : (
        <>
      {searchQuery ? (
        <p className="books-search-active">
          검색: <strong>{searchQuery}</strong>
          <button type="button" onClick={() => handleSearchChange("")}>
            초기화
          </button>
        </p>
      ) : null}

      {activeChapters.length === 0 ? (
        <p className="books-panel__empty">
          {searchQuery
            ? "검색 결과가 없습니다."
            : "등록된 게시글이 없습니다."}
        </p>
      ) : (
        <>
          {pinnedChapters.length > 0 ? (
            <div className="books-chapters books-chapters--pinned">
              {pinnedChapters.map(renderChapterButton)}
            </div>
          ) : null}
          <div className="books-chapters">
            {pagedChapters.map(renderChapterButton)}
          </div>
          {regularChapters.length > 0 ? (
            <Pagination
              page={chapterPage}
              totalPages={totalChapterPages}
              onChange={setChapterPage}
            />
          ) : null}
        </>
      )}
        </>
      )}
    </>
  ) : null;

  const detailPanel =
    activeBook && activeChapter && !activeBook.locked ? (
      <div className="books-panel__detail">
        <div className="books-detail-nav">
          <button
            type="button"
            className="books-panel__back"
            onClick={() =>
              goBackTo({ bookId: activeBookId, chapterId: null })
            }
          >
            ← 게시글 목록
          </button>
          {isLoggedIn ? (
            <Link
              className="books-detail__edit"
              href={`/admin/books/${activeBook.id}/chapters/${activeChapter.id}`}
            >
              수정
            </Link>
          ) : null}
        </div>
        <ChapterDetail
          chapter={{
            ...activeChapter,
            body:
              chapterBody?.id === activeChapter.id ? chapterBody.body : null,
          }}
          bookTitle={activeBook.title}
          bodyLoading={chapterBodyLoading}
        />
      </div>
    ) : null;

  return (
    <div id="books-page">
      {visibleBooks.length === 0 ? (
        <p className="books-state">등록된 책이 없습니다.</p>
      ) : isMobile ? (
        activeBook ? (
          activeChapter && !activeBook.locked ? (
            <div className="books-panel">{detailPanel}</div>
          ) : (
            <div className="books-panel">{chapterPanel}</div>
          )
        ) : (
          bookList
        )
      ) : (
        <div className="books-layout">
          {bookList}
          <aside className="books-panel">
            {activeChapter && !activeBook?.locked ? (
              detailPanel
            ) : activeBook ? (
              chapterPanel
            ) : (
              <p className="books-panel__empty">책을 선택해주세요.</p>
            )}
          </aside>
        </div>
      )}

      {unlockCategory ? (
        <div
          className="books-category-unlock-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setUnlockCategory(null);
            }
          }}
        >
          <div
            className="books-category-unlock"
            role="dialog"
            aria-modal="true"
            aria-label="카테고리 열람 비밀번호"
          >
            <header>
              <h2>{unlockCategory.name}</h2>
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setUnlockCategory(null)}
              >
                ×
              </button>
            </header>
            <p>이 카테고리는 열람 비밀번호가 필요합니다.</p>
            <form onSubmit={submitCategoryUnlock}>
              <input
                type="text"
                value={categoryCode}
                onChange={(event) => setCategoryCode(event.target.value)}
                placeholder="XXXX-XXXX-XXXX"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                spellCheck={false}
                autoFocus
                required
              />
              {categoryCodeError ? (
                <p className="books-category-unlock__error">
                  {categoryCodeError}
                </p>
              ) : null}
              <button type="submit" disabled={categoryCodeLoading}>
                {categoryCodeLoading ? "확인 중..." : "열기"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
