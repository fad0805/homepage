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

import {
  RichTextEditor,
  type RichTextEditorHandle,
} from "@/components/rich-text-editor";
import { TagInput } from "@/components/tag-input";
import { TocManager } from "@/components/toc-manager";
import { CHAPTER_PREVIEW_STORAGE_KEY } from "@/app/books/types";
import type { Chapter } from "@/app/books/types";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { useStandaloneWebApp } from "@/lib/standalone-webapp";

import "@/public/styles/admin/books.scss";

const DRAFT_AUTOSAVE_DELAY_MS = 2000;
const CHAPTER_SAVED_NOTICE_KEY = "admin-chapter-saved";

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
  pinned: boolean;
  protected: boolean;
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
  pinned: boolean;
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
  pinned: boolean;
  publishedAt: string;
  targetBookId: number;
}) {
  return JSON.stringify([
    values.title,
    values.subtitle,
    values.body,
    values.tagsInput,
    values.visible,
    values.pinned,
    values.publishedAt,
    values.targetBookId,
  ]);
}

export default function AdminChapterEdit() {
  const params = useParams<{ bookId: string; chapterId: string }>();
  const router = useRouter();
  const standalone = useStandaloneWebApp();
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
  const [pinned, setPinned] = useState(false);
  const [chapterProtected, setChapterProtected] = useState(false);
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [publishedAt, setPublishedAt] = useState("");
  const [targetBookId, setTargetBookId] = useState(bookId);
  const [tocParentId, setTocParentId] = useState<number | null>(null);
  const [tocModalOpen, setTocModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftDeleting, setDraftDeleting] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [availableDraft, setAvailableDraft] = useState<ChapterDraft | null>(
    null,
  );
  const [draftPromptOpen, setDraftPromptOpen] = useState(false);
  const [draftPreviewOpen, setDraftPreviewOpen] = useState(false);
  const [savedDraft, setSavedDraft] = useState<ChapterDraft | null>(null);
  const [draftViewOpen, setDraftViewOpen] = useState(false);
  const [autosaveReady, setAutosaveReady] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<RichTextEditorHandle | null>(null);
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

  useEffect(() => {
    if (
      window.sessionStorage.getItem(CHAPTER_SAVED_NOTICE_KEY) !== "1"
    ) {
      return;
    }
    window.sessionStorage.removeItem(CHAPTER_SAVED_NOTICE_KEY);
    notify("success", "저장했습니다.");
  }, [chapterIdParam, notify]);

  const requestDeleteDraft = useCallback(async () => {
    if (!draftKey) return;
    const pendingSave = draftSavePromiseRef.current;
    if (pendingSave) {
      try {
        await pendingSave;
      } catch {
        // saveDraft already reports its own failures.
      }
    }
    await apiFetch(
      `/api/chapter-drafts/${encodeURIComponent(draftKey)}`,
      { method: "DELETE" },
    );
  }, [draftKey]);

  const deleteDraft = useCallback(async () => {
    try {
      await requestDeleteDraft();
    } catch (error) {
      // The saved chapter is the source of truth. A leftover draft is
      // harmless, so don't block navigation when cleanup fails.
      console.error(error);
    }
  }, [requestDeleteDraft]);

  const load = useCallback(async () => {
    if (!Number.isFinite(bookId)) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setDraftSavedAt(null);
    setAvailableDraft(null);
    setSavedDraft(null);
    setDraftPromptOpen(false);
    setDraftPreviewOpen(false);
    setDraftViewOpen(false);
    setAutosaveReady(false);
    lastSavedSignatureRef.current = null;
    try {
      // The full list is metadata-only so a long series doesn't ship every
      // body on every edit-screen visit. Fetch the chapter being edited
      // separately, with its body.
      const [bookData, chapterData, bookList, currentData, draftData] =
        await Promise.all([
          apiFetch<Book>(`/api/books/${bookId}?mine=true`),
          apiFetch<ChapterItem[]>(
            "/api/chapters?mine=true&include_body=false",
          ),
          apiFetch<Book[]>("/api/books?mine=true"),
          isNew
            ? Promise.resolve(null)
            : apiFetch<ChapterItem>(`/api/chapters/${chapterId}?mine=true`),
          draftKey
            ? apiFetch<ChapterDraft | null>(
                `/api/chapter-drafts/${encodeURIComponent(draftKey)}`,
              )
            : Promise.resolve(null),
        ]);
      setBook(bookData);
      setBooks(bookList);
      setAllChapters(chapterData);

      let baseTitle = "";
      let baseSubtitle = "";
      let baseBody = "";
      let baseTagsInput = "";
      let baseVisible = true;
      let basePinned = false;
      let baseProtected = false;
      let basePublishedAt = "";
      let baseTargetBookId = bookId;

      if (!isNew) {
        const current = currentData;
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
        basePinned = current.pinned === true;
        baseProtected = current.protected === true;
        basePublishedAt = toDatetimeLocal(current.published_at);
        baseTargetBookId = current.book_id;

        setChapter(current);
        setTargetBookId(baseTargetBookId);
        setTitle(baseTitle);
        setSubtitle(baseSubtitle);
        setBody(baseBody);
        setTagsInput(baseTagsInput);
        setVisible(baseVisible);
        setPinned(basePinned);
        setChapterProtected(baseProtected);
        setPublishedAt(basePublishedAt);
      } else {
        setChapter(null);
        setTargetBookId(baseTargetBookId);
        setTitle(baseTitle);
        setSubtitle(baseSubtitle);
        setBody(baseBody);
        setTagsInput(baseTagsInput);
        setVisible(baseVisible);
        setPinned(basePinned);
        setChapterProtected(false);
        setPublishedAt(basePublishedAt);
      }

      lastSavedSignatureRef.current = getDraftSignature({
        title: baseTitle,
        subtitle: baseSubtitle,
        body: baseBody,
        tagsInput: baseTagsInput,
        visible: baseVisible,
        pinned: basePinned,
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

  useEffect(() => {
    if (!draftPreviewOpen && !draftViewOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDraftPreviewOpen(false);
        setDraftViewOpen(false);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [draftPreviewOpen, draftViewOpen]);

  const handleOpenDraftPreview = useCallback(() => {
    if (!availableDraft) return;
    setDraftPreviewOpen(true);
  }, [availableDraft]);

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
      pinned: availableDraft.pinned === true,
      publishedAt: nextPublishedAt,
      targetBookId: nextTargetBookId,
    });

    setTitle(nextTitle);
    setSubtitle(nextSubtitle);
    setBody(nextBody);
    setTagsInput(nextTagsInput);
    setVisible(nextVisible);
    setPinned(availableDraft.pinned === true);
    setPublishedAt(nextPublishedAt);
    setTargetBookId(nextTargetBookId);
    setSavedDraft(availableDraft);
    setDraftSavedAt(availableDraft.updated_at);
    setAvailableDraft(null);
    setDraftPromptOpen(false);
    setDraftPreviewOpen(false);
    setAutosaveReady(true);
    notify("success", "임시저장된 내용을 불러왔습니다.");
  }, [availableDraft, books, notify, targetBookId]);

  const handleDismissDraftPrompt = useCallback(() => {
    setDraftPromptOpen(false);
    setDraftPreviewOpen(false);
    setAutosaveReady(true);
  }, []);

  const handleOpenViewPreview = useCallback(() => {
    const selectedBook =
      books.find((item) => item.id === targetBookId) ??
      (book?.id === targetBookId ? book : null);
    const parsedPublishedAt = publishedAt
      ? new Date(publishedAt)
      : null;
    const payload: Chapter = {
      id: chapterId ?? 0,
      book_id: targetBookId,
      title: title.trim() || "제목 없음",
      subtitle: subtitle.trim() || null,
      body,
      tags: parseTags(tagsInput),
      order: chapter?.order ?? 0,
      visible,
      pinned,
      protected: chapterProtected,
      view_count: chapter?.view_count ?? 0,
      created_at: chapter?.created_at ?? null,
      published_at:
        parsedPublishedAt && !Number.isNaN(parsedPublishedAt.getTime())
          ? parsedPublishedAt.toISOString()
          : (chapter?.published_at ?? null),
      book: {
        id: targetBookId,
        title: selectedBook?.title ?? "책",
      },
    };
    try {
      localStorage.setItem(
        CHAPTER_PREVIEW_STORAGE_KEY,
        JSON.stringify(payload),
      );
    } catch {
      // Preview still opens without the draft payload if storage is blocked.
    }
    const previewUrl = `/books?book=${targetBookId}&preview=1`;
    if (standalone) {
      // Installed web apps have no tab strip; navigate in the same window.
      router.push(previewUrl);
    } else {
      window.open(previewUrl, "_blank", "noopener,noreferrer");
    }
  }, [
    book,
    books,
    body,
    chapter,
    chapterId,
    chapterProtected,
    pinned,
    publishedAt,
    router,
    standalone,
    subtitle,
    targetBookId,
    title,
    visible,
  ]);

  const handleDeleteDraft = useCallback(async () => {
    if (!draftKey || draftDeleting) return;
    if (!window.confirm("임시저장본을 삭제할까요?")) return;

    setDraftDeleting(true);
    try {
      await requestDeleteDraft();
      setAvailableDraft(null);
      setSavedDraft(null);
      setDraftPromptOpen(false);
      setDraftPreviewOpen(false);
      setDraftViewOpen(false);
      setDraftSavedAt(null);
      setAutosaveReady(true);
      // Keep the current editor content as the autosave baseline so the
      // deleted draft is not immediately recreated by the autosave timer.
      lastSavedSignatureRef.current = getDraftSignature({
        title,
        subtitle,
        body,
        tagsInput,
        visible,
        pinned,
        publishedAt,
        targetBookId,
      });
      notify("success", "임시저장본을 삭제했습니다.");
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "임시저장본을 삭제하지 못했습니다.",
      );
    } finally {
      setDraftDeleting(false);
    }
  }, [
    body,
    draftDeleting,
    draftKey,
    notify,
    publishedAt,
    requestDeleteDraft,
    subtitle,
    tagsInput,
    targetBookId,
    title,
    visible,
  ]);

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
      // Autosave would persist blob URLs that only live in this tab.
      if (!showSuccessNotice && editorRef.current?.hasPendingImages()) {
        return Promise.resolve();
      }

      draftSaveInFlightRef.current = true;
      setDraftSaving(true);
      const task = (async () => {
        try {
          let draftBody = body;
          if (editorRef.current?.hasPendingImages()) {
            draftBody = await editorRef.current.resolveImages(body);
            setBody(draftBody);
          }
          const signature = getDraftSignature({
            title,
            subtitle,
            body: draftBody,
            tagsInput,
            visible,
            pinned,
            publishedAt,
            targetBookId,
          });
          const draft = await apiFetch<ChapterDraft>(
            `/api/chapter-drafts/${encodeURIComponent(draftKey)}`,
            {
              method: "PUT",
              body: JSON.stringify({
                title,
                subtitle: subtitle || null,
                body: draftBody || null,
                tags: parseTags(tagsInput),
                visible,
                pinned,
                published_at: toUtcDateTime(publishedAt),
                target_book_id: Number.isFinite(targetBookId)
                  ? targetBookId
                  : bookId,
              }),
            },
          );
          lastSavedSignatureRef.current = signature;
          setSavedDraft(draft);
          setDraftSavedAt(draft.updated_at);
          setAvailableDraft(null);
          setDraftPromptOpen(false);
          setDraftPreviewOpen(false);
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
      pinned,
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
      draftDeleting ||
      draftPreviewOpen ||
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
      pinned,
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
    draftDeleting,
    draftKey,
    draftPreviewOpen,
    draftSaving,
    loading,
    publishedAt,
    saveDraft,
    saving,
    subtitle,
    tagsInput,
    targetBookId,
    title,
    pinned,
    visible,
  ]);

  const otherPinnedCount = allChapters.filter(
    (item) =>
      item.book_id === targetBookId &&
      item.pinned &&
      item.id !== chapter?.id,
  ).length;
  const pinLimitReached = otherPinnedCount >= 5;

  const issueChapterCode = async () => {
    if (!chapter || issuing) return;
    setIssuing(true);
    setIssuedCode(null);
    try {
      const result = await apiFetch<{ code: string }>(
        "/api/gallery/invites",
        {
          method: "POST",
          body: JSON.stringify({
            resource_type: "chapter",
            resource_id: chapter.id,
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) {
      notify("error", "챕터 제목을 입력해주세요.");
      return;
    }

    setSaving(true);
    try {
      const resolvedBody = await (editorRef.current?.resolveImages(body) ??
        Promise.resolve(body));
      setBody(resolvedBody);
      const plainBody = resolvedBody.replace(/<[^>]*>/g, "").trim();
      const nextBody =
        plainBody || /<img\b/i.test(resolvedBody) ? resolvedBody : null;
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

      if (isNew) {
        const created = await apiFetch<ChapterItem>("/api/chapters", {
          method: "POST",
          body: JSON.stringify({
            book_id: nextBookId,
            title: nextTitle,
            subtitle: subtitle.trim() || null,
            body: nextBody,
            tags: parseTags(tagsInput),
            order,
            visible,
            pinned,
            protected: chapterProtected,
            published_at: publishedAtValue,
            toc_parent_id: tocParentId,
          }),
        });
        await deleteDraft();
        window.sessionStorage.setItem(CHAPTER_SAVED_NOTICE_KEY, "1");
        router.replace(
          `/admin/books/${created.book_id}/chapters/${created.id}`,
        );
        return;
      }

      if (chapter) {
        const updated = await apiFetch<ChapterItem>(
          `/api/chapters/${chapter.id}`,
          {
            method: "PUT",
            body: JSON.stringify({
              book_id: nextBookId,
              title: nextTitle,
              subtitle: subtitle.trim() || null,
              body: nextBody,
              tags: parseTags(tagsInput),
              order,
              visible,
              protected: chapterProtected,
              published_at: publishedAtValue,
              toc_parent_id: tocParentId,
            }),
          },
        );
        await deleteDraft();

        const nextTagsInput = (updated.tags ?? []).join(", ");
        const nextPublishedAt = toDatetimeLocal(updated.published_at);
        setChapter(updated);
        setAllChapters((items) =>
          items.map((item) => (item.id === updated.id ? updated : item)),
        );
        setTitle(updated.title);
        setSubtitle(updated.subtitle ?? "");
        setBody(updated.body ?? "");
        setTagsInput(nextTagsInput);
        setVisible(updated.visible !== false);
        setPinned(updated.pinned === true);
        setChapterProtected(updated.protected === true);
        setPublishedAt(nextPublishedAt);
        setTargetBookId(updated.book_id);
        lastSavedSignatureRef.current = getDraftSignature({
          title: updated.title,
          subtitle: updated.subtitle ?? "",
          body: updated.body ?? "",
          tagsInput: nextTagsInput,
          visible: updated.visible !== false,
          pinned: updated.pinned === true,
          publishedAt: nextPublishedAt,
          targetBookId: updated.book_id,
        });
        notify("success", "저장했습니다.");
      }
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

  const draftModalData = draftViewOpen ? savedDraft : availableDraft;
  const draftModalOpen =
    draftModalData !== null && (draftViewOpen || draftPreviewOpen);

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
              onClick={handleOpenDraftPreview}
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
            <button
              type="button"
              className="admin-button danger"
              onClick={handleDeleteDraft}
              disabled={draftDeleting}
            >
              {draftDeleting ? "삭제 중..." : "삭제"}
            </button>
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
                <div className="admin-books-draft-status">
                  <p className="admin-books-hint">
                    임시저장 {formatDateTime(draftSavedAt)}
                  </p>
                  <button
                    type="button"
                    className="admin-button"
                    onClick={() => setDraftViewOpen(true)}
                    disabled={
                      !savedDraft ||
                      draftDeleting ||
                      draftSaving ||
                      saving
                    }
                  >
                    내용 보기
                  </button>
                  <button
                    type="button"
                    className="admin-button danger"
                    onClick={handleDeleteDraft}
                    disabled={draftDeleting || draftSaving || saving}
                  >
                    {draftDeleting ? "삭제 중..." : "임시저장 삭제"}
                  </button>
                </div>
              ) : null}
            </div>
            <div className="admin-books-actions">
              <button
                type="button"
                className="admin-button"
                onClick={handleOpenViewPreview}
              >
                미리보기
              </button>
            </div>
          </header>

          <section className="admin-books-panel">
            <form
              className="admin-books-edit-form"
              onSubmit={handleSubmit}
            >
              <div className="admin-field admin-field--inline-book">
                <span>소속 책</span>
                <div className="admin-field__inline-controls">
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
                  <button
                    type="button"
                    className="admin-button"
                    onClick={() => setTocModalOpen(true)}
                  >
                    목차 위치
                  </button>
                </div>
              </div>
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
                  ref={editorRef}
                  value={body}
                  onChange={setBody}
                  placeholder="챕터 본문을 입력해주세요."
                  uploadUrl="/api/chapters/upload"
                  onNotice={(notice) => notify(notice.type, notice.text)}
                  enableFontSize
                  enableHighlight
                  variant="chapter"
                />
              </div>
              <label className="admin-field">
                <span>태그</span>
                <TagInput
                  value={tagsInput}
                  onChange={setTagsInput}
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
              <div className="admin-books-access">
                <label className="admin-books-checkbox">
                  <span>공개 상태</span>
                  <select
                    value={
                      !visible
                        ? "private"
                        : chapterProtected
                          ? "protected"
                          : "public"
                    }
                    onChange={(event) => {
                      const value = event.target.value;
                      setVisible(value !== "private");
                      setChapterProtected(value === "protected");
                    }}
                  >
                    <option value="public">공개</option>
                    <option value="protected">보호</option>
                    <option value="private">비공개</option>
                  </select>
                </label>
                {!isNew && visible && chapterProtected ? (
                  <div className="admin-books-code">
                    <button
                      type="button"
                      className="admin-button"
                      onClick={() => void issueChapterCode()}
                      disabled={issuing}
                    >
                      {issuing ? "발급 중..." : "열람 코드 발급"}
                    </button>
                    {issuedCode ? <code>{issuedCode}</code> : null}
                  </div>
                ) : null}
              </div>
              <label className="admin-books-checkbox">
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={(event) => setPinned(event.target.checked)}
                  disabled={pinLimitReached && !pinned}
                />
                <span>목차 상단 고정</span>
              </label>
              <p className="admin-books-hint">
                고정 게시글은 책당 최대 5개까지 가능합니다.
                {pinLimitReached && !pinned
                  ? " 이 책에는 이미 5개가 고정되어 있습니다."
                  : ""}
              </p>
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

      {draftModalOpen ? (
        <div
          className="admin-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDraftPreviewOpen(false);
              setDraftViewOpen(false);
            }
          }}
        >
          <div
            className="admin-modal admin-books-draft-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chapter-draft-preview-title"
          >
            <header className="admin-modal-header">
              <h2 id="chapter-draft-preview-title">
                {draftViewOpen
                  ? "임시저장본 내용"
                  : "임시저장본 확인"}
              </h2>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => {
                  setDraftPreviewOpen(false);
                  setDraftViewOpen(false);
                }}
                aria-label="닫기"
              >
                ×
              </button>
            </header>
            <div className="admin-modal-body">
              <div className="admin-books-draft-preview-heading">
                <strong>
                  {draftModalData?.title || "제목 없음"}
                </strong>
                <p>
                  {draftModalData
                    ? `${formatDateTime(
                        draftModalData.updated_at,
                      )}에 저장된 임시저장본`
                    : ""}
                </p>
              </div>
              <p className="admin-books-hint">
                {draftViewOpen
                  ? "현재 편집 중인 내용과 별개로 저장된 임시저장본입니다."
                  : "불러오면 현재 작성 중인 내용이 아래 임시저장본으로 덮어써집니다."}
              </p>
              <div className="admin-books-draft-preview">
                {draftModalData?.body ? (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: draftModalData.body,
                    }}
                  />
                ) : (
                  <p className="admin-books-draft-preview-empty">
                    본문이 비어 있습니다.
                  </p>
                )}
              </div>
            </div>
            <footer className="admin-modal-footer">
              <button
                type="button"
                className="admin-button"
                onClick={() => {
                  setDraftPreviewOpen(false);
                  setDraftViewOpen(false);
                }}
              >
                {draftViewOpen ? "닫기" : "취소"}
              </button>
              <button
                type="button"
                className="admin-button danger"
                onClick={handleDeleteDraft}
                disabled={draftDeleting}
              >
                {draftDeleting ? "삭제 중..." : "삭제"}
              </button>
              {!draftViewOpen ? (
                <button
                  type="button"
                  className="admin-button primary"
                  onClick={handleApplyDraft}
                >
                  이 내용 불러오기
                </button>
              ) : null}
            </footer>
          </div>
        </div>
      ) : null}

      {tocModalOpen ? (
        <div
          className="admin-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setTocModalOpen(false);
          }}
        >
          <div
            className="admin-modal admin-books-toc-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chapter-toc-modal-title"
          >
            <header className="admin-modal-header">
              <h2 id="chapter-toc-modal-title">공개 목차 위치</h2>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setTocModalOpen(false)}
                aria-label="닫기"
              >
                ×
              </button>
            </header>
            <div className="admin-modal-body">
              <TocManager
                bookId={targetBookId}
                chapters={allChapters.filter(
                  (item) => item.book_id === targetBookId,
                )}
                notify={notify}
                title="공개 목차 위치"
                collapsible={false}
                selectedChapterId={isNew ? null : chapter?.id ?? null}
                selectedParentId={tocParentId}
                onSelectParent={setTocParentId}
              />
            </div>
            <footer className="admin-modal-footer">
              <button
                type="button"
                className="admin-button primary"
                onClick={() => setTocModalOpen(false)}
              >
                확인
              </button>
            </footer>
          </div>
        </div>
      ) : null}

    </div>
  );
}
