"use client";

import { useEffect, useMemo, useState } from "react";

import { RssSubscribe } from "@/components/rss-subscribe";

import "@/public/styles/books.scss";

interface Book {
  id: number;
  title: string;
  description: string | null;
  order: number;
  visible: boolean;
}

interface Chapter {
  id: number;
  book_id: number;
  title: string;
  subtitle: string | null;
  body: string | null;
  order: number;
  visible: boolean;
  published_at: string | null;
  book: { id: number; title: string } | null;
}

function ChapterDetail({
  chapter,
  bookTitle,
}: {
  chapter: Chapter;
  bookTitle: string;
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
    </article>
  );
}

export default function Books() {
  const [books, setBooks] = useState<Book[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeBookId, setActiveBookId] = useState<number | null>(null);
  const [activeChapterId, setActiveChapterId] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const visibleBooks = useMemo(
    () =>
      books
        .filter((book) => book.visible !== false)
        .sort((a, b) => a.order - b.order || a.id - b.id),
    [books],
  );

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

  useEffect(() => {
    if (visibleBooks.length === 0) return;
    if (
      activeBookId !== null &&
      visibleBooks.some((book) => book.id === activeBookId)
    ) {
      return;
    }
    setActiveBookId(visibleBooks[0].id);
    setActiveChapterId(null);
  }, [activeBookId, visibleBooks]);

  const activeBook =
    visibleBooks.find((book) => book.id === activeBookId) ?? null;
  const activeChapters = activeBook
    ? visibleChapters.filter((chapter) => chapter.book_id === activeBook.id)
    : [];
  const activeChapter =
    activeBook && activeChapterId !== null
      ? activeChapters.find((chapter) => chapter.id === activeChapterId) ??
        null
      : null;

  const selectBook = (bookId: number) => {
    setActiveBookId(bookId);
    setActiveChapterId(null);
  };

  return (
    <div id="books-page">
      <div className="books-rss-bar">
        <RssSubscribe path="/books/rss.xml" label="전체 RSS 구독" />
      </div>

      {loading ? (
        <p className="books-state">불러오는 중...</p>
      ) : error ? (
        <p className="books-state">{error}</p>
      ) : visibleBooks.length === 0 ? (
        <p className="books-state">등록된 책이 없습니다.</p>
      ) : (
        <div className="books-layout">
          <div className="books-books">
            <p className="books-list-label">책</p>
            {visibleBooks.map((book) => (
              <button
                type="button"
                className={`books-book-button${
                  book.id === activeBookId ? " is-active" : ""
                }`}
                onClick={() => selectBook(book.id)}
                aria-pressed={book.id === activeBookId}
                key={book.id}
              >
                <span className="books-book-button__title">
                  {book.title}
                </span>
                <span className="books-book-button__count">
                  {chapterCounts.get(book.id) ?? 0}
                </span>
              </button>
            ))}
          </div>

          <aside className="books-panel">
            {activeBook && activeChapter ? (
              <div className="books-panel__detail">
                <button
                  type="button"
                  className="books-panel__back"
                  onClick={() => setActiveChapterId(null)}
                >
                  ← 게시글 목록
                </button>
                <ChapterDetail
                  chapter={activeChapter}
                  bookTitle={activeBook.title}
                />
              </div>
            ) : activeBook ? (
              <>
                <header className="books-panel__header">
                  <div>
                    <h2>{activeBook.title}</h2>
                    {activeBook.description ? (
                      <p>{activeBook.description}</p>
                    ) : null}
                  </div>
                  <RssSubscribe
                    path={`/books/${activeBook.id}/rss.xml`}
                    label="RSS"
                  />
                </header>

                {activeChapters.length === 0 ? (
                  <p className="books-panel__empty">
                    등록된 게시글이 없습니다.
                  </p>
                ) : (
                  <div className="books-chapters">
                    {activeChapters.map((chapter) => (
                      <button
                        type="button"
                        className="books-chapter-link"
                        onClick={() => setActiveChapterId(chapter.id)}
                        key={chapter.id}
                      >
                        <span className="books-chapter-link__title">
                          {chapter.title}
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
                )}
              </>
            ) : (
              <p className="books-panel__empty">책을 선택해주세요.</p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
