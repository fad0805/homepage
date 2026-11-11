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
  type CollisionDetection,
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

import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";

import "@/public/styles/admin/books.scss";

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
  protected: boolean;
  created_at: string | null;
  updated_at: string | null;
}

interface ChapterItem {
  id: number;
  book_id: number;
  updated_at: string | null;
}

type Notice = { type: "success" | "error"; text: string };

const BOOK_TYPE = "book";
const BOOK_CATEGORY_TYPE = "book-category";

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
  } = useSortable({
    id: `${BOOK_TYPE}-${book.id}`,
    data: {
      type: BOOK_TYPE,
      bookId: book.id,
      categoryId: book.category_id,
    },
  });

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
          ) : book.protected ? (
            <span className="admin-book-badge">보호</span>
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

function SortableBookGroup({
  category,
  books,
  chapterCounts,
  latestChapterUpdates,
  onEditCategory,
  onDeleteCategory,
}: {
  category: BookCategory | null;
  books: Book[];
  chapterCounts: Map<number, number>;
  latestChapterUpdates: Map<number, string>;
  onEditCategory: (category: BookCategory) => void;
  onDeleteCategory: (category: BookCategory) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: category
      ? `${BOOK_CATEGORY_TYPE}-${category.id}`
      : "book-category-none",
    data: {
      type: BOOK_CATEGORY_TYPE,
      categoryId: category?.id ?? null,
    },
    disabled: !category,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 2 : undefined,
  };

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={`admin-books-group${isDragging ? " is-dragging" : ""}`}
    >
      <header className="admin-books-group-header">
        {category ? (
          <button
            type="button"
            className="admin-drag-handle"
            aria-label={`${category.name} 카테고리 순서 변경`}
            {...attributes}
            {...listeners}
          >
            ⠿
          </button>
        ) : null}
        <h2>{category ? category.name : "카테고리 없음"}</h2>
        <span className="admin-books-group-count">{books.length}권</span>
        {category ? (
          <div className="admin-books-group-actions">
            <button
              type="button"
              onClick={() => onEditCategory(category)}
            >
              이름 변경
            </button>
            <button
              type="button"
              className="danger"
              disabled={books.length > 0}
              title={
                books.length > 0
                  ? "책이 남아 있는 카테고리는 삭제할 수 없습니다."
                  : undefined
              }
              onClick={() => onDeleteCategory(category)}
            >
              삭제
            </button>
          </div>
        ) : null}
      </header>

      {books.length === 0 ? (
        <p className="admin-books-empty">책이 없습니다.</p>
      ) : (
        <SortableContext
          items={books.map((book) => `${BOOK_TYPE}-${book.id}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="admin-books-grid">
            {books.map((book) => (
              <SortableBookRow
                key={book.id}
                book={book}
                chapterCount={chapterCounts.get(book.id) ?? 0}
                latestChapterUpdated={
                  latestChapterUpdates.get(book.id) ?? null
                }
              />
            ))}
          </div>
        </SortableContext>
      )}
    </section>
  );
}

export default function AdminBooks() {
  const [books, setBooks] = useState<Book[]>([]);
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderDirty, setOrderDirty] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [bookTitle, setBookTitle] = useState("");
  const [bookDescription, setBookDescription] = useState("");
  const [bookTags, setBookTags] = useState("");
  const [bookCategoryId, setBookCategoryId] = useState<number | null>(null);
  const [bookVisible, setBookVisible] = useState(true);
  const [bookProtected, setBookProtected] = useState(false);

  const [categories, setCategories] = useState<BookCategory[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(
    null,
  );
  const [categorySaving, setCategorySaving] = useState(false);

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
      const [bookData, chapterData, categoryData] = await Promise.all([
        apiFetch<Book[]>("/api/books"),
        apiFetch<ChapterItem[]>("/api/chapters"),
        apiFetch<BookCategory[]>("/api/books/categories"),
      ]);
      setBooks(sortBooks(bookData));
      setChapters(chapterData);
      setCategories(categoryData);
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

  useEffect(() => {
    if (!categoryModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCategoryModalOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [categoryModalOpen]);

  const sortedBooks = useMemo(() => sortBooks(books), [books]);

  const sortedCategories = useMemo(
    () =>
      [...categories].sort(
        (a, b) => a.order - b.order || a.id - b.id,
      ),
    [categories],
  );

  const groups = useMemo(() => {
    const uncategorized = sortedBooks.filter(
      (book) => book.category_id === null || !book.category,
    );
    const result: { category: BookCategory | null; books: Book[] }[] = [];
    if (uncategorized.length > 0) {
      result.push({ category: null, books: uncategorized });
    }
    for (const category of sortedCategories) {
      result.push({
        category,
        books: sortedBooks.filter(
          (book) => book.category_id === category.id,
        ),
      });
    }
    return result;
  }, [sortedBooks, sortedCategories]);

  const displayGroups = useMemo(() => {
    if (categoryFilter === "all") return groups;
    if (categoryFilter === "none") {
      return groups.filter((group) => group.category === null);
    }
    const categoryId = Number(categoryFilter);
    return groups.filter((group) => group.category?.id === categoryId);
  }, [categoryFilter, groups]);

  useEffect(() => {
    if (categoryFilter === "all") return;
    if (categoryFilter === "none") {
      if (!groups.some((group) => group.category === null)) {
        setCategoryFilter("all");
      }
      return;
    }
    const categoryId = Number(categoryFilter);
    if (!sortedCategories.some((category) => category.id === categoryId)) {
      setCategoryFilter("all");
    }
  }, [categoryFilter, groups, sortedCategories]);

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
    setBookCategoryId(null);
    setBookVisible(true);
    setBookProtected(false);
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
          category_id: bookCategoryId,
          order: sortedBooks.length,
          visible: bookVisible,
          protected: bookProtected,
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

  const openCategoryModal = () => {
    setCategoryName("");
    setEditingCategoryId(null);
    setCategoryModalOpen(true);
  };

  const resetCategoryForm = () => {
    setCategoryName("");
    setEditingCategoryId(null);
  };

  const handleCategorySubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    const name = categoryName.trim();
    if (!name) {
      notify("error", "카테고리 이름을 입력해주세요.");
      return;
    }

    const isEditing = editingCategoryId !== null;
    setCategorySaving(true);
    try {
      if (isEditing) {
        const updated = await apiFetch<BookCategory>(
          `/api/books/categories/${editingCategoryId}`,
          {
            method: "PUT",
            body: JSON.stringify({ name }),
          },
        );
        setCategories((prev) =>
          prev.map((category) =>
            category.id === updated.id
              ? { ...category, name: updated.name }
              : category,
          ),
        );
        setBooks((prev) =>
          prev.map((book) =>
            book.category?.id === updated.id
              ? {
                  ...book,
                  category: {
                    ...book.category,
                    name: updated.name,
                  },
                }
              : book,
          ),
        );
        notify("success", "카테고리 이름을 변경했습니다.");
      } else {
        const created = await apiFetch<BookCategory>(
          "/api/books/categories",
          {
            method: "POST",
            body: JSON.stringify({ name }),
          },
        );
        setCategories((prev) => [...prev, created]);
        notify("success", "카테고리를 추가했습니다.");
      }
      resetCategoryForm();
      setCategoryModalOpen(false);
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "카테고리를 저장하지 못했습니다.",
      );
    } finally {
      setCategorySaving(false);
    }
  };

  const openEditCategory = (category: BookCategory) => {
    setEditingCategoryId(category.id);
    setCategoryName(category.name);
    setCategoryModalOpen(true);
  };

  const handleDeleteCategory = async (category: BookCategory) => {
    if (!window.confirm(`'${category.name}' 카테고리를 삭제할까요?`)) {
      return;
    }
    try {
      await apiFetch(`/api/books/categories/${category.id}`, {
        method: "DELETE",
      });
      setCategories((prev) =>
        prev.filter((item) => item.id !== category.id),
      );
      if (bookCategoryId === category.id) setBookCategoryId(null);
      if (editingCategoryId === category.id) resetCategoryForm();
      notify("success", "카테고리를 삭제했습니다.");
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "카테고리를 삭제하지 못했습니다.",
      );
    }
  };

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const activeType = args.active.data.current?.type;
    const activeCategoryId =
      args.active.data.current?.categoryId ?? null;

    const droppableContainers = args.droppableContainers.filter(
      (container) => {
        const data = container.data.current;
        if (!data || data.type !== activeType) {
          return false;
        }
        if (activeType === BOOK_TYPE) {
          return (data.categoryId ?? null) === activeCategoryId;
        }
        return true;
      },
    );

    return closestCenter({ ...args, droppableContainers });
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeData = active.data.current;

    if (activeData?.type === BOOK_CATEGORY_TYPE) {
      const oldIndex = categories.findIndex(
        (category) =>
          `${BOOK_CATEGORY_TYPE}-${category.id}` === active.id,
      );
      const newIndex = categories.findIndex(
        (category) =>
          `${BOOK_CATEGORY_TYPE}-${category.id}` === over.id,
      );
      if (oldIndex < 0 || newIndex < 0) return;

      setCategories(
        arrayMove(categories, oldIndex, newIndex).map(
          (category, index) => ({ ...category, order: index }),
        ),
      );
      setOrderDirty(true);
      return;
    }

    if (activeData?.type !== BOOK_TYPE) return;

    const categoryId = activeData.categoryId ?? null;
    const group = groups.find(
      (item) => (item.category?.id ?? null) === categoryId,
    );
    if (!group) return;

    const oldIndex = group.books.findIndex(
      (book) => `${BOOK_TYPE}-${book.id}` === active.id,
    );
    const newIndex = group.books.findIndex(
      (book) => `${BOOK_TYPE}-${book.id}` === over.id,
    );
    if (oldIndex < 0 || newIndex < 0) return;

    const moved = arrayMove(group.books, oldIndex, newIndex);

    // Private books always stay at the end of their category.
    const publicBooks = moved.filter((book) => book.visible !== false);
    const privateBooks = moved.filter((book) => book.visible === false);
    const reordered = [...publicBooks, ...privateBooks].map(
      (book, order) => ({ ...book, order }),
    );

    const reorderedIds = new Set(reordered.map((book) => book.id));
    setBooks((prev) => [
      ...prev.filter((book) => !reorderedIds.has(book.id)),
      ...reordered,
    ]);
    setOrderDirty(true);
  };

  const saveOrder = async () => {
    if (!orderDirty || savingOrder) return;
    setSavingOrder(true);
    try {
      await apiFetch("/api/books/categories/reorder", {
        method: "PUT",
        body: JSON.stringify({
          items: sortedCategories.map((category, order) => ({
            id: category.id,
            order,
          })),
        }),
      });

      const orderedBooks = groups.flatMap((group) => group.books);
      await apiFetch("/api/books/reorder", {
        method: "PUT",
        body: JSON.stringify({
          items: orderedBooks.map((book, order) => ({
            id: book.id,
            order,
          })),
        }),
      });

      setOrderDirty(false);
      notify("success", "순서를 저장했습니다.");
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "순서를 저장하지 못했습니다.",
      );
    } finally {
      setSavingOrder(false);
    }
  };

  const handleReload = () => {
    if (
      orderDirty &&
      !window.confirm(
        "저장하지 않은 순서 변경이 있습니다. 새로고침할까요?",
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
            카테고리와 책 순서를 바꾼 뒤 저장해주세요. 카테고리를 만들어 책을
            분류할 수 있습니다.
          </p>
          {orderDirty ? (
            <p className="admin-books-dirty">
              저장하지 않은 순서 변경이 있습니다.
            </p>
          ) : null}
        </div>
        <div className="admin-books-actions">
          <label className="admin-filter">
            <span>카테고리</span>
            <select
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(event.target.value)
              }
            >
              <option value="all">전체 카테고리</option>
              {groups.some((group) => group.category === null) ? (
                <option value="none">카테고리 없음</option>
              ) : null}
              {sortedCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="admin-button"
            onClick={handleReload}
            disabled={loading}
          >
            새로고침
          </button>
          <button
            type="button"
            className="admin-button"
            onClick={openCategoryModal}
          >
            카테고리 추가
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
      ) : displayGroups.length === 0 ? (
        <p className="admin-books-empty">
          {groups.length === 0
            ? "책이 없습니다. 새 책을 추가해주세요."
            : "선택한 카테고리에 책이 없습니다."}
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={displayGroups.flatMap((group) =>
              group.category
                ? [`${BOOK_CATEGORY_TYPE}-${group.category.id}`]
                : [],
            )}
            strategy={verticalListSortingStrategy}
          >
            <div className="admin-books-groups">
              {displayGroups.map((group) => (
                <SortableBookGroup
                  key={group.category?.id ?? "none"}
                  category={group.category}
                  books={group.books}
                  chapterCounts={chapterStats.counts}
                  latestChapterUpdates={chapterStats.latest}
                  onEditCategory={openEditCategory}
                  onDeleteCategory={handleDeleteCategory}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
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
              <label className="admin-field">
                <span>카테고리</span>
                <select
                  value={bookCategoryId ?? ""}
                  onChange={(event) =>
                    setBookCategoryId(
                      event.target.value
                        ? Number(event.target.value)
                        : null,
                    )
                  }
                >
                  <option value="">카테고리 없음</option>
                  {sortedCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-books-checkbox">
                <span>공개 상태</span>
                <select
                  value={
                    !bookVisible
                      ? "private"
                      : bookProtected
                        ? "protected"
                        : "public"
                  }
                  onChange={(event) => {
                    const value = event.target.value;
                    setBookVisible(value !== "private");
                    setBookProtected(value === "protected");
                  }}
                >
                  <option value="public">공개</option>
                  <option value="protected">보호</option>
                  <option value="private">비공개</option>
                </select>
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

      {categoryModalOpen ? (
        <div
          className="admin-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setCategoryModalOpen(false);
            }
          }}
        >
          <div
            className="admin-modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              editingCategoryId !== null
                ? "카테고리 이름 변경"
                : "카테고리 추가"
            }
          >
            <div className="admin-modal-header">
              <h2>
                {editingCategoryId !== null
                  ? "카테고리 이름 변경"
                  : "카테고리 추가"}
              </h2>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setCategoryModalOpen(false)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <form
              id="category-form"
              className="admin-modal-body admin-books-modal-form"
              onSubmit={handleCategorySubmit}
            >
              <label className="admin-field">
                <span>카테고리 이름</span>
                <input
                  value={categoryName}
                  onChange={(event) =>
                    setCategoryName(event.target.value)
                  }
                  placeholder="예: 단편"
                  required
                  autoFocus
                />
              </label>
            </form>
            <div className="admin-modal-footer">
              <button
                type="button"
                className="admin-button"
                onClick={() => setCategoryModalOpen(false)}
                disabled={categorySaving}
              >
                취소
              </button>
              <button
                type="submit"
                form="category-form"
                className="admin-button primary"
                disabled={categorySaving}
              >
                {categorySaving
                  ? "저장 중..."
                  : editingCategoryId !== null
                    ? "이름 변경"
                    : "추가"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
