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

import { RichTextEditor } from "@/components/rich-text-editor";
import { apiFetch } from "@/lib/api";

import "@/public/styles/admin/books.scss";

interface Book {
  id: number;
  title: string;
}

interface ChapterItem {
  id: number;
  book_id: number;
  title: string;
  subtitle: string | null;
  body: string | null;
  order: number;
  visible: boolean;
  published_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  book: { id: number; title: string } | null;
}

type Notice = { type: "success" | "error"; text: string };

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDatetimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function AdminChapterEdit() {
  const params = useParams<{ bookId: string; chapterId: string }>();
  const router = useRouter();
  const bookId = Number(params.bookId);
  const chapterIdParam = params.chapterId;
  const isNew = chapterIdParam === "new";
  const chapterId = isNew ? null : Number(chapterIdParam);

  const [book, setBook] = useState<Book | null>(null);
  const [chapter, setChapter] = useState<ChapterItem | null>(null);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [body, setBody] = useState("");
  const [visible, setVisible] = useState(true);
  const [publishedAt, setPublishedAt] = useState("");
  const [nextOrder, setNextOrder] = useState(0);
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

      const bookChapters = chapterData.filter(
        (item) => item.book_id === bookId,
      );
      setNextOrder(bookChapters.length);

      if (!isNew) {
        const current =
          bookChapters.find((item) => item.id === chapterId) ?? null;
        if (!current) {
          setNotice({
            type: "error",
            text: "챕터를 찾을 수 없습니다.",
          });
          setChapter(null);
          return;
        }
        setChapter(current);
        setTitle(current.title);
        setSubtitle(current.subtitle ?? "");
        setBody(current.body ?? "");
        setVisible(current.visible !== false);
        setPublishedAt(toDatetimeLocal(current.published_at));
      } else {
        setPublishedAt("");
      }
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "챕터를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [bookId, chapterId, isNew, notify]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) {
      notify("error", "챕터 제목을 입력해주세요.");
      return;
    }

    const plainBody = body.replace(/<[^>]*>/g, "").trim();
    const nextBody = plainBody ? body : null;

    let publishedAtValue: string | null = null;
    if (publishedAt.trim()) {
      const date = new Date(publishedAt);
      if (!Number.isNaN(date.getTime())) {
        publishedAtValue = date.toISOString().replace("Z", "");
      }
    }

    setSaving(true);
    try {
      if (isNew) {
        await apiFetch("/api/chapters", {
          method: "POST",
          body: JSON.stringify({
            book_id: bookId,
            title: nextTitle,
            subtitle: subtitle.trim() || null,
            body: nextBody,
            order: nextOrder,
            visible,
            published_at: publishedAtValue,
          }),
        });
      } else if (chapter) {
        await apiFetch(`/api/chapters/${chapter.id}`, {
          method: "PUT",
          body: JSON.stringify({
            book_id: bookId,
            title: nextTitle,
            subtitle: subtitle.trim() || null,
            body: nextBody,
            order: chapter.order,
            visible,
            published_at: publishedAtValue,
          }),
        });
      }
      router.push(`/admin/books/${bookId}`);
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

  const handleDelete = async () => {
    if (!chapter) return;
    if (!window.confirm(`'${chapter.title}' 챕터를 삭제할까요?`)) {
      return;
    }
    try {
      await apiFetch(`/api/chapters/${chapter.id}`, { method: "DELETE" });
      router.push(`/admin/books/${bookId}`);
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "챕터를 삭제하지 못했습니다.",
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
      <Link className="admin-books-back" href={`/admin/books/${bookId}`}>
        ← {book?.title ?? "책 상세"}
      </Link>

      {notice ? (
        <div className={`admin-notice admin-notice-${notice.type}`}>
          {notice.text}
        </div>
      ) : null}

      {loading ? (
        <p className="admin-books-empty">불러오는 중...</p>
      ) : (
        <>
          <header className="admin-books-toolbar">
            <div className="admin-books-page-title">
              <h1>{isNew ? "새 챕터" : "챕터 수정"}</h1>
              {chapter ? (
                <p>
                  작성 {formatDateTime(chapter.created_at)} · 수정{" "}
                  {formatDateTime(chapter.updated_at)}
                  {chapter.published_at
                    ? ` · 발행 ${formatDateTime(chapter.published_at)}`
                    : ""}
                </p>
              ) : (
                <p>새 챕터를 작성합니다.</p>
              )}
            </div>
          </header>

          <section className="admin-books-panel">
            <form
              className="admin-books-edit-form"
              onSubmit={handleSubmit}
            >
              <label className="admin-field">
                <span>챕터 제목</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="챕터 제목"
                  required
                />
              </label>
              <label className="admin-field">
                <span>부제</span>
                <input
                  value={subtitle}
                  onChange={(event) => setSubtitle(event.target.value)}
                  placeholder="부제 (선택)"
                />
              </label>
              <div className="admin-field">
                <span>본문</span>
                <RichTextEditor
                  value={body}
                  onChange={setBody}
                  placeholder="챕터 본문을 입력해주세요."
                />
              </div>
              <label className="admin-field">
                <span>발행 시각</span>
                <input
                  type="datetime-local"
                  value={publishedAt}
                  onChange={(event) =>
                    setPublishedAt(event.target.value)
                  }
                />
              </label>
              <p className="admin-books-hint">
                비워두면 즉시 공개됩니다. 미래 시각을 지정하면 예약
                발행됩니다. 공개가 꺼져 있으면 발행되지 않습니다.
              </p>
              <label className="admin-books-checkbox">
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={(event) => setVisible(event.target.checked)}
                />
                <span>공개</span>
              </label>
              <div className="admin-books-form-actions">
                {!isNew && chapter ? (
                  <button
                    type="button"
                    className="admin-button danger"
                    onClick={handleDelete}
                    disabled={saving}
                  >
                    챕터 삭제
                  </button>
                ) : null}
                <Link
                  className="admin-button"
                  href={`/admin/books/${bookId}`}
                >
                  취소
                </Link>
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
        </>
      )}
    </div>
  );
}
