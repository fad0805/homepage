"use client";

import { useEffect, useMemo, useState } from "react";

import "@/public/styles/books.scss";

interface Bookshelf {
  id: number;
  title: string;
  description: string | null;
  order: number;
  visible: boolean;
}

interface Book {
  id: number;
  bookshelf_id: number;
  title: string;
  subtitle: string | null;
  body: string | null;
  order: number;
  visible: boolean;
  bookshelf: { id: number; title: string } | null;
}

function BookDetail({
  book,
  shelfTitle,
}: {
  book: Book;
  shelfTitle: string;
}) {
  return (
    <article className="book-detail">
      <p className="book-detail__shelf">{shelfTitle}</p>
      <h2 className="book-detail__title">{book.title}</h2>
      {book.subtitle ? (
        <p className="book-detail__subtitle">{book.subtitle}</p>
      ) : null}
      {book.body ? (
        <div
          className="book-detail__body"
          dangerouslySetInnerHTML={{ __html: book.body }}
        />
      ) : (
        <p className="book-detail__empty">내용이 아직 없습니다.</p>
      )}
    </article>
  );
}

export default function Books() {
  const [shelves, setShelves] = useState<Bookshelf[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [activeBookId, setActiveBookId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch("/api/books/shelves").then((response) => {
        if (!response.ok) throw new Error("책장을 불러오지 못했습니다.");
        return response.json() as Promise<Bookshelf[]>;
      }),
      fetch("/api/books").then((response) => {
        if (!response.ok) throw new Error("책 목록을 불러오지 못했습니다.");
        return response.json() as Promise<Book[]>;
      }),
    ])
      .then(([shelfData, bookData]) => {
        if (cancelled) return;
        setShelves(shelfData);
        setBooks(bookData);
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

  const visibleBooks = useMemo(
    () =>
      books
        .filter((book) => book.visible !== false)
        .sort(
          (a, b) =>
            a.order - b.order ||
            a.title.localeCompare(b.title, "ko"),
        ),
    [books],
  );

  const groups = useMemo(
    () =>
      shelves
        .filter((shelf) => shelf.visible !== false)
        .sort((a, b) => a.order - b.order || a.id - b.id)
        .map((shelf) => ({
          shelf,
          books: visibleBooks.filter(
            (book) => book.bookshelf_id === shelf.id,
          ),
        }))
        .filter((group) => group.books.length > 0),
    [shelves, visibleBooks],
  );

  useEffect(() => {
    if (activeBookId !== null) return;
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(min-width: 900px)").matches) return;
    const first = visibleBooks[0];
    if (first) setActiveBookId(first.id);
  }, [activeBookId, visibleBooks]);

  const activeBook =
    visibleBooks.find((book) => book.id === activeBookId) ?? null;
  const activeShelf = activeBook
    ? groups.find((group) => group.shelf.id === activeBook.bookshelf_id)
    : null;

  const handleSelect = (bookId: number) => {
    const isMobile = window.matchMedia("(max-width: 899px)").matches;
    if (isMobile && activeBookId === bookId) {
      setActiveBookId(null);
      return;
    }
    setActiveBookId(bookId);
  };

  return (
    <div id="books-page">
      {loading ? (
        <p className="books-state">불러오는 중...</p>
      ) : error ? (
        <p className="books-state">{error}</p>
      ) : groups.length === 0 ? (
        <p className="books-state">등록된 책이 없습니다.</p>
      ) : (
        <div className="books-layout">
          <div className="books-list">
            {groups.map(({ shelf, books: shelfBooks }) => (
              <section className="books-section" key={shelf.id}>
                <header className="books-section__header">
                  <h2>{shelf.title}</h2>
                  {shelf.description ? (
                    <p>{shelf.description}</p>
                  ) : null}
                </header>
                <div className="books-items">
                  {shelfBooks.map((book) => {
                    const isActive = book.id === activeBookId;
                    return (
                      <div
                        className={`books-item${isActive ? " is-active" : ""}`}
                        key={book.id}
                      >
                        <button
                          type="button"
                          className="books-item__button"
                          onClick={() => handleSelect(book.id)}
                          aria-expanded={isActive}
                        >
                          <span className="books-item__title">
                            {book.title}
                          </span>
                          {book.subtitle ? (
                            <span className="books-item__subtitle">
                              {book.subtitle}
                            </span>
                          ) : null}
                          <span className="books-item__chevron" aria-hidden="true">
                            {isActive ? "−" : "+"}
                          </span>
                        </button>
                        <div className="books-item__inline">
                          {isActive ? (
                            <BookDetail book={book} shelfTitle={shelf.title} />
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
            {activeBook ? (
              <BookDetail
                book={activeBook}
                shelfTitle={
                  activeShelf?.shelf.title ??
                  activeBook.bookshelf?.title ??
                  ""
                }
              />
            ) : (
              <p className="books-panel__empty">책을 선택해주세요.</p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
