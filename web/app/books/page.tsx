"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { Pagination } from "@/components/pagination";
import { RssSubscribe } from "@/components/rss-subscribe";
import { formatDateTime } from "@/lib/datetime";

import "@/public/styles/books.scss";

const CHAPTERS_PER_PAGE = 15;

interface BookCategory {
  id: number;
  name: string;
  order: number;
}

interface Book {
  id: number;
  title: string;
  description: string | null;
  tags: string[];
  category_id: number | null;
  category: BookCategory | null;
  order: number;
  visible: boolean;
}

interface Chapter {
  id: number;
  book_id: number;
  title: string;
  subtitle: string | null;
  body: string | null;
  tags: string[];
  order: number;
  visible: boolean;
  view_count: number;
  created_at: string | null;
  published_at: string | null;
  book: { id: number; title: string } | null;
}

function TagChip({
  tag,
  onActivate,
}: {
  tag: string;
  onActivate: (tag: string) => void;
}) {
  return (
    <span
      className="tag is-clickable"
      role="button"
      tabIndex={0}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onActivate(tag);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          onActivate(tag);
        }
      }}
    >
      {tag}
    </span>
  );
}

function ChapterDetail({
  chapter,
  bookTitle,
  onTagClick,
}: {
  chapter: Chapter;
  bookTitle: string;
  onTagClick: (tag: string) => void;
}) {
  return (
    <article className="chapter-detail">
      <p className="chapter-detail__book">{bookTitle}</p>
      <h2 className="chapter-detail__title">{chapter.title}</h2>
      {chapter.subtitle ? (
        <p className="chapter-detail__subtitle">{chapter.subtitle}</p>
      ) : null}
      {chapter.body ? (
        <div
          className="chapter-detail__body"
          dangerouslySetInnerHTML={{ __html: chapter.body }}
        />
      ) : (
        <p className="chapter-detail__empty">내용이 아직 없습니다.</p>
      )}
      {chapter.tags?.length ? (
        <div className="tag-list chapter-detail__tags">
          {chapter.tags.map((tag) => (
            <TagChip tag={tag} onActivate={onTagClick} key={tag} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

export default function Books() {
  const [books, setBooks] = useState<Book[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeBookId, setActiveBookId] = useState<number | null>(null);
  const [activeChapterId, setActiveChapterId] = useState<number | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(
    () => new Set(),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [chapterPage, setChapterPage] = useState(1);
  const [isMobile, setIsMobile] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/users/me", { credentials: "include" })
      .then((response) => {
        if (!cancelled) setIsLoggedIn(response.ok);
      })
      .catch(() => {
        if (!cancelled) setIsLoggedIn(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch("/api/books").then((response) => {
        if (!response.ok) throw new Error("책 목록을 불러오지 못했습니다.");
        return response.json() as Promise<Book[]>;
      }),
      fetch("/api/chapters").then((response) => {
        if (!response.ok) throw new Error("챕터를 불러오지 못했습니다.");
        return response.json() as Promise<Chapter[]>;
      }),
    ])
      .then(([bookData, chapterData]) => {
        if (cancelled) return;
        setBooks(bookData);
        setChapters(chapterData);
      })
      .catch((reason) => {
        console.error(reason);
        if (!cancelled) {
          setError("목차를 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 899px)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const bookParam = Number(params.get("book"));
    const chapterParam = Number(params.get("chapter"));
    if (Number.isFinite(bookParam) && bookParam > 0) {
      setActiveBookId(bookParam);
    }
    if (Number.isFinite(chapterParam) && chapterParam > 0) {
      setActiveChapterId(chapterParam);
    }
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
        .filter((book) => book.visible !== false)
        .sort((a, b) => a.order - b.order || a.id - b.id),
    [books],
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
            chapter.visible !== false &&
            (!chapter.published_at ||
              new Date(chapter.published_at).getTime() <= now),
        )
        .sort(
          (a, b) =>
            a.order - b.order ||
            a.title.localeCompare(b.title, "ko") ||
            a.id - b.id,
        ),
    [chapters, now],
  );

  const chapterCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const chapter of visibleChapters) {
      counts.set(chapter.book_id, (counts.get(chapter.book_id) ?? 0) + 1);
    }
    return counts;
  }, [visibleChapters]);

  const filteredBooks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return visibleBooks;

    const matches = (value: string | null | undefined) =>
      (value ?? "").toLowerCase().includes(query);
    const chapterMatches = (chapter: Chapter) =>
      matches(chapter.title) ||
      matches(chapter.subtitle) ||
      chapter.tags.some(matches);

    return visibleBooks.filter(
      (book) =>
        matches(book.title) ||
        matches(book.description) ||
        matches(book.category?.name) ||
        book.tags.some(matches) ||
        visibleChapters.some(
          (chapter) =>
            chapter.book_id === book.id && chapterMatches(chapter),
        ),
    );
  }, [visibleBooks, searchQuery, visibleChapters]);

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
    const query = searchQuery.trim().toLowerCase();
    if (!query) return bookChapters;

    const matches = (value: string | null | undefined) =>
      (value ?? "").toLowerCase().includes(query);
    return bookChapters.filter(
      (chapter) =>
        matches(chapter.title) ||
        matches(chapter.subtitle) ||
        chapter.tags.some(matches),
    );
  }, [activeBook, searchQuery, visibleChapters]);

  const activeChapter =
    activeBook && activeChapterId !== null
      ? activeChapters.find((chapter) => chapter.id === activeChapterId) ??
        null
      : null;

  const totalChapterPages = Math.max(
    1,
    Math.ceil(activeChapters.length / CHAPTERS_PER_PAGE),
  );
  const pagedChapters = activeChapters.slice(
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

  const selectBook = (bookId: number) => {
    setActiveBookId(bookId);
    setActiveChapterId(null);
  };

  const toggleCategory = (categoryId: number) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const activateTag = (tag: string) => {
    setSearchQuery(tag);
    setActiveChapterId(null);
    setChapterPage(1);
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
                    onClick={() => toggleCategory(categoryId)}
                    aria-expanded={isOpen}
                  >
                    <span>{group.category.name}</span>
                    <span
                      className="books-group__chevron"
                      aria-hidden="true"
                    >
                      ▸
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
          onClick={() => {
            setActiveBookId(null);
            setActiveChapterId(null);
          }}
        >
          ← 목차
        </button>
      ) : null}
      <header className="books-panel__header">
        <div>
          <h2>{activeBook.title}</h2>
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
                <TagChip tag={tag} onActivate={activateTag} key={tag} />
              ))}
            </div>
          ) : null}
        </div>
        <RssSubscribe
          path={`/books/${activeBook.id}/rss.xml`}
          label="RSS"
        />
      </header>

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
          <div className="books-chapters">
            {pagedChapters.map((chapter) => (
              <button
                type="button"
                className="books-chapter-link"
                onClick={() => setActiveChapterId(chapter.id)}
                key={chapter.id}
              >
                <span className="books-chapter-link__main">
                  <span className="books-chapter-link__title">
                    {chapter.title}
                  </span>
                </span>
                <span className="books-chapter-link__time">
                  {formatDateTime(chapter.created_at)}
                </span>
                <span
                  className="books-chapter-link__arrow"
                  aria-hidden="true"
                >
                  →
                </span>
              </button>
            ))}
          </div>
          <Pagination
            page={chapterPage}
            totalPages={totalChapterPages}
            onChange={setChapterPage}
          />
        </>
      )}
    </>
  ) : null;

  const detailPanel =
    activeBook && activeChapter ? (
      <div className="books-panel__detail">
        <div className="books-detail-nav">
          <button
            type="button"
            className="books-panel__back"
            onClick={() => setActiveChapterId(null)}
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
          chapter={activeChapter}
          bookTitle={activeBook.title}
          onTagClick={activateTag}
        />
      </div>
    ) : null;

  return (
    <div id="books-page">
      {loading ? (
        <p className="books-state">불러오는 중...</p>
      ) : error ? (
        <p className="books-state">{error}</p>
      ) : visibleBooks.length === 0 ? (
        <p className="books-state">등록된 책이 없습니다.</p>
      ) : isMobile ? (
        activeBook ? (
          activeChapter ? (
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
            {activeChapter ? (
              detailPanel
            ) : activeBook ? (
              chapterPanel
            ) : (
              <p className="books-panel__empty">책을 선택해주세요.</p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
