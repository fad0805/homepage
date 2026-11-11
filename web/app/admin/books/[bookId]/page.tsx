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
import { useParams, useRouter } from "next/navigation";

import { Pagination } from "@/components/pagination";
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
  title: string;
  subtitle: string | null;
  body: string | null;
  tags: string[];
  order: number;
  visible: boolean;
  protected: boolean;
  view_count: number;
  created_at: string | null;
  updated_at: string | null;
  published_at: string | null;
  book: { id: number; title: string } | null;
}

type Notice = { type: "success" | "error"; text: string };

function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

const CHAPTERS_PER_PAGE = 10;

function createdTime(value: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function sortChapters(chapters: ChapterItem[]) {
  return [...chapters].sort((a, b) => {
    const aTime = createdTime(a.created_at);
    const bTime = createdTime(b.created_at);
    if (aTime === null && bTime === null) return b.id - a.id;
    if (aTime === null) return 1;
    if (bTime === null) return -1;
    return bTime - aTime || b.id - a.id;
  });
}

export default function AdminBookDetail() {
  const params = useParams<{ bookId: string }>();
  const router = useRouter();
  const bookId = Number(params.bookId);

  const [book, setBook] = useState<Book | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [categories, setCategories] = useState<BookCategory[]>([]);
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [bulkTargetBookId, setBulkTargetBookId] = useState<number | null>(
    null,
  );
  const [bulkWorking, setBulkWorking] = useState(false);
  const [page, setPage] = useState(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [visible, setVisible] = useState(true);
  const [bookProtected, setBookProtected] = useState(false);
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bookInfoOpen, setBookInfoOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

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
    if (!Number.isFinite(bookId)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [bookData, chapterData, categoryData, bookList] =
        await Promise.all([
          apiFetch<Book>(`/api/books/${bookId}`),
          apiFetch<ChapterItem[]>("/api/chapters"),
          apiFetch<BookCategory[]>("/api/books/categories"),
          apiFetch<Book[]>("/api/books"),
        ]);
      setBook(bookData);
      setTitle(bookData.title);
      setDescription(bookData.description ?? "");
      setTagsInput((bookData.tags ?? []).join(", "));
      setCategoryId(bookData.category_id);
      setVisible(bookData.visible !== false);
      setBookProtected(bookData.protected === true);
      setCategories(categoryData);
      setBooks(bookList);
      setChapters(
        sortChapters(
          chapterData.filter((chapter) => chapter.book_id === bookId),
        ),
      );
      setSelectedChapterIds(new Set());
      setBulkTargetBookId(null);
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "책 정보를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [bookId, notify]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!bookInfoOpen) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBookInfoOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [bookInfoOpen]);

  const totalPages = Math.max(
    1,
    Math.ceil(chapters.length / CHAPTERS_PER_PAGE),
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageChapters = useMemo(
    () =>
      chapters.slice(
        (page - 1) * CHAPTERS_PER_PAGE,
        page * CHAPTERS_PER_PAGE,
      ),
    [chapters, page],
  );

  const allPageSelected =
    pageChapters.length > 0 &&
    pageChapters.every((chapter) => selectedChapterIds.has(chapter.id));

  const toggleChapterSelection = (chapterId: number) => {
    setSelectedChapterIds((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }
      return next;
    });
  };

  const togglePageSelection = () => {
    setSelectedChapterIds((prev) => {
      const next = new Set(prev);
      const shouldSelect = !pageChapters.every((chapter) =>
        prev.has(chapter.id),
      );
      for (const chapter of pageChapters) {
        if (shouldSelect) {
          next.add(chapter.id);
        } else {
          next.delete(chapter.id);
        }
      }
      return next;
    });
  };

  const clearChapterSelection = () => {
    setSelectedChapterIds(new Set());
    setBulkTargetBookId(null);
  };

  const handleBulkMove = async () => {
    if (bulkTargetBookId === null || selectedChapterIds.size === 0) return;
    const target = books.find((item) => item.id === bulkTargetBookId);
    if (!target) return;

    const ids = [...selectedChapterIds];
    if (
      !window.confirm(
        `선택한 챕터 ${ids.length}개를 '${target.title}'(으)로 이동할까요?`,
      )
    ) {
      return;
    }

    setBulkWorking(true);
    try {
      const allChapters = await apiFetch<ChapterItem[]>("/api/chapters");
      const targetOrders = allChapters
        .filter((item) => item.book_id === bulkTargetBookId)
        .map((item) => item.order);
      let nextOrder =
        targetOrders.length > 0 ? Math.max(...targetOrders) + 1 : 0;

      for (const chapterId of ids) {
        await apiFetch(`/api/chapters/${chapterId}`, {
          method: "PUT",
          body: JSON.stringify({
            book_id: bulkTargetBookId,
            order: nextOrder,
          }),
        });
        nextOrder += 1;
      }

      notify(
        "success",
        `${ids.length}개 챕터를 '${target.title}'(으)로 이동했습니다.`,
      );
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "챕터를 이동하지 못했습니다.",
      );
    } finally {
      clearChapterSelection();
      await load();
      setBulkWorking(false);
    }
  };

  const handleBulkCopy = async () => {
    if (bulkTargetBookId === null || selectedChapterIds.size === 0) return;
    const target = books.find((item) => item.id === bulkTargetBookId);
    if (!target) return;

    const sourceChapters = chapters.filter((chapter) =>
      selectedChapterIds.has(chapter.id),
    );
    if (sourceChapters.length === 0) return;

    if (
      !window.confirm(
        `선택한 챕터 ${sourceChapters.length}개를 '${target.title}'(으)로 복사할까요?`,
      )
    ) {
      return;
    }

    setBulkWorking(true);
    try {
      const allChapters = await apiFetch<ChapterItem[]>("/api/chapters");
      const targetOrders = allChapters
        .filter((item) => item.book_id === bulkTargetBookId)
        .map((item) => item.order);
      let nextOrder =
        targetOrders.length > 0 ? Math.max(...targetOrders) + 1 : 0;

      for (const chapter of sourceChapters) {
        await apiFetch("/api/chapters", {
          method: "POST",
          body: JSON.stringify({
            book_id: bulkTargetBookId,
            title: chapter.title,
            subtitle: chapter.subtitle,
            body: chapter.body,
            tags: chapter.tags,
            order: nextOrder,
            visible: chapter.visible,
            published_at: chapter.published_at,
            notify_mastodon: false,
          }),
        });
        nextOrder += 1;
      }

      notify(
        "success",
        `${sourceChapters.length}개 챕터를 '${target.title}'(으)로 복사했습니다.`,
      );
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "챕터를 복사하지 못했습니다.",
      );
    } finally {
      clearChapterSelection();
      await load();
      setBulkWorking(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedChapterIds.size === 0) return;
    const ids = [...selectedChapterIds];
    if (!window.confirm(`선택한 챕터 ${ids.length}개를 삭제할까요?`)) {
      return;
    }

    setBulkWorking(true);
    try {
      for (const chapterId of ids) {
        await apiFetch(`/api/chapters/${chapterId}`, { method: "DELETE" });
      }
      notify("success", `${ids.length}개 챕터를 삭제했습니다.`);
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "챕터를 삭제하지 못했습니다.",
      );
    } finally {
      clearChapterSelection();
      await load();
      setBulkWorking(false);
    }
  };

  const openBookInfo = () => {
    if (!book) return;
    setTitle(book.title);
    setDescription(book.description ?? "");
    setTagsInput((book.tags ?? []).join(", "));
    setCategoryId(book.category_id);
    setVisible(book.visible !== false);
    setBookProtected(book.protected === true);
    setIssuedCode(null);
    setBookInfoOpen(true);
  };

  const issueBookCode = async () => {
    if (!book || issuing) return;
    setIssuing(true);
    setIssuedCode(null);
    try {
      const result = await apiFetch<{ code: string }>(
        "/api/gallery/invites",
        {
          method: "POST",
          body: JSON.stringify({
            resource_type: "book",
            resource_id: book.id,
          }),
        },
      );
      setIssuedCode(result.code);
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "열람 코드를 발급하지 못했습니다.",
      );
    } finally {
      setIssuing(false);
    }
  };

  const handleBookSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!book) return;
    const nextTitle = title.trim();
    if (!nextTitle) {
      notify("error", "책 제목을 입력해주세요.");
      return;
    }

    setSaving(true);
    try {
      const updated = await apiFetch<Book>(`/api/books/${book.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: nextTitle,
          description: description.trim() || null,
          tags: parseTags(tagsInput),
          category_id: categoryId,
          visible,
          protected: bookProtected,
        }),
      });
      setBook(updated);
      setTitle(updated.title);
      setDescription(updated.description ?? "");
      setTagsInput((updated.tags ?? []).join(", "));
      setCategoryId(updated.category_id);
      setVisible(updated.visible !== false);
      setBookProtected(updated.protected === true);
      setBookInfoOpen(false);
      notify("success", "책 정보를 저장했습니다.");
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "책 정보를 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBook = async () => {
    if (!book) return;
    if (
      !window.confirm(
        `'${book.title}' 책과 챕터 ${chapters.length}개를 모두 삭제할까요?`,
      )
    ) {
      return;
    }
    try {
      await apiFetch(`/api/books/${book.id}`, { method: "DELETE" });
      router.push("/admin/books");
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "책을 삭제하지 못했습니다.",
      );
    }
  };

  if (!Number.isFinite(bookId)) {
    return (
      <div id="admin-books">
        <Link className="admin-books-back" href="/admin/books">
          ← 책장 관리
        </Link>
        <p className="admin-books-empty">잘못된 책 주소입니다.</p>
      </div>
    );
  }

  return (
    <div id="admin-books">
      <Link className="admin-books-back" href="/admin/books">
        ← 책장 관리
      </Link>

      {notice ? (
        <div className={`admin-notice admin-notice-${notice.type}`}>
          {notice.text}
        </div>
      ) : null}

      {loading ? (
        <p className="admin-books-empty">불러오는 중...</p>
      ) : !book ? (
        <p className="admin-books-empty">책을 찾을 수 없습니다.</p>
      ) : (
        <>
          <header className="admin-books-toolbar">
            <div className="admin-books-page-title">
              <h1>{book.title}</h1>
              {book.description ? <p>{book.description}</p> : null}
              {book.category || book.tags?.length ? (
                <span className="tag-list admin-books-page-tags">
                  {book.category ? (
                    <span className="tag is-category">
                      {book.category.name}
                    </span>
                  ) : null}
                  {book.tags?.map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </span>
              ) : null}
              <p>
                생성 {formatDateTime(book.created_at)} · 수정{" "}
                {formatDateTime(book.updated_at)}
              </p>
            </div>
            <div className="admin-books-actions">
              <button
                type="button"
                className="admin-button"
                onClick={openBookInfo}
              >
                책 정보 수정
              </button>
              <Link
                className="admin-button primary"
                href={`/admin/books/${book.id}/chapters/new`}
              >
                새 챕터
              </Link>
            </div>
          </header>

          <section className="admin-books-panel">
            {chapters.length > 0 ? (
              <div className="admin-books-list-header">
                <label className="admin-books-checkbox">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={togglePageSelection}
                    disabled={bulkWorking}
                  />
                  <span>전체 선택</span>
                </label>
                <span className="admin-books-hint">
                  {chapters.length}개
                </span>
              </div>
            ) : null}

            {selectedChapterIds.size > 0 ? (
              <div className="admin-books-bulk">
                <span className="admin-books-bulk__count">
                  {selectedChapterIds.size}개 선택
                </span>
                <select
                  value={bulkTargetBookId ?? ""}
                  onChange={(event) =>
                    setBulkTargetBookId(
                      event.target.value
                        ? Number(event.target.value)
                        : null,
                    )
                  }
                  disabled={bulkWorking}
                  aria-label="이동하거나 복사할 책 선택"
                >
                  <option value="">이동/복사할 책 선택</option>
                  {books
                    .filter((item) => item.id !== book.id)
                    .map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.title}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  className="admin-button"
                  onClick={handleBulkMove}
                  disabled={bulkWorking || bulkTargetBookId === null}
                >
                  책 이동
                </button>
                <button
                  type="button"
                  className="admin-button"
                  onClick={handleBulkCopy}
                  disabled={bulkWorking || bulkTargetBookId === null}
                >
                  책 복사
                </button>
                <button
                  type="button"
                  className="admin-button danger"
                  onClick={handleBulkDelete}
                  disabled={bulkWorking}
                >
                  삭제
                </button>
                <button
                  type="button"
                  className="admin-button"
                  onClick={clearChapterSelection}
                  disabled={bulkWorking}
                >
                  선택 해제
                </button>
              </div>
            ) : null}

            {chapters.length === 0 ? (
              <p className="admin-books-empty">
                등록된 챕터가 없습니다.
              </p>
            ) : (
              <>
                <div className="admin-books-chapters">
                  {pageChapters.map((chapter) => (
                    <div
                      className="admin-books-chapter-row"
                      key={chapter.id}
                    >
                      <input
                        type="checkbox"
                        className="admin-books-chapter-check"
                        checked={selectedChapterIds.has(chapter.id)}
                        onChange={() => toggleChapterSelection(chapter.id)}
                        disabled={bulkWorking}
                        aria-label={`${chapter.title} 선택`}
                      />
                      <Link
                        className="admin-books-chapter-link"
                        href={`/admin/books/${book.id}/chapters/${chapter.id}`}
                      >
                        <span className="admin-books-chapter-main">
                          <span className="admin-books-chapter-title">
                            {chapter.title}
                          </span>
                        </span>
                        <span className="admin-books-chapter-views">
                          조회 {chapter.view_count ?? 0}
                        </span>
                        <span className="admin-books-chapter-updated">
                          {formatDateTime(chapter.updated_at)}
                        </span>
                        <span
                          className="admin-books-chapter-arrow"
                          aria-hidden="true"
                        >
                          →
                        </span>
                      </Link>
                    </div>
                  ))}
                </div>
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  onChange={setPage}
                />
              </>
            )}
          </section>
        </>
      )}

      {bookInfoOpen && book ? (
        <div
          className="admin-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setBookInfoOpen(false);
            }
          }}
        >
          <div className="admin-modal" role="dialog" aria-modal="true">
            <div className="admin-modal-header">
              <h2>책 정보 수정</h2>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setBookInfoOpen(false)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <form
              id="book-info-form"
              className="admin-modal-body admin-books-modal-form"
              onSubmit={handleBookSubmit}
            >
              <label className="admin-field">
                <span>책 제목</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                />
              </label>
              <label className="admin-field">
                <span>책 설명</span>
                <textarea
                  value={description}
                  onChange={(event) =>
                    setDescription(event.target.value)
                  }
                  rows={5}
                  placeholder="책 설명 (선택)"
                />
              </label>
              <label className="admin-field">
                <span>태그</span>
                <input
                  value={tagsInput}
                  onChange={(event) => setTagsInput(event.target.value)}
                  placeholder="쉼표로 구분 (선택)"
                />
              </label>
              <label className="admin-field">
                <span>카테고리</span>
                <select
                  value={categoryId ?? ""}
                  onChange={(event) =>
                    setCategoryId(
                      event.target.value
                        ? Number(event.target.value)
                        : null,
                    )
                  }
                >
                  <option value="">카테고리 없음</option>
                  {categories.map((category) => (
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
                    !visible
                      ? "private"
                      : bookProtected
                        ? "protected"
                        : "public"
                  }
                  onChange={(event) => {
                    const value = event.target.value;
                    setVisible(value !== "private");
                    setBookProtected(value === "protected");
                  }}
                >
                  <option value="public">공개</option>
                  <option value="protected">보호</option>
                  <option value="private">비공개</option>
                </select>
              </label>
              {visible && bookProtected ? (
                <div className="admin-books-code">
                  <button
                    type="button"
                    className="admin-button"
                    onClick={() => void issueBookCode()}
                    disabled={issuing}
                  >
                    {issuing ? "발급 중..." : "열람 코드 발급"}
                  </button>
                  {issuedCode ? <code>{issuedCode}</code> : null}
                </div>
              ) : null}
              <p className="admin-books-meta">
                생성 {formatDateTime(book.created_at)} · 수정{" "}
                {formatDateTime(book.updated_at)}
              </p>
            </form>
            <div className="admin-modal-footer admin-books-modal-footer">
              <button
                type="button"
                className="admin-button danger"
                onClick={handleDeleteBook}
                disabled={saving}
              >
                책 삭제
              </button>
              <button
                type="button"
                className="admin-button"
                onClick={() => setBookInfoOpen(false)}
                disabled={saving}
              >
                취소
              </button>
              <button
                type="submit"
                form="book-info-form"
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
