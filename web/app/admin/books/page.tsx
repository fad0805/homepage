"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { RichTextEditor } from "@/components/rich-text-editor";

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
  title: string;
  subtitle: string | null;
  body: string | null;
  order: number;
  visible: boolean;
  book: { id: number; title: string } | null;
}

type Notice = { type: "success" | "error"; text: string };

async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    credentials: "include",
    ...init,
    headers,
  });

  if (response.status === 401) {
    window.location.href = "/signin";
    throw new Error("로그인이 필요합니다.");
  }

  if (!response.ok) {
    let detail = `요청에 실패했습니다. (${response.status})`;
    try {
      const data = await response.json();
      if (typeof data?.detail === "string") {
        detail = data.detail;
      }
    } catch {
      // Ignore malformed error bodies.
    }
    throw new Error(detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function sortBooks(books: Book[]) {
  return [...books].sort((a, b) => a.order - b.order || a.id - b.id);
}

function sortChapters(chapters: ChapterItem[]) {
  return [...chapters].sort(
    (a, b) =>
      a.order - b.order ||
      a.title.localeCompare(b.title, "ko") ||
      a.id - b.id,
  );
}

export default function AdminBooks() {
  const [books, setBooks] = useState<Book[]>([]);
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [bookTitle, setBookTitle] = useState("");
  const [bookDescription, setBookDescription] = useState("");
  const [bookVisible, setBookVisible] = useState(true);

  const [chapterModalOpen, setChapterModalOpen] = useState(false);
  const [editingChapter, setEditingChapter] =
    useState<ChapterItem | null>(null);
  const [chapterBookId, setChapterBookId] = useState(0);
  const [chapterTitle, setChapterTitle] = useState("");
  const [chapterSubtitle, setChapterSubtitle] = useState("");
  const [chapterBody, setChapterBody] = useState("");
  const [chapterVisible, setChapterVisible] = useState(true);

  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((type: Notice["type"], text: string) => {
    if (noticeTimer.current) {
      clearTimeout(noticeTimer.current);
    }
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
      setChapters(sortChapters(chapterData));
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

  const sortedBooks = useMemo(() => sortBooks(books), [books]);

  const chaptersByBook = useMemo(() => {
    const map = new Map<number, ChapterItem[]>();
    for (const book of sortedBooks) {
      map.set(
        book.id,
        sortChapters(
          chapters.filter((chapter) => chapter.book_id === book.id),
        ),
      );
    }
    return map;
  }, [chapters, sortedBooks]);

  const openCreateBook = () => {
    setEditingBook(null);
    setBookTitle("");
    setBookDescription("");
    setBookVisible(true);
    setBookModalOpen(true);
  };

  const openEditBook = (book: Book) => {
    setEditingBook(book);
    setBookTitle(book.title);
    setBookDescription(book.description ?? "");
    setBookVisible(book.visible !== false);
    setBookModalOpen(true);
  };

  const closeBookModal = useCallback(() => {
    setBookModalOpen(false);
    setEditingBook(null);
  }, []);

  const handleBookSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = bookTitle.trim();
    if (!title) {
      notify("error", "책 제목을 입력해주세요.");
      return;
    }

    setSaving(true);
    try {
      if (editingBook) {
        await apiFetch(`/api/books/${editingBook.id}`, {
          method: "PUT",
          body: JSON.stringify({
            title,
            description: bookDescription.trim() || null,
            visible: bookVisible,
          }),
        });
      } else {
        await apiFetch("/api/books", {
          method: "POST",
          body: JSON.stringify({
            title,
            description: bookDescription.trim() || null,
            order: sortedBooks.length,
            visible: bookVisible,
          }),
        });
      }
      closeBookModal();
      await load();
      notify("success", "책을 저장했습니다.");
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "책을 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  const openCreateChapter = (bookId: number) => {
    setEditingChapter(null);
    setChapterBookId(bookId);
    setChapterTitle("");
    setChapterSubtitle("");
    setChapterBody("");
    setChapterVisible(true);
    setChapterModalOpen(true);
  };

  const openEditChapter = (chapter: ChapterItem) => {
    setEditingChapter(chapter);
    setChapterBookId(chapter.book_id);
    setChapterTitle(chapter.title);
    setChapterSubtitle(chapter.subtitle ?? "");
    setChapterBody(chapter.body ?? "");
    setChapterVisible(chapter.visible !== false);
    setChapterModalOpen(true);
  };

  const closeChapterModal = useCallback(() => {
    setChapterModalOpen(false);
    setEditingChapter(null);
  }, []);

  useEffect(() => {
    if (!bookModalOpen && !chapterModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeBookModal();
        closeChapterModal();
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [bookModalOpen, chapterModalOpen, closeBookModal, closeChapterModal]);

  const handleChapterSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = chapterTitle.trim();
    if (!title) {
      notify("error", "챕터 제목을 입력해주세요.");
      return;
    }
    if (!chapterBookId) {
      notify("error", "책을 선택해주세요.");
      return;
    }

    const bookChapters = chaptersByBook.get(chapterBookId) ?? [];
    const order =
      editingChapter && editingChapter.book_id === chapterBookId
        ? editingChapter.order
        : bookChapters.length;
    const plainBody = chapterBody.replace(/<[^>]*>/g, "").trim();
    const body = plainBody ? chapterBody : null;

    setSaving(true);
    try {
      if (editingChapter) {
        await apiFetch(`/api/chapters/${editingChapter.id}`, {
          method: "PUT",
          body: JSON.stringify({
            book_id: chapterBookId,
            title,
            subtitle: chapterSubtitle.trim() || null,
            body,
            order,
            visible: chapterVisible,
          }),
        });
      } else {
        await apiFetch("/api/chapters", {
          method: "POST",
          body: JSON.stringify({
            book_id: chapterBookId,
            title,
            subtitle: chapterSubtitle.trim() || null,
            body,
            order,
            visible: chapterVisible,
          }),
        });
      }
      closeChapterModal();
      await load();
      notify("success", "챕터를 저장했습니다.");
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "챕터를 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBook = async (book: Book) => {
    const count = chaptersByBook.get(book.id)?.length ?? 0;
    if (
      !window.confirm(
        `'${book.title}' 책과 챕터 ${count}개를 모두 삭제할까요?`,
      )
    ) {
      return;
    }
    try {
      await apiFetch(`/api/books/${book.id}`, { method: "DELETE" });
      await load();
      notify("success", "책을 삭제했습니다.");
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "책을 삭제하지 못했습니다.",
      );
    }
  };

  const handleDeleteChapter = async (chapter: ChapterItem) => {
    if (!window.confirm(`'${chapter.title}' 챕터를 삭제할까요?`)) {
      return;
    }
    try {
      await apiFetch(`/api/chapters/${chapter.id}`, { method: "DELETE" });
      await load();
      notify("success", "챕터를 삭제했습니다.");
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "챕터를 삭제하지 못했습니다.",
      );
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

  const moveChapter = async (
    chapter: ChapterItem,
    direction: -1 | 1,
  ) => {
    const bookChapters = chaptersByBook.get(chapter.book_id) ?? [];
    const index = bookChapters.findIndex((item) => item.id === chapter.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= bookChapters.length) return;

    const next = [...bookChapters];
    [next[index], next[target]] = [next[target], next[index]];
    const items = next.map((item, order) => ({
      id: item.id,
      order,
      book_id: chapter.book_id,
    }));
    setChapters((prev) =>
      prev.map((item) => {
        const changed = items.find((entry) => entry.id === item.id);
        return changed ? { ...item, order: changed.order } : item;
      }),
    );

    try {
      await apiFetch("/api/chapters/reorder", {
        method: "PUT",
        body: JSON.stringify({ items }),
      });
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "챕터 순서를 저장하지 못했습니다.",
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
            책과 챕터를 관리합니다. 챕터 본문은 리치 텍스트로 작성할 수
            있습니다.
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
        <div className="admin-books-list">
          {sortedBooks.map((book, bookIndex) => {
            const bookChapters = chaptersByBook.get(book.id) ?? [];
            return (
              <section className="admin-books-shelf" key={book.id}>
                <div className="admin-books-shelf-header">
                  <div className="admin-books-shelf-title">
                    <h2>{book.title}</h2>
                    {book.description ? <p>{book.description}</p> : null}
                  </div>
                  <div className="admin-books-badges">
                    {book.visible === false ? (
                      <span className="admin-book-badge">비공개</span>
                    ) : null}
                    <span className="admin-book-badge">
                      {bookChapters.length}챕터
                    </span>
                  </div>
                  <div className="admin-books-row-actions">
                    <button
                      type="button"
                      className="admin-button"
                      onClick={() => moveBook(book, -1)}
                      disabled={bookIndex === 0}
                      aria-label="책 위로"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="admin-button"
                      onClick={() => moveBook(book, 1)}
                      disabled={bookIndex === sortedBooks.length - 1}
                      aria-label="책 아래로"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="admin-button"
                      onClick={() => openEditBook(book)}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      className="admin-button danger"
                      onClick={() => handleDeleteBook(book)}
                    >
                      삭제
                    </button>
                    <button
                      type="button"
                      className="admin-button"
                      onClick={() => openCreateChapter(book.id)}
                    >
                      챕터 추가
                    </button>
                  </div>
                </div>

                <div className="admin-books-books">
                  {bookChapters.length === 0 ? (
                    <p className="admin-books-empty">
                      등록된 챕터가 없습니다.
                    </p>
                  ) : (
                    bookChapters.map((chapter, chapterIndex) => (
                      <div className="admin-books-book" key={chapter.id}>
                        <div className="admin-books-book-info">
                          <strong>{chapter.title}</strong>
                          {chapter.subtitle ? (
                            <span>{chapter.subtitle}</span>
                          ) : null}
                        </div>
                        <div className="admin-books-badges">
                          {chapter.visible === false ? (
                            <span className="admin-book-badge">비공개</span>
                          ) : null}
                        </div>
                        <div className="admin-books-book-actions">
                          <button
                            type="button"
                            className="admin-button"
                            onClick={() => moveChapter(chapter, -1)}
                            disabled={chapterIndex === 0}
                            aria-label="챕터 위로"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="admin-button"
                            onClick={() => moveChapter(chapter, 1)}
                            disabled={
                              chapterIndex === bookChapters.length - 1
                            }
                            aria-label="챕터 아래로"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="admin-button"
                            onClick={() => openEditChapter(chapter)}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            className="admin-button danger"
                            onClick={() => handleDeleteChapter(chapter)}
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {bookModalOpen ? (
        <div
          className="admin-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeBookModal();
          }}
        >
          <div className="admin-modal" role="dialog" aria-modal="true">
            <div className="admin-modal-header">
              <h2>{editingBook ? "책 수정" : "새 책"}</h2>
              <button
                type="button"
                className="admin-modal-close"
                onClick={closeBookModal}
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
                onClick={closeBookModal}
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

      {chapterModalOpen ? (
        <div
          className="admin-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeChapterModal();
          }}
        >
          <div className="admin-modal" role="dialog" aria-modal="true">
            <div className="admin-modal-header">
              <h2>{editingChapter ? "챕터 수정" : "새 챕터"}</h2>
              <button
                type="button"
                className="admin-modal-close"
                onClick={closeChapterModal}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <form
              id="chapter-form"
              className="admin-modal-body admin-books-modal-form"
              onSubmit={handleChapterSubmit}
            >
              <div className="admin-books-modal-meta">
                <label className="admin-field">
                  <span>책</span>
                  <select
                    value={chapterBookId}
                    onChange={(event) =>
                      setChapterBookId(Number(event.target.value))
                    }
                  >
                    {sortedBooks.map((book) => (
                      <option key={book.id} value={book.id}>
                        {book.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-books-checkbox">
                  <input
                    type="checkbox"
                    checked={chapterVisible}
                    onChange={(event) =>
                      setChapterVisible(event.target.checked)
                    }
                  />
                  <span>공개</span>
                </label>
              </div>
              <label className="admin-field">
                <span>챕터 제목</span>
                <input
                  value={chapterTitle}
                  onChange={(event) => setChapterTitle(event.target.value)}
                  placeholder="챕터 제목"
                  required
                />
              </label>
              <label className="admin-field">
                <span>부제</span>
                <input
                  value={chapterSubtitle}
                  onChange={(event) =>
                    setChapterSubtitle(event.target.value)
                  }
                  placeholder="부제 (선택)"
                />
              </label>
              <div className="admin-field">
                <span>본문</span>
                <RichTextEditor
                  value={chapterBody}
                  onChange={setChapterBody}
                  placeholder="챕터 본문을 입력해주세요."
                />
              </div>
            </form>
            <div className="admin-modal-footer">
              <button
                type="button"
                className="admin-button"
                onClick={closeChapterModal}
                disabled={saving}
              >
                취소
              </button>
              <button
                type="submit"
                form="chapter-form"
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
