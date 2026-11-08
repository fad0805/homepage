"use client";

import { useEffect, useMemo, useState } from "react";

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

  const visibleChapters = useMemo(() => {
    return chapters
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
      );
  }, [chapters, now]);

  const groups = useMemo(
    () =>
      books
        .filter((book) => book.visible !== false)
        .sort((a, b) => a.order - b.order || a.id - b.id)
        .map((book) => ({
          book,
          chapters: visibleChapters.filter(
            (chapter) => chapter.book_id === book.id,
          ),
        }))
        .filter((group) => group.chapters.length > 0),
    [books, visibleChapters],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const requested = Number(
      new URLSearchParams(window.location.search).get("chapter"),
    );
    if (Number.isFinite(requested) && requested > 0) {
      setActiveChapterId(requested);
    }
  }, []);

  useEffect(() => {
    if (activeChapterId !== null) return;
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(min-width: 900px)").matches) return;
    const first = visibleChapters[0];
    if (first) setActiveChapterId(first.id);
  }, [activeChapterId, visibleChapters]);

  const activeChapter =
    visibleChapters.find((chapter) => chapter.id === activeChapterId) ?? null;
  const activeBook = activeChapter
    ? groups.find((group) => group.book.id === activeChapter.book_id)
    : null;

  const handleSelect = (chapterId: number) => {
    const isMobile = window.matchMedia("(max-width: 899px)").matches;
    if (isMobile && activeChapterId === chapterId) {
      setActiveChapterId(null);
      return;
    }
    setActiveChapterId(chapterId);
  };

  return (
    <div id="books-page">
      <div className="books-rss-bar">
        <a
          className="books-rss-link"
          href="/books/rss.xml"
          target="_blank"
          rel="noreferrer"
        >
          전체 RSS
        </a>
      </div>

      {loading ? (
        <p className="books-state">불러오는 중...</p>
      ) : error ? (
        <p className="books-state">{error}</p>
      ) : groups.length === 0 ? (
        <p className="books-state">등록된 책이 없습니다.</p>
      ) : (
        <div className="books-layout">
          <div className="books-list">
            {groups.map(({ book, chapters: bookChapters }) => (
              <section className="books-section" key={book.id}>
                <header className="books-section__header">
                  <div className="books-section__heading">
                    <h2>{book.title}</h2>
                    <a
                      className="books-rss-link"
                      href={`/books/${book.id}/rss.xml`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      RSS
                    </a>
                  </div>
                  {book.description ? <p>{book.description}</p> : null}
                </header>
                <div className="books-items">
                  {bookChapters.map((chapter) => {
                    const isActive = chapter.id === activeChapterId;
                    return (
                      <div
                        className={`books-item${isActive ? " is-active" : ""}`}
                        id={`chapter-${chapter.id}`}
                        key={chapter.id}
                      >
                        <button
                          type="button"
                          className="books-item__button"
                          onClick={() => handleSelect(chapter.id)}
                          aria-expanded={isActive}
                        >
                          <span className="books-item__title">
                            {chapter.title}
                          </span>
                          {chapter.subtitle ? (
                            <span className="books-item__subtitle">
                              {chapter.subtitle}
                            </span>
                          ) : null}
                          <span className="books-item__chevron" aria-hidden="true">
                            {isActive ? "−" : "+"}
                          </span>
                        </button>
                        <div className="books-item__inline">
                          {isActive ? (
                            <ChapterDetail
                              chapter={chapter}
                              bookTitle={book.title}
                            />
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <aside className="books-panel">
            {activeChapter ? (
              <ChapterDetail
                chapter={activeChapter}
                bookTitle={
                  activeBook?.book.title ??
                  activeChapter.book?.title ??
                  ""
                }
              />
            ) : (
              <p className="books-panel__empty">챕터를 선택해주세요.</p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
