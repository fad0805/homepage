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
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Pagination } from "@/components/pagination";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";

import "@/public/styles/admin/books.scss";

interface Book {
  id: number;
  title: string;
  description: string | null;
  tags: string[];
  order: number;
  visible: boolean;
  created_at: string | null;
  updated_at: string | null;
}

interface ChapterItem {
  id: number;
  book_id: number;
  updated_at: string | null;
}

type Notice = { type: "success" | "error"; text: string };

const BOOKS_PER_PAGE = 10;

function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function sortBooks(books: Book[]) {
  return [...books].sort((a, b) => {
    const aPrivate = a.visible === false ? 1 : 0;
    const bPrivate = b.visible === false ? 1 : 0;
    return (
      aPrivate - bPrivate ||
      a.order - b.order ||
      a.id - b.id
    );
  });
}

function SortableBookRow({
  book,
  chapterCount,
  latestChapterUpdated,
}: {
  book: Book;
  chapterCount: number;
  latestChapterUpdated: string | null;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: book.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 2 : undefined,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`admin-book-card${isDragging ? " is-dragging" : ""}`}
    >
      <button
        type="button"
        className="admin-book-card__drag"
        aria-label={`${book.title} 순서 이동`}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <div className="admin-book-card__header">
        <div className="admin-book-card__title">
          <Link href={`/admin/books/${book.id}`}>{book.title}</Link>
          {book.description ? <p>{book.description}</p> : null}
          <p className="admin-book-card__updated">
            {latestChapterUpdated
              ? `최근 게시글 ${formatDateTime(latestChapterUpdated)}`
              : "게시글 없음"}
          </p>
        </div>
        <div className="admin-book-card__meta">
          {book.visible === false ? (
            <span className="admin-book-badge">비공개</span>
          ) : null}
          <span className="admin-book-badge">{chapterCount}챕터</span>
        </div>
      </div>
      <div className="admin-book-card__actions">
        <Link className="admin-button" href={`/admin/books/${book.id}`}>
          관리
        </Link>
      </div>
    </article>
  );
}

export default function AdminBooks() {
  const [books, setBooks] = useState<Book[]>([]);
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderDirty, setOrderDirty] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [bookTitle, setBookTitle] = useState("");
  const [bookDescription, setBookDescription] = useState("");
  const [bookTags, setBookTags] = useState("");
  const [bookVisible, setBookVisible] = useState(true);

  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

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
      setOrderDirty(false);
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

  const totalPages = Math.max(
    1,
    Math.ceil(sortedBooks.length / BOOKS_PER_PAGE),
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (!orderDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [orderDirty]);

  const pageBooks = useMemo(
    () =>
      sortedBooks.slice(
        (page - 1) * BOOKS_PER_PAGE,
        page * BOOKS_PER_PAGE,
      ),
    [page, sortedBooks],
  );

  const chapterStats = useMemo(() => {
    const counts = new Map<number, number>();
    const latest = new Map<number, string>();
    for (const chapter of chapters) {
      counts.set(chapter.book_id, (counts.get(chapter.book_id) ?? 0) + 1);
      if (!chapter.updated_at) continue;
      const current = latest.get(chapter.book_id);
      if (
        !current ||
        new Date(chapter.updated_at) > new Date(current)
      ) {
        latest.set(chapter.book_id, chapter.updated_at);
      }
    }
    return { counts, latest };
  }, [chapters]);

  const openCreateBook = () => {
    setBookTitle("");
    setBookDescription("");
    setBookTags("");
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
          tags: parseTags(bookTags),
          order: sortedBooks.length,
          visible: bookVisible,
        }),
      });
      setBookModalOpen(false);
      await load();
      setPage(1);
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

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const pageStart = (page - 1) * BOOKS_PER_PAGE;
    const pageItems = sortedBooks.slice(
      pageStart,
      pageStart + BOOKS_PER_PAGE,
    );
    const oldIndex = pageItems.findIndex((book) => book.id === active.id);
    const newIndex = pageItems.findIndex((book) => book.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const moved = arrayMove(pageItems, oldIndex, newIndex);
    const next = [...sortedBooks];
    next.splice(pageStart, pageItems.length, ...moved);

    // Private books always stay at the end of the entire list.
    const publicBooks = next.filter((book) => book.visible !== false);
    const privateBooks = next.filter((book) => book.visible === false);
    const reordered = [...publicBooks, ...privateBooks].map(
      (book, order) => ({ ...book, order }),
    );

    setBooks(reordered);
    setOrderDirty(true);
  };

  const saveOrder = async () => {
    if (!orderDirty || savingOrder) return;
    setSavingOrder(true);
    try {
      await apiFetch("/api/books/reorder", {
        method: "PUT",
        body: JSON.stringify({
          items: sortedBooks.map((book, order) => ({
            id: book.id,
            order,
          })),
        }),
      });
      setOrderDirty(false);
      notify("success", "책 순서를 저장했습니다.");
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "책 순서를 저장하지 못했습니다.",
      );
    } finally {
      setSavingOrder(false);
    }
  };

  const handleReload = () => {
    if (
      orderDirty &&
      !window.confirm(
        "저장하지 않은 책 순서 변경이 있습니다. 새로고침할까요?",
      )
    ) {
      return;
    }
    load();
  };

  return (
    <div id="admin-books">
      <header className="admin-books-toolbar">
        <div>
          <h1>책장 관리</h1>
          <p className="admin-books-hint">
            책을 선택해 상세 페이지에서 책 정보와 챕터를 관리합니다. 드래그로
            책 순서를 바꾼 뒤 저장해주세요.
          </p>
          {orderDirty ? (
            <p className="admin-books-dirty">
              저장하지 않은 책 순서가 있습니다.
            </p>
          ) : null}
        </div>
        <div className="admin-books-actions">
          <button
            type="button"
            className="admin-button"
            onClick={handleReload}
            disabled={loading}
          >
            새로고침
          </button>
          {orderDirty ? (
            <button
              type="button"
              className="admin-button primary"
              onClick={saveOrder}
              disabled={savingOrder}
            >
              {savingOrder ? "저장 중..." : "순서 저장"}
            </button>
          ) : null}
          <button
            type="button"
            className="admin-button primary"
            onClick={openCreateBook}
            disabled={orderDirty}
            title={
              orderDirty ? "책 순서를 먼저 저장해주세요." : undefined
            }
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
        <>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={pageBooks.map((book) => book.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="admin-books-grid">
                {pageBooks.map((book) => (
                  <SortableBookRow
                    key={book.id}
                    book={book}
                    chapterCount={chapterStats.counts.get(book.id) ?? 0}
                    latestChapterUpdated={
                      chapterStats.latest.get(book.id) ?? null
                    }
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={setPage}
          />
        </>
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
              <label className="admin-field">
                <span>태그</span>
                <input
                  value={bookTags}
                  onChange={(event) => setBookTags(event.target.value)}
                  placeholder="쉼표로 구분 (선택)"
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
