"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

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
  title: string;
  subtitle: string | null;
  body: string | null;
  order: number;
  visible: boolean;
  created_at: string | null;
  updated_at: string | null;
  book: { id: number; title: string } | null;
}

type Notice = { type: "success" | "error"; text: string };

function sortChapters(chapters: ChapterItem[]) {
  return [...chapters].sort(
    (a, b) =>
      a.order - b.order ||
      a.title.localeCompare(b.title, "ko") ||
      a.id - b.id,
  );
}

export default function AdminBookDetail() {
  const params = useParams<{ bookId: string }>();
  const router = useRouter();
  const bookId = Number(params.bookId);

  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visible, setVisible] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
      const [bookData, chapterData] = await Promise.all([
        apiFetch<Book>(`/api/books/${bookId}`),
        apiFetch<ChapterItem[]>("/api/chapters"),
      ]);
      setBook(bookData);
      setTitle(bookData.title);
      setDescription(bookData.description ?? "");
      setVisible(bookData.visible !== false);
      setChapters(
        sortChapters(
          chapterData.filter((chapter) => chapter.book_id === bookId),
        ),
      );
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
          visible,
        }),
      });
      setBook(updated);
      setTitle(updated.title);
      setDescription(updated.description ?? "");
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
              <p>책 정보와 챕터 목록을 관리합니다.</p>
            </div>
          </header>

          <div className="admin-books-detail-layout">
            <section className="admin-books-panel">
              <h2>책 정보</h2>
              <form className="admin-books-form" onSubmit={handleBookSubmit}>
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
                <label className="admin-books-checkbox">
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={(event) => setVisible(event.target.checked)}
                  />
                  <span>공개</span>
                </label>
                <div className="admin-books-form-actions">
                  <button
                    type="button"
                    className="admin-button danger"
                    onClick={handleDeleteBook}
                    disabled={saving}
                  >
                    책 삭제
                  </button>
                  <button
                    type="submit"
                    className="admin-button primary"
                    disabled={saving}
                  >
                    {saving ? "저장 중..." : "저장"}
                  </button>
                </div>
              </form>
            </section>

            <section className="admin-books-panel">
              <div className="admin-books-toolbar">
                <h2>챕터</h2>
                <Link
                  className="admin-button"
                  href={`/admin/books/${book.id}/chapters/new`}
                >
                  새 챕터
                </Link>
              </div>
              {chapters.length === 0 ? (
                <p className="admin-books-empty">
                  등록된 챕터가 없습니다.
                </p>
              ) : (
                <div className="admin-books-chapters">
                  {chapters.map((chapter) => (
                    <Link
                      className="admin-books-chapter-link"
                      href={`/admin/books/${book.id}/chapters/${chapter.id}`}
                      key={chapter.id}
                    >
                      {chapter.title}
                      <span aria-hidden="true">→</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
