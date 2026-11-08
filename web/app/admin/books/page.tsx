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

interface Bookshelf {
  id: number;
  title: string;
  description: string | null;
  order: number;
  visible: boolean;
}

interface BookItem {
  id: number;
  bookshelf_id: number;
  title: string;
  subtitle: string | null;
  body: string | null;
  order: number;
  visible: boolean;
  bookshelf: { id: number; title: string } | null;
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

function sortShelves(shelves: Bookshelf[]) {
  return [...shelves].sort((a, b) => a.order - b.order || a.id - b.id);
}

function sortBooks(books: BookItem[]) {
  return [...books].sort(
    (a, b) =>
      a.order - b.order ||
      a.title.localeCompare(b.title, "ko") ||
      a.id - b.id,
  );
}

export default function AdminBooks() {
  const [shelves, setShelves] = useState<Bookshelf[]>([]);
  const [books, setBooks] = useState<BookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [shelfModalOpen, setShelfModalOpen] = useState(false);
  const [editingShelf, setEditingShelf] = useState<Bookshelf | null>(null);
  const [shelfTitle, setShelfTitle] = useState("");
  const [shelfDescription, setShelfDescription] = useState("");
  const [shelfVisible, setShelfVisible] = useState(true);

  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<BookItem | null>(null);
  const [bookShelfId, setBookShelfId] = useState(0);
  const [bookTitle, setBookTitle] = useState("");
  const [bookSubtitle, setBookSubtitle] = useState("");
  const [bookBody, setBookBody] = useState("");
  const [bookVisible, setBookVisible] = useState(true);

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
      const [shelfData, bookData] = await Promise.all([
        apiFetch<Bookshelf[]>("/api/books/shelves"),
        apiFetch<BookItem[]>("/api/books"),
      ]);
      setShelves(sortShelves(shelfData));
      setBooks(sortBooks(bookData));
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

  const sortedShelves = useMemo(() => sortShelves(shelves), [shelves]);

  const booksByShelf = useMemo(() => {
    const map = new Map<number, BookItem[]>();
    for (const shelf of sortedShelves) {
      map.set(
        shelf.id,
        sortBooks(books.filter((book) => book.bookshelf_id === shelf.id)),
      );
    }
    return map;
  }, [books, sortedShelves]);

  const openCreateShelf = () => {
    setEditingShelf(null);
    setShelfTitle("");
    setShelfDescription("");
    setShelfVisible(true);
    setShelfModalOpen(true);
  };

  const openEditShelf = (shelf: Bookshelf) => {
    setEditingShelf(shelf);
    setShelfTitle(shelf.title);
    setShelfDescription(shelf.description ?? "");
    setShelfVisible(shelf.visible !== false);
    setShelfModalOpen(true);
  };

  const closeShelfModal = useCallback(() => {
    setShelfModalOpen(false);
    setEditingShelf(null);
  }, []);

  const handleShelfSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = shelfTitle.trim();
    if (!title) {
      notify("error", "책장 이름을 입력해주세요.");
      return;
    }

    setSaving(true);
    try {
      if (editingShelf) {
        await apiFetch(`/api/books/shelves/${editingShelf.id}`, {
          method: "PUT",
          body: JSON.stringify({
            title,
            description: shelfDescription.trim() || null,
            visible: shelfVisible,
          }),
        });
      } else {
        await apiFetch("/api/books/shelves", {
          method: "POST",
          body: JSON.stringify({
            title,
            description: shelfDescription.trim() || null,
            order: sortedShelves.length,
            visible: shelfVisible,
          }),
        });
      }
      closeShelfModal();
      await load();
      notify("success", "책장을 저장했습니다.");
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "책장을 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  const openCreateBook = (shelfId: number) => {
    setEditingBook(null);
    setBookShelfId(shelfId);
    setBookTitle("");
    setBookSubtitle("");
    setBookBody("");
    setBookVisible(true);
    setBookModalOpen(true);
  };

  const openEditBook = (book: BookItem) => {
    setEditingBook(book);
    setBookShelfId(book.bookshelf_id);
    setBookTitle(book.title);
    setBookSubtitle(book.subtitle ?? "");
    setBookBody(book.body ?? "");
    setBookVisible(book.visible !== false);
    setBookModalOpen(true);
  };

  const closeBookModal = useCallback(() => {
    setBookModalOpen(false);
    setEditingBook(null);
  }, []);

  useEffect(() => {
    if (!shelfModalOpen && !bookModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeShelfModal();
        closeBookModal();
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [shelfModalOpen, bookModalOpen, closeShelfModal, closeBookModal]);

  const handleBookSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = bookTitle.trim();
    if (!title) {
      notify("error", "책 제목을 입력해주세요.");
      return;
    }
    if (!bookShelfId) {
      notify("error", "책장을 선택해주세요.");
      return;
    }

    const shelfBooks = booksByShelf.get(bookShelfId) ?? [];
    const order =
      editingBook && editingBook.bookshelf_id === bookShelfId
        ? editingBook.order
        : shelfBooks.length;
    const plainBody = bookBody.replace(/<[^>]*>/g, "").trim();
    const body = plainBody ? bookBody : null;

    setSaving(true);
    try {
      if (editingBook) {
        await apiFetch(`/api/books/${editingBook.id}`, {
          method: "PUT",
          body: JSON.stringify({
            bookshelf_id: bookShelfId,
            title,
            subtitle: bookSubtitle.trim() || null,
            body,
            order,
            visible: bookVisible,
          }),
        });
      } else {
        await apiFetch("/api/books", {
          method: "POST",
          body: JSON.stringify({
            bookshelf_id: bookShelfId,
            title,
            subtitle: bookSubtitle.trim() || null,
            body,
            order,
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

  const handleDeleteShelf = async (shelf: Bookshelf) => {
    const count = booksByShelf.get(shelf.id)?.length ?? 0;
    if (
      !window.confirm(
        `'${shelf.title}' 책장과 책 ${count}권을 모두 삭제할까요?`,
      )
    ) {
      return;
    }
    try {
      await apiFetch(`/api/books/shelves/${shelf.id}`, {
        method: "DELETE",
      });
      await load();
      notify("success", "책장을 삭제했습니다.");
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "책장을 삭제하지 못했습니다.",
      );
    }
  };

  const handleDeleteBook = async (book: BookItem) => {
    if (!window.confirm(`'${book.title}' 책을 삭제할까요?`)) {
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

  const moveShelf = async (shelf: Bookshelf, direction: -1 | 1) => {
    const index = sortedShelves.findIndex((item) => item.id === shelf.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= sortedShelves.length) return;

    const next = [...sortedShelves];
    [next[index], next[target]] = [next[target], next[index]];
    const reordered = next.map((item, order) => ({ ...item, order }));
    setShelves(reordered);

    try {
      await apiFetch("/api/books/shelves/reorder", {
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
          : "책장 순서를 저장하지 못했습니다.",
      );
      await load();
    }
  };

  const moveBook = async (book: BookItem, direction: -1 | 1) => {
    const shelfBooks = booksByShelf.get(book.bookshelf_id) ?? [];
    const index = shelfBooks.findIndex((item) => item.id === book.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= shelfBooks.length) return;

    const next = [...shelfBooks];
    [next[index], next[target]] = [next[target], next[index]];
    const items = next.map((item, order) => ({
      id: item.id,
      order,
      bookshelf_id: book.bookshelf_id,
    }));
    setBooks((prev) =>
      prev.map((item) => {
        const changed = items.find((entry) => entry.id === item.id);
        return changed ? { ...item, order: changed.order } : item;
      }),
    );

    try {
      await apiFetch("/api/books/reorder", {
        method: "PUT",
        body: JSON.stringify({ items }),
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
            책장과 책을 관리합니다. 책 본문은 리치 텍스트로 작성할 수
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
            onClick={openCreateShelf}
          >
            새 책장
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
      ) : sortedShelves.length === 0 ? (
        <p className="admin-books-empty">
          책장이 없습니다. 새 책장을 추가해주세요.
        </p>
      ) : (
        <div className="admin-books-list">
          {sortedShelves.map((shelf, shelfIndex) => {
            const shelfBooks = booksByShelf.get(shelf.id) ?? [];
            return (
              <section className="admin-books-shelf" key={shelf.id}>
                <div className="admin-books-shelf-header">
                  <div className="admin-books-shelf-title">
                    <h2>{shelf.title}</h2>
                    {shelf.description ? <p>{shelf.description}</p> : null}
                  </div>
                  <div className="admin-books-badges">
                    {shelf.visible === false ? (
                      <span className="admin-book-badge">비공개</span>
                    ) : null}
                    <span className="admin-book-badge">
                      {shelfBooks.length}권
                    </span>
                  </div>
                  <div className="admin-books-row-actions">
                    <button
                      type="button"
                      className="admin-button"
                      onClick={() => moveShelf(shelf, -1)}
                      disabled={shelfIndex === 0}
                      aria-label="책장 위로"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="admin-button"
                      onClick={() => moveShelf(shelf, 1)}
                      disabled={shelfIndex === sortedShelves.length - 1}
                      aria-label="책장 아래로"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="admin-button"
                      onClick={() => openEditShelf(shelf)}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      className="admin-button danger"
                      onClick={() => handleDeleteShelf(shelf)}
                    >
                      삭제
                    </button>
                    <button
                      type="button"
                      className="admin-button"
                      onClick={() => openCreateBook(shelf.id)}
                    >
                      책 추가
                    </button>
                  </div>
                </div>

                <div className="admin-books-books">
                  {shelfBooks.length === 0 ? (
                    <p className="admin-books-empty">
                      등록된 책이 없습니다.
                    </p>
                  ) : (
                    shelfBooks.map((book, bookIndex) => (
                      <div className="admin-books-book" key={book.id}>
                        <div className="admin-books-book-info">
                          <strong>{book.title}</strong>
                          {book.subtitle ? (
                            <span>{book.subtitle}</span>
                          ) : null}
                        </div>
                        <div className="admin-books-badges">
                          {book.visible === false ? (
                            <span className="admin-book-badge">비공개</span>
                          ) : null}
                        </div>
                        <div className="admin-books-book-actions">
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
                            disabled={bookIndex === shelfBooks.length - 1}
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

      {shelfModalOpen ? (
        <div
          className="admin-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeShelfModal();
          }}
        >
          <div className="admin-modal" role="dialog" aria-modal="true">
            <div className="admin-modal-header">
              <h2>{editingShelf ? "책장 수정" : "새 책장"}</h2>
              <button
                type="button"
                className="admin-modal-close"
                onClick={closeShelfModal}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <form
              id="shelf-form"
              className="admin-modal-body admin-books-modal-form"
              onSubmit={handleShelfSubmit}
            >
              <label className="admin-field">
                <span>책장 이름</span>
                <input
                  value={shelfTitle}
                  onChange={(event) => setShelfTitle(event.target.value)}
                  placeholder="예: 단편선"
                  required
                />
              </label>
              <label className="admin-field">
                <span>설명</span>
                <textarea
                  value={shelfDescription}
                  onChange={(event) =>
                    setShelfDescription(event.target.value)
                  }
                  rows={3}
                  placeholder="책장 설명 (선택)"
                />
              </label>
              <label className="admin-books-checkbox">
                <input
                  type="checkbox"
                  checked={shelfVisible}
                  onChange={(event) =>
                    setShelfVisible(event.target.checked)
                  }
                />
                <span>공개</span>
              </label>
            </form>
            <div className="admin-modal-footer">
              <button
                type="button"
                className="admin-button"
                onClick={closeShelfModal}
                disabled={saving}
              >
                취소
              </button>
              <button
                type="submit"
                form="shelf-form"
                className="admin-button primary"
                disabled={saving}
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
              <div className="admin-books-modal-meta">
                <label className="admin-field">
                  <span>책장</span>
                  <select
                    value={bookShelfId}
                    onChange={(event) =>
                      setBookShelfId(Number(event.target.value))
                    }
                  >
                    {sortedShelves.map((shelf) => (
                      <option key={shelf.id} value={shelf.id}>
                        {shelf.title}
                      </option>
                    ))}
                  </select>
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
              </div>
              <label className="admin-field">
                <span>제목</span>
                <input
                  value={bookTitle}
                  onChange={(event) => setBookTitle(event.target.value)}
                  placeholder="책 제목"
                  required
                />
              </label>
              <label className="admin-field">
                <span>부제</span>
                <input
                  value={bookSubtitle}
                  onChange={(event) => setBookSubtitle(event.target.value)}
                  placeholder="부제 (선택)"
                />
              </label>
              <div className="admin-field">
                <span>본문</span>
                <RichTextEditor
                  value={bookBody}
                  onChange={setBookBody}
                  placeholder="책 본문을 입력해주세요."
                />
              </div>
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
    </div>
  );
}
