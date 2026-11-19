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
import { PublicToc } from "@/components/public-toc";
import { RssSubscribe } from "@/components/rss-subscribe";
import { formatDateTime } from "@/lib/datetime";
import type { Book, BookCategory, Chapter, TocNode } from "./types";

import "@/public/styles/books.scss";

const CHAPTERS_PER_PAGE = 15;
const PINNED_CHAPTER_LIMIT = 100;

async function fetchChapterPage(
  bookId: number,
  page: number,
  query: string,
  pinned: boolean,
  signal: AbortSignal,
) {
  const params = new URLSearchParams({
    book_id: String(bookId),
    include_body: "false",
    page: String(page),
    page_size: String(pinned ? PINNED_CHAPTER_LIMIT : CHAPTERS_PER_PAGE),
    pinned: String(pinned),
  });
  if (query.trim()) params.set("q", query);
  const response = await fetch(`/api/chapters?${params.toString()}`, {
    signal,
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to load chapters");
  const chapters = (await response.json()) as Chapter[];
  const rawTotal = response.headers.get("x-total-count");
  const total = rawTotal === null ? chapters.length : Number(rawTotal);
  return {
    chapters,
    total: Number.isFinite(total) ? total : chapters.length,
  };
}

async function fetchBookToc(bookId: number, signal: AbortSignal) {
  const response = await fetch(`/api/books/${bookId}/toc`, {
    signal,
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to load table of contents");
  return (await response.json()) as TocNode[];
}

function tocHasFolder(nodes: TocNode[]): boolean {
  return nodes.some(
    (node) => node.node_type === "folder" || tocHasFolder(node.children),
  );
}

function findTocFolder(nodes: TocNode[], folderId: number): TocNode | null {
  for (const node of nodes) {
    if (node.node_type !== "folder") continue;
    if (node.id === folderId) return node;
    const found = findTocFolder(node.children, folderId);
    if (found) return found;
  }
  return null;
}

function tocChapterIds(node: TocNode | null): number[] {
  if (!node) return [];
  return node.children.flatMap((child) =>
    child.node_type === "post" && child.chapter ? [child.chapter.id] : [],
  );
}

function findTocPath(
  nodes: TocNode[],
  folderId: number,
  trail: TocNode[] = [],
): TocNode[] | null {
  for (const node of nodes) {
    if (node.node_type !== "folder") continue;
    const next = [...trail, node];
    if (node.id === folderId) return next;
    const found = findTocPath(node.children, folderId, next);
    if (found) return found;
  }
  return null;
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
  initialPinnedChapters: Chapter[];
  initialChapterTotal: number;
  initialBookId: number | null;
  initialChapterId: number | null;
  initialIsMobile: boolean;
  initialUnlockedCategoryIds?: number[];
}

export default function BooksClient({
  initialBooks,
  initialChapters,
  initialPinnedChapters,
  initialChapterTotal,
  initialBookId,
  initialChapterId,
  initialIsMobile,
  initialUnlockedCategoryIds = [],
}: BooksClientProps) {
  const { isLoggedIn, isAdmin } = useAuth();
  const books = initialBooks;
  const [chapters, setChapters] = useState<Chapter[]>(initialChapters);
  const [pinnedChapters, setPinnedChapters] =
    useState<Chapter[]>(initialPinnedChapters);
  const [chapterTotal, setChapterTotal] = useState(initialChapterTotal);
  const [chapterBookId, setChapterBookId] = useState<number | null>(
    initialBookId,
  );
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [chaptersError, setChaptersError] = useState(false);
  const [toc, setToc] = useState<TocNode[]>([]);
  const [tocLoading, setTocLoading] = useState(false);
  const [tocError, setTocError] = useState(false);
  const [tocModalOpen, setTocModalOpen] = useState(false);
  const [selectedTocFolderId, setSelectedTocFolderId] = useState<number | null>(
    null,
  );
  const [folderChapters, setFolderChapters] = useState<Chapter[]>([]);
  const [folderChaptersLoading, setFolderChaptersLoading] = useState(false);
  const [folderChaptersError, setFolderChaptersError] = useState(false);
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
  const [fallbackChapter, setFallbackChapter] = useState<Chapter | null>(null);
  const [chapterBody, setChapterBody] = useState<{
    id: number;
    body: string | null;
  } | null>(null);
  const [chapterBodyLoading, setChapterBodyLoading] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(
    () => new Set(),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [bookSearch, setBookSearch] = useState<{
    query: string;
    books: Book[];
  } | null>(null);
  const [chapterPage, setChapterPage] = useState(1);
  const [isMobile, setIsMobile] = useState(initialIsMobile);
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
  const chapterRequestRef = useRef<AbortController | null>(null);
  const chapterLookupRef = useRef(new Map<number, Chapter>());
  const viewDepthRef = useRef(0);
  const initialViewRef = useRef({
    bookId: activeBookId,
    chapterId: activeChapterId,
  });

  // Book-level search runs on the API so matching chapters do not have to be
  // loaded into the browser just to find their books.
  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setBookSearch(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/books?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
        credentials: "include",
      })
        .then((response) => {
          if (!response.ok) throw new Error("Failed to search books");
          return response.json() as Promise<Book[]>;
        })
        .then((items) => {
          if (!controller.signal.aborted) {
            setBookSearch({ query, books: items });
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setBookSearch({ query, books: [] });
          }
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  // Chapters are loaded one book/page at a time. Pinned chapters are fetched
  // separately so they stay visible on every page.
  useEffect(() => {
    if (activeBookId === null) {
      chapterRequestRef.current?.abort();
      setChapters([]);
      setPinnedChapters([]);
      setChapterTotal(0);
      setChapterBookId(null);
      setChaptersLoading(false);
      setChaptersError(false);
      return;
    }

    chapterRequestRef.current?.abort();
    const controller = new AbortController();
    chapterRequestRef.current = controller;
    setChaptersLoading(true);
    setChaptersError(false);

    const timer = window.setTimeout(() => {
      Promise.all([
        fetchChapterPage(
          activeBookId,
          chapterPage,
          searchQuery,
          false,
          controller.signal,
        ),
        fetchChapterPage(
          activeBookId,
          1,
          searchQuery,
          true,
          controller.signal,
        ),
      ])
        .then(([regular, pinned]) => {
          if (controller.signal.aborted) return;
          setChapters(regular.chapters);
          setChapterTotal(regular.total);
          setPinnedChapters(pinned.chapters);
          setChapterBookId(activeBookId);
          setChaptersError(false);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setChapters([]);
          setPinnedChapters([]);
          setChapterTotal(0);
          setChapterBookId(activeBookId);
          setChaptersError(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setChaptersLoading(false);
        });
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeBookId, chapterPage, searchQuery]);

  // The public TOC is hierarchical and independent of the flat, paginated
  // chapter list. Load it once per book so it can be browsed in the modal
  // without a login and without pulling every chapter body.
  useEffect(() => {
    setToc([]);
    setTocError(false);
    setTocModalOpen(false);
    setSelectedTocFolderId(null);
    if (activeBookId === null) {
      setTocLoading(false);
      return;
    }

    const controller = new AbortController();
    setTocLoading(true);
    fetchBookToc(activeBookId, controller.signal)
      .then((nodes) => {
        if (controller.signal.aborted) return;
        setToc(nodes);
      })
      .catch(() => {
        if (!controller.signal.aborted) setTocError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setTocLoading(false);
      });

    return () => controller.abort();
  }, [activeBookId]);

  // A leaf TOC folder filters the post list below the modal. The paginated
  // list cannot be used here because the folder's posts may span pages, so
  // fetch the book's full metadata list and keep only the folder's posts.
  useEffect(() => {
    if (selectedTocFolderId === null || activeBookId === null) {
      setFolderChapters([]);
      setFolderChaptersLoading(false);
      setFolderChaptersError(false);
      return;
    }
    const folder = findTocFolder(toc, selectedTocFolderId);
    const chapterIds = tocChapterIds(folder);
    if (chapterIds.length === 0) {
      setFolderChapters([]);
      setFolderChaptersLoading(false);
      setFolderChaptersError(false);
      return;
    }

    const controller = new AbortController();
    setFolderChaptersLoading(true);
    setFolderChaptersError(false);
    fetch(
      `/api/chapters?book_id=${activeBookId}&include_body=false`,
      { signal: controller.signal, credentials: "include" },
    )
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load chapters");
        return response.json() as Promise<Chapter[]>;
      })
      .then((allChapters) => {
        if (controller.signal.aborted) return;
        const order = new Map(chapterIds.map((id, index) => [id, index]));
        setFolderChapters(
          allChapters
            .filter((chapter) => order.has(chapter.id))
            .sort(
              (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
            ),
        );
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setFolderChapters([]);
        setFolderChaptersError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setFolderChaptersLoading(false);
      });

    return () => controller.abort();
  }, [activeBookId, selectedTocFolderId, toc]);

  chapterLookupRef.current = new Map(
    [...pinnedChapters, ...chapters].map((chapter) => [chapter.id, chapter]),
  );

  // The chapter list is metadata-only, so load the body only for the chapter
  // the reader actually opened. A deep-linked chapter may not be on the
  // current list page, so its metadata is fetched separately when needed.
  useEffect(() => {
    if (activeChapterId === null) {
      setFallbackChapter(null);
      setChapterBody(null);
      setChapterBodyLoading(false);
      return;
    }
    const known = chapterLookupRef.current.get(activeChapterId);
    if (known?.locked) {
      setChapterBody(null);
      setChapterBodyLoading(false);
      return;
    }

    let cancelled = false;
    setFallbackChapter(null);
    setChapterBody(null);
    setChapterBodyLoading(true);
    fetch(`/api/chapters/${activeChapterId}`, {
      credentials: "include",
    })
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load chapter body");
        return response.json() as Promise<Chapter>;
      })
      .then((data) => {
        if (!cancelled) {
          if (!known) setFallbackChapter(data);
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
  }, [activeChapterId]);

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

  const filteredBooks = useMemo(() => {
    const query = searchQuery.trim();
    if (!query) return visibleBooks;
    if (bookSearch?.query !== query) return visibleBooks;
    return bookSearch.books
      .filter(
        (book) =>
          (isLoggedIn || book.visible !== false) &&
          (isAdmin || book.category?.visible !== false),
      )
      .sort((a, b) => a.order - b.order || a.id - b.id);
  }, [bookSearch, isAdmin, isLoggedIn, searchQuery, visibleBooks]);

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
  const chapterDataReady =
    activeBook !== null && chapterBookId === activeBook.id;
  const activeChapters = chapterDataReady ? chapters : [];
  const activePinnedChapters = chapterDataReady ? pinnedChapters : [];
  const selectedTocFolder =
    selectedTocFolderId === null
      ? null
      : findTocFolder(toc, selectedTocFolderId);
  const selectedTocPath =
    selectedTocFolderId === null
      ? []
      : (findTocPath(toc, selectedTocFolderId) ?? []);
  const folderFilterActive = selectedTocFolder !== null;
  const visibleChapters = folderFilterActive ? folderChapters : activeChapters;
  const visiblePinnedChapters = folderFilterActive ? [] : activePinnedChapters;
  const chapterListLoading = folderFilterActive
    ? folderChaptersLoading
    : chaptersLoading;
  const chapterListError = folderFilterActive
    ? folderChaptersError
    : chaptersError;
  const totalChapterPages = folderFilterActive
    ? 1
    : Math.max(1, Math.ceil((chapterDataReady ? chapterTotal : 0) / CHAPTERS_PER_PAGE));

  const activeChapter =
    activeBook && activeChapterId !== null
      ? [...activePinnedChapters, ...activeChapters].find(
          (chapter) => chapter.id === activeChapterId,
        ) ??
        (fallbackChapter?.id === activeChapterId ? fallbackChapter : null)
      : null;

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
    setSelectedTocFolderId(null);
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
                          {book.chapter_count ?? 0}
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

  const hasTocFolder = tocHasFolder(toc);

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
            <span>
              {activeBook.title}
              {activeBook.visible === false ? (
                <span className="books-private-badge">비공개</span>
              ) : null}
              {activeBook.visible !== false && activeBook.protected ? (
                <span className="books-protected-badge">보호</span>
              ) : null}
              {hasTocFolder && !activeBook.locked ? (
                <button
                  type="button"
                  className="books-toc-trigger"
                  onClick={() => setTocModalOpen(true)}
                >
                  ☷ 목차
                </button>
              ) : null}
            </span>
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
      {folderFilterActive ? (
        <p className="books-search-active">
          <span>목차:</span>
          <span className="books-toc-path">
            {selectedTocPath.map((node, index) => (
              <span key={node.id ?? index}>
                {index > 0 ? (
                  <span className="books-toc-path__sep" aria-hidden="true">
                    ›
                  </span>
                ) : null}
                <strong>{node.label ?? "폴더"}</strong>
              </span>
            ))}
          </span>
          <button
            type="button"
            onClick={() => setSelectedTocFolderId(null)}
          >
            초기화
          </button>
        </p>
      ) : null}

      {chapterListError ? (
        <p className="books-panel__empty" role="alert">
          게시글을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      ) : chapterListLoading &&
        visibleChapters.length === 0 &&
        visiblePinnedChapters.length === 0 ? (
        <p className="books-panel__empty">게시글을 불러오는 중…</p>
      ) : visibleChapters.length === 0 &&
        visiblePinnedChapters.length === 0 ? (
        <p className="books-panel__empty">
          {searchQuery
            ? "검색 결과가 없습니다."
            : folderFilterActive
              ? "이 목차에 속한 게시글이 없습니다."
              : "등록된 게시글이 없습니다."}
        </p>
      ) : (
        <>
          {visiblePinnedChapters.length > 0 ? (
            <div className="books-chapters books-chapters--pinned">
              {visiblePinnedChapters.map(renderChapterButton)}
            </div>
          ) : null}
          <div className="books-chapters">
            {visibleChapters.map(renderChapterButton)}
          </div>
          {!folderFilterActive && visibleChapters.length > 0 ? (
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

      {tocModalOpen && activeBook && hasTocFolder ? (
        <div
          className="books-toc-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setTocModalOpen(false);
          }}
        >
          <div
            className="books-toc-modal"
            role="dialog"
            aria-modal="true"
            aria-label="목차"
          >
            <header>
              <h2>{activeBook.title} 목차</h2>
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setTocModalOpen(false)}
              >
                ×
              </button>
            </header>
            {tocError ? (
              <p className="books-panel__empty" role="alert">
                목차를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
              </p>
            ) : tocLoading && toc.length === 0 ? (
              <p className="books-panel__empty">목차를 불러오는 중…</p>
            ) : (
              <PublicToc
                nodes={toc}
                selectedFolderId={selectedTocFolderId}
                onSelectFolder={(folderId) => {
                  setSelectedTocFolderId(folderId);
                  setTocModalOpen(false);
                }}
              />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
