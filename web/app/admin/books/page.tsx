"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";

import { apiFetch } from "@/lib/api";

import "@/public/styles/admin/books.scss";

interface Book {
  id: number;
  title: string;
  description: string | null;
  order: number;
  visible: boolean;
}

interface ChapterItem {
  id: number;
  book_id: number;
}

type Notice = { type: "success" | "error"; text: string };

function sortBooks(books: Book[]) {
  return [...books].sort((a, b) => a.order - b.order || a.id - b.id);
}

export default function AdminBooks() {
  const [books, setBooks] = useState<Book[]>([]);
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [bookTitle, setBookTitle] = useState("");
  const [bookDescription, setBookDescription] = useState("");
  const [bookVisible, setBookVisible] = useState(true);

  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((type: Notice["type"], text: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ type, text });
    noticeTimer.current = setTimeout(() => setNotice(null), 3500);
  }, []);

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bookData, chapterData] = await Promise.all([
        apiFetch<Book[]>("/api/books"),
        apiFetch<ChapterItem[]>("/api/chapters"),
      ]);
      setBooks(sortBooks(bookData));
      setChapters(chapterData);
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "책장 데이터를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!bookModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBookModalOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [bookModalOpen]);

  const sortedBooks = useMemo(() => sortBooks(books), [books]);

  const chapterCounts = useMemo(() => {
    const map = new Map<number, number>();
    for (const chapter of chapters) {
      map.set(chapter.book_id, (map.get(chapter.book_id) ?? 0) + 1);
    }
    return map;
  }, [chapters]);

  const openCreateBook = () => {
    setBookTitle("");
    setBookDescription("");
    setBookVisible(true);
    setBookModalOpen(true);
  };

  const handleBookSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = bookTitle.trim();
    if (!title) {
      notify("error", "책 제목을 입력해주세요.");
      return;
    }

    setSaving(true);
    try {
      await apiFetch("/api/books", {
        method: "POST",
        body: JSON.stringify({
          title,
          description: bookDescription.trim() || null,
          order: sortedBooks.length,
          visible: bookVisible,
        }),
      });
      setBookModalOpen(false);
      await load();
      notify("success", "책을 만들었습니다.");
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "책을 만들지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  const moveBook = async (book: Book, direction: -1 | 1) => {
    const index = sortedBooks.findIndex((item) => item.id === book.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= sortedBooks.length) return;

    const next = [...sortedBooks];
    [next[index], next[target]] = [next[target], next[index]];
    const reordered = next.map((item, order) => ({ ...item, order }));
    setBooks(reordered);

    try {
      await apiFetch("/api/books/reorder", {
        method: "PUT",
        body: JSON.stringify({
          items: reordered.map((item) => ({
            id: item.id,
            order: item.order,
          })),
        }),
      });
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "책 순서를 저장하지 못했습니다.",
      );
      await load();
    }
  };

  return (
    <div id="admin-books">
      <header className="admin-books-toolbar">
        <div>
          <h1>책장 관리</h1>
          <p className="admin-books-hint">
            책을 선택해 상세 페이지에서 책 정보와 챕터를 관리합니다.
          </p>
        </div>
        <div className="admin-books-actions">
          <button
            type="button"
            className="admin-button"
            onClick={load}
            disabled={loading}
          >
            새로고침
          </button>
          <button
            type="button"
            className="admin-button primary"
            onClick={openCreateBook}
          >
            새 책
          </button>
        </div>
      </header>

      {notice ? (
        <div className={`admin-notice admin-notice-${notice.type}`}>
          {notice.text}
        </div>
      ) : null}

      {loading ? (
        <p className="admin-books-empty">불러오는 중...</p>
      ) : sortedBooks.length === 0 ? (
        <p className="admin-books-empty">
          책이 없습니다. 새 책을 추가해주세요.
        </p>
      ) : (
        <div className="admin-books-grid">
          {sortedBooks.map((book, index) => (
            <article className="admin-book-card" key={book.id}>
              <div className="admin-book-card__header">
                <div className="admin-book-card__title">
                  <Link href={`/admin/books/${book.id}`}>{book.title}</Link>
                  {book.description ? <p>{book.description}</p> : null}
                </div>
                <div className="admin-book-card__meta">
                  {book.visible === false ? (
                    <span className="admin-book-badge">비공개</span>
                  ) : null}
                  <span className="admin-book-badge">
                    {chapterCounts.get(book.id) ?? 0}챕터
                  </span>
                </div>
              </div>
              <div className="admin-book-card__actions">
                <button
                  type="button"
                  className="admin-button"
                  onClick={() => moveBook(book, -1)}
                  disabled={index === 0}
                  aria-label="책 위로"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="admin-button"
                  onClick={() => moveBook(book, 1)}
                  disabled={index === sortedBooks.length - 1}
                  aria-label="책 아래로"
                >
                  ↓
                </button>
                <Link
                  className="admin-button"
                  href={`/admin/books/${book.id}`}
                >
                  관리
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      {bookModalOpen ? (
        <div
          className="admin-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setBookModalOpen(false);
            }
          }}
        >
          <div className="admin-modal" role="dialog" aria-modal="true">
            <div className="admin-modal-header">
              <h2>새 책</h2>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setBookModalOpen(false)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <form
              id="book-form"
              className="admin-modal-body admin-books-modal-form"
              onSubmit={handleBookSubmit}
            >
              <label className="admin-field">
                <span>책 제목</span>
                <input
                  value={bookTitle}
                  onChange={(event) => setBookTitle(event.target.value)}
                  placeholder="예: 단편선"
                  required
                />
              </label>
              <label className="admin-field">
                <span>책 설명</span>
                <textarea
                  value={bookDescription}
                  onChange={(event) =>
                    setBookDescription(event.target.value)
                  }
                  rows={3}
                  placeholder="책 설명 (선택)"
                />
              </label>
              <label className="admin-books-checkbox">
                <input
                  type="checkbox"
                  checked={bookVisible}
                  onChange={(event) =>
                    setBookVisible(event.target.checked)
                  }
                />
                <span>공개</span>
              </label>
            </form>
            <div className="admin-modal-footer">
              <button
                type="button"
                className="admin-button"
                onClick={() => setBookModalOpen(false)}
                disabled={saving}
              >
                취소
              </button>
              <button
                type="submit"
                form="book-form"
                className="admin-button primary"
                disabled={saving}
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
