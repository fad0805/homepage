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

import { MastodonShare } from "@/components/mastodon-share";
import { RichTextEditor } from "@/components/rich-text-editor";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";

import "@/public/styles/admin/books.scss";

const DRAFT_AUTOSAVE_DELAY_MS = 2000;

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
  tags: string[];
  order: number;
  visible: boolean;
  view_count: number;
  published_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  book: { id: number; title: string } | null;
}

interface ChapterDraft {
  id: number;
  draft_key: string;
  title: string;
  subtitle: string | null;
  body: string | null;
  tags: string[];
  visible: boolean;
  published_at: string | null;
  target_book_id: number | null;
  created_at: string;
  updated_at: string;
}

type Notice = { type: "success" | "error"; text: string };

function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
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

function toUtcDateTime(value: string) {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().replace("Z", "");
}

function getDraftSignature(values: {
  title: string;
  subtitle: string;
  body: string;
  tagsInput: string;
  visible: boolean;
  publishedAt: string;
  targetBookId: number;
}) {
  return JSON.stringify([
    values.title,
    values.subtitle,
    values.body,
    values.tagsInput,
    values.visible,
    values.publishedAt,
    values.targetBookId,
  ]);
}

export default function AdminChapterEdit() {
  const params = useParams<{ bookId: string; chapterId: string }>();
  const router = useRouter();
  const bookId = Number(params.bookId);
  const chapterIdParam = params.chapterId;
  const isNew = chapterIdParam === "new";
  const chapterId = isNew ? null : Number(chapterIdParam);
  const draftKey = isNew
    ? Number.isFinite(bookId)
      ? `new-${bookId}`
      : null
    : chapterId !== null && Number.isFinite(chapterId)
      ? `chapter-${chapterId}`
      : null;

  const [book, setBook] = useState<Book | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [chapter, setChapter] = useState<ChapterItem | null>(null);
  const [allChapters, setAllChapters] = useState<ChapterItem[]>([]);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [body, setBody] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [visible, setVisible] = useState(true);
  const [publishedAt, setPublishedAt] = useState("");
  const [targetBookId, setTargetBookId] = useState(bookId);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [availableDraft, setAvailableDraft] = useState<ChapterDraft | null>(
    null,
  );
  const [draftPromptOpen, setDraftPromptOpen] = useState(false);
  const [autosaveReady, setAutosaveReady] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSignatureRef = useRef<string | null>(null);
  const draftSaveInFlightRef = useRef(false);
  const draftSavePromiseRef = useRef<Promise<void> | null>(null);

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

  const deleteDraft = useCallback(async () => {
    if (!draftKey) return;
    const pendingSave = draftSavePromiseRef.current;
    if (pendingSave) {
      try {
        await pendingSave;
      } catch {
        // saveDraft already reports its own failures.
      }
    }
    try {
      await apiFetch(
        `/api/chapter-drafts/${encodeURIComponent(draftKey)}`,
        { method: "DELETE" },
      );
    } catch (error) {
      // The saved chapter is the source of truth. A leftover draft is
      // harmless, so don't block navigation when cleanup fails.
      console.error(error);
    }
  }, [draftKey]);

  const load = useCallback(async () => {
    if (!Number.isFinite(bookId)) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setDraftSavedAt(null);
    setAvailableDraft(null);
    setDraftPromptOpen(false);
    setAutosaveReady(false);
    lastSavedSignatureRef.current = null;
    try {
      const [bookData, chapterData, bookList, draftData] = await Promise.all([
        apiFetch<Book>(`/api/books/${bookId}`),
        apiFetch<ChapterItem[]>("/api/chapters"),
        apiFetch<Book[]>("/api/books"),
        draftKey
          ? apiFetch<ChapterDraft | null>(
              `/api/chapter-drafts/${encodeURIComponent(draftKey)}`,
            )
          : Promise.resolve(null),
      ]);
      setBook(bookData);
      setBooks(bookList);
      setAllChapters(chapterData);

      const bookChapters = chapterData.filter(
        (item) => item.book_id === bookId,
      );

      let baseTitle = "";
      let baseSubtitle = "";
      let baseBody = "";
      let baseTagsInput = "";
      let baseVisible = true;
      let basePublishedAt = "";
      let baseTargetBookId = bookId;

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

        baseTitle = current.title;
        baseSubtitle = current.subtitle ?? "";
        baseBody = current.body ?? "";
        baseTagsInput = (current.tags ?? []).join(", ");
        baseVisible = current.visible !== false;
        basePublishedAt = toDatetimeLocal(current.published_at);
        baseTargetBookId = current.book_id;

        setChapter(current);
        setTargetBookId(baseTargetBookId);
        setTitle(baseTitle);
        setSubtitle(baseSubtitle);
        setBody(baseBody);
        setTagsInput(baseTagsInput);
        setVisible(baseVisible);
        setPublishedAt(basePublishedAt);
      } else {
        setChapter(null);
        setTargetBookId(baseTargetBookId);
        setTitle(baseTitle);
        setSubtitle(baseSubtitle);
        setBody(baseBody);
        setTagsInput(baseTagsInput);
        setVisible(baseVisible);
        setPublishedAt(basePublishedAt);
      }

      lastSavedSignatureRef.current = getDraftSignature({
        title: baseTitle,
        subtitle: baseSubtitle,
        body: baseBody,
        tagsInput: baseTagsInput,
        visible: baseVisible,
        publishedAt: basePublishedAt,
        targetBookId: baseTargetBookId,
      });

      if (draftData) {
        setAvailableDraft(draftData);
        setDraftPromptOpen(true);
      } else {
        setAutosaveReady(true);
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
  }, [bookId, chapterId, draftKey, isNew, notify]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApplyDraft = useCallback(() => {
    if (!availableDraft) return;

    const nextTitle = availableDraft.title ?? "";
    const nextSubtitle = availableDraft.subtitle ?? "";
    const nextBody = availableDraft.body ?? "";
    const nextTagsInput = (availableDraft.tags ?? []).join(", ");
    const nextVisible = availableDraft.visible !== false;
    const nextPublishedAt = toDatetimeLocal(availableDraft.published_at);
    const nextTargetBookId =
      availableDraft.target_book_id !== null &&
      books.some((item) => item.id === availableDraft.target_book_id)
        ? availableDraft.target_book_id
        : targetBookId;

    lastSavedSignatureRef.current = getDraftSignature({
      title: nextTitle,
      subtitle: nextSubtitle,
      body: nextBody,
      tagsInput: nextTagsInput,
      visible: nextVisible,
      publishedAt: nextPublishedAt,
      targetBookId: nextTargetBookId,
    });

    setTitle(nextTitle);
    setSubtitle(nextSubtitle);
    setBody(nextBody);
    setTagsInput(nextTagsInput);
    setVisible(nextVisible);
    setPublishedAt(nextPublishedAt);
    setTargetBookId(nextTargetBookId);
    setDraftSavedAt(availableDraft.updated_at);
    setAvailableDraft(null);
    setDraftPromptOpen(false);
    setAutosaveReady(true);
    notify("success", "임시저장된 내용을 불러왔습니다.");
  }, [availableDraft, books, notify, targetBookId]);

  const handleDismissDraftPrompt = useCallback(() => {
    setDraftPromptOpen(false);
    setAutosaveReady(true);
  }, []);

  const saveDraft = useCallback(
    (showSuccessNotice: boolean) => {
      if (!draftKey) {
        if (showSuccessNotice) {
          notify("error", "임시저장할 수 없습니다.");
        }
        return Promise.resolve();
      }
      if (draftSaveInFlightRef.current) {
        return draftSavePromiseRef.current ?? Promise.resolve();
      }

      const signature = getDraftSignature({
        title,
        subtitle,
        body,
        tagsInput,
        visible,
        publishedAt,
        targetBookId,
      });

      draftSaveInFlightRef.current = true;
      setDraftSaving(true);
      const task = (async () => {
        try {
          const draft = await apiFetch<ChapterDraft>(
            `/api/chapter-drafts/${encodeURIComponent(draftKey)}`,
            {
              method: "PUT",
              body: JSON.stringify({
                title,
                subtitle: subtitle || null,
                body: body || null,
                tags: parseTags(tagsInput),
                visible,
                published_at: toUtcDateTime(publishedAt),
                target_book_id: Number.isFinite(targetBookId)
                  ? targetBookId
                  : bookId,
              }),
            },
          );
          lastSavedSignatureRef.current = signature;
          setDraftSavedAt(draft.updated_at);
          setAvailableDraft(null);
          setDraftPromptOpen(false);
          if (showSuccessNotice) {
            notify("success", "임시저장했습니다.");
          }
        } catch (error) {
          notify(
            "error",
            error instanceof Error
              ? error.message
              : "임시저장하지 못했습니다.",
          );
        } finally {
          draftSaveInFlightRef.current = false;
          setDraftSaving(false);
        }
      })();

      draftSavePromiseRef.current = task;
      void task.finally(() => {
        if (draftSavePromiseRef.current === task) {
          draftSavePromiseRef.current = null;
        }
      });
      return task;
    },
    [
      body,
      bookId,
      draftKey,
      notify,
      publishedAt,
      subtitle,
      tagsInput,
      targetBookId,
      title,
      visible,
    ],
  );

  const handleSaveDraft = () => {
    void saveDraft(true);
  };

  useEffect(() => {
    if (
      !autosaveReady ||
      loading ||
      saving ||
      draftSaving ||
      !draftKey
    ) {
      return;
    }

    const signature = getDraftSignature({
      title,
      subtitle,
      body,
      tagsInput,
      visible,
      publishedAt,
      targetBookId,
    });

    if (lastSavedSignatureRef.current === null) {
      lastSavedSignatureRef.current = signature;
      return;
    }
    if (signature === lastSavedSignatureRef.current) return;

    const timer = setTimeout(() => {
      void saveDraft(false);
    }, DRAFT_AUTOSAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [
    autosaveReady,
    body,
    draftKey,
    draftSaving,
    loading,
    publishedAt,
    saveDraft,
    saving,
    subtitle,
    tagsInput,
    targetBookId,
    title,
    visible,
  ]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) {
      notify("error", "챕터 제목을 입력해주세요.");
      return;
    }

    const plainBody = body.replace(/<[^>]*>/g, "").trim();
    const nextBody = plainBody || /<img\b/i.test(body) ? body : null;
    const publishedAtValue = toUtcDateTime(publishedAt);

    const sourceBookId = chapter?.book_id ?? bookId;
    const nextBookId = Number.isFinite(targetBookId) ? targetBookId : bookId;
    const targetOrders = allChapters
      .filter(
        (item) => item.book_id === nextBookId && item.id !== chapter?.id,
      )
      .map((item) => item.order);
    const order =
      isNew || nextBookId !== sourceBookId
        ? targetOrders.length > 0
          ? Math.max(...targetOrders) + 1
          : 0
        : chapter?.order ?? 0;

    setSaving(true);
    try {
      if (isNew) {
        await apiFetch("/api/chapters", {
          method: "POST",
          body: JSON.stringify({
            book_id: nextBookId,
            title: nextTitle,
            subtitle: subtitle.trim() || null,
            body: nextBody,
            tags: parseTags(tagsInput),
            order,
            visible,
            published_at: publishedAtValue,
          }),
        });
      } else if (chapter) {
        await apiFetch(`/api/chapters/${chapter.id}`, {
          method: "PUT",
          body: JSON.stringify({
            book_id: nextBookId,
            title: nextTitle,
            subtitle: subtitle.trim() || null,
            body: nextBody,
            tags: parseTags(tagsInput),
            order,
            visible,
            published_at: publishedAtValue,
          }),
        });
      }
      await deleteDraft();
      router.push(`/admin/books/${nextBookId}`);
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
    setSaving(true);
    try {
      await apiFetch(`/api/chapters/${chapter.id}`, { method: "DELETE" });
      await deleteDraft();
      router.push(`/admin/books/${bookId}`);
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "챕터를 삭제하지 못했습니다.",
      );
    } finally {
      setSaving(false);
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

      {!loading && availableDraft ? (
        <section className="admin-books-draft-notice" aria-live="polite">
          <div>
            <strong>
              {draftPromptOpen
                ? "임시저장본을 불러오시겠습니까?"
                : "불러오지 않은 임시저장본이 있습니다."}
            </strong>
            <p>{formatDateTime(availableDraft.updated_at)}에 저장됨</p>
          </div>
          <div className="admin-books-draft-notice-actions">
            <button
              type="button"
              className="admin-button primary"
              onClick={handleApplyDraft}
            >
              {draftPromptOpen ? "불러오기" : "임시저장 불러오기"}
            </button>
            {draftPromptOpen ? (
              <button
                type="button"
                className="admin-button"
                onClick={handleDismissDraftPrompt}
              >
                나중에
              </button>
            ) : null}
          </div>
        </section>
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
                  {` · 조회 ${chapter.view_count ?? 0}`}
                </p>
              ) : (
                <p>새 챕터를 작성합니다.</p>
              )}
              {draftSavedAt ? (
                <p className="admin-books-hint">
                  임시저장 {formatDateTime(draftSavedAt)}
                </p>
              ) : null}
            </div>
            {!isNew && chapter && book ? (
              <div className="admin-books-actions">
                <MastodonShare
                  title={chapter.title}
                  bookTitle={book.title}
                  bookId={bookId}
                  chapterId={chapter.id}
                  triggerClassName="admin-button"
                />
              </div>
            ) : null}
          </header>

          <section className="admin-books-panel">
            <form
              className="admin-books-edit-form"
              onSubmit={handleSubmit}
            >
              <label className="admin-field">
                <span>소속 책</span>
                <select
                  value={targetBookId}
                  onChange={(event) =>
                    setTargetBookId(Number(event.target.value))
                  }
                >
                  {books.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
              {!isNew && chapter && targetBookId !== chapter.book_id ? (
                <p className="admin-books-hint">
                  저장하면 선택한 책으로 이동합니다.
                </p>
              ) : null}
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
                  uploadUrl="/api/chapters/upload"
                  onNotice={(notice) => notify(notice.type, notice.text)}
                />
              </div>
              <label className="admin-field">
                <span>태그</span>
                <input
                  value={tagsInput}
                  onChange={(event) => setTagsInput(event.target.value)}
                  placeholder="쉼표로 구분 (선택)"
                />
              </label>
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
                  type="button"
                  className="admin-button"
                  onClick={handleSaveDraft}
                  disabled={saving || draftSaving}
                >
                  {draftSaving ? "임시저장 중..." : "임시저장"}
                </button>
                <button
                  type="submit"
                  className="admin-button primary"
                  disabled={saving || draftSaving}
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
