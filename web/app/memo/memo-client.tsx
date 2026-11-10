"use client";

import {
  Fragment,
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Pagination } from "@/components/pagination";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { linkifyParts } from "@/lib/linkify";

import "@/public/styles/memo.scss";

const MEMOS_PER_PAGE = 20;
const MEMO_REFRESH_INTERVAL_MS = 60_000;

interface Memo {
  id: number;
  content: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

function sortMemos(items: Memo[]) {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.id - a.id;
  });
}

function resizeTextarea(element: HTMLTextAreaElement | null) {
  if (!element) return;

  const maxHeight = 144;
  element.style.height = "auto";
  element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`;
  element.style.overflowY =
    element.scrollHeight > maxHeight ? "auto" : "hidden";
}

export default function MemoClient({ username }: { username: string }) {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [page, setPage] = useState(1);
  const newMemoRef = useRef<HTMLTextAreaElement>(null);
  const editMemoRef = useRef<HTMLTextAreaElement>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [pinningId, setPinningId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiFetch<Memo[]>("/api/memos", { cache: "no-store" })
      .then((data) => {
        if (!cancelled) setMemos(sortMemos(data));
      })
      .catch((reason) => {
        if (cancelled) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "주석을 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading) return;

    const refresh = () => {
      if (document.visibilityState === "hidden") return;

      apiFetch<Memo[]>("/api/memos", { cache: "no-store" })
        .then((data) => setMemos(sortMemos(data)))
        .catch(() => {
          // A transient refresh failure should not clear the current list.
        });
    };

    const timer = window.setInterval(
      refresh,
      MEMO_REFRESH_INTERVAL_MS,
    );
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loading]);

  useEffect(() => {
    resizeTextarea(newMemoRef.current);
  }, [newContent]);

  useEffect(() => {
    resizeTextarea(editMemoRef.current);
  }, [editContent, editingId]);

  const handleMemoKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.nativeEvent.isComposing) return;

    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const totalPages = Math.max(1, Math.ceil(memos.length / MEMOS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const visibleMemos = useMemo(
    () =>
      memos.slice(
        (currentPage - 1) * MEMOS_PER_PAGE,
        currentPage * MEMOS_PER_PAGE,
      ),
    [currentPage, memos],
  );

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!newContent.trim() || creating) return;

    setCreating(true);
    setError(null);

    try {
      const data = await apiFetch<Memo>("/api/memos", {
        method: "POST",
        body: JSON.stringify({ content: newContent }),
      });
      setMemos((previous) => sortMemos([data, ...previous]));
      setNewContent("");
      setPage(1);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "주석을 추가하지 못했습니다.",
      );
    } finally {
      setCreating(false);
    }
  };

  const startEditing = (memo: Memo) => {
    setEditingId(memo.id);
    setEditContent(memo.content);
    setError(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditContent("");
  };

  const handleUpdate = async (
    event: FormEvent<HTMLFormElement>,
    memoId: number,
  ) => {
    event.preventDefault();

    if (!editContent.trim() || savingId !== null) return;

    setSavingId(memoId);
    setError(null);

    try {
      const data = await apiFetch<Memo>(`/api/memos/${memoId}`, {
        method: "PUT",
        body: JSON.stringify({ content: editContent }),
      });
      setMemos((previous) =>
        sortMemos(
          previous.map((memo) => (memo.id === memoId ? data : memo)),
        ),
      );
      setEditingId(null);
      setEditContent("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "주석을 수정하지 못했습니다.",
      );
    } finally {
      setSavingId(null);
    }
  };

  const handleTogglePin = async (memo: Memo) => {
    if (pinningId !== null) return;

    setPinningId(memo.id);
    setError(null);

    try {
      const data = await apiFetch<Memo>(`/api/memos/${memo.id}`, {
        method: "PUT",
        body: JSON.stringify({ pinned: !memo.pinned }),
      });
      setMemos((previous) =>
        sortMemos(
          previous.map((item) => (item.id === memo.id ? data : item)),
        ),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "주석 고정 상태를 변경하지 못했습니다.",
      );
    } finally {
      setPinningId(null);
    }
  };

  const handleDelete = async (memo: Memo) => {
    if (
      deletingId !== null ||
      !window.confirm("이 주석을 삭제할까요?")
    ) {
      return;
    }

    setDeletingId(memo.id);
    setError(null);

    try {
      await apiFetch(`/api/memos/${memo.id}`, { method: "DELETE" });
      setMemos((previous) => previous.filter((item) => item.id !== memo.id));
      if (editingId === memo.id) {
        setEditingId(null);
        setEditContent("");
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "주석을 삭제하지 못했습니다.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div id="memo-page">
      <main>
        {loading ? (
          <p className="memo-status">불러오는 중...</p>
        ) : (
          <>
            <form className="memo-form" onSubmit={handleCreate}>
              <div className="memo-input-row">
                <textarea
                  id="memo-new-content"
                  ref={newMemoRef}
                  rows={1}
                  value={newContent}
                  maxLength={500}
                  placeholder="오늘의 한 줄을 남겨보세요."
                  autoComplete="off"
                  onKeyDown={handleMemoKeyDown}
                  onChange={(event) => {
                    setNewContent(event.target.value);
                  }}
                />
                <button
                  className="memo-primary"
                  type="submit"
                  disabled={creating || !newContent.trim()}
                >
                  {creating ? "추가 중..." : "추가"}
                </button>
              </div>
            </form>
            {error ? <p className="memo-error">{error}</p> : null}
            <div className="memo-divider" aria-hidden="true" />
            <section className="memo-list-section">
              {memos.length === 0 ? (
                <p className="memo-status">
                  {username} 계정의 기록이 없습니다.
                </p>
              ) : (
                <ul className="memo-list">
                  {visibleMemos.map((memo) => (
                    <li className="memo-item" key={memo.id}>
                      {editingId === memo.id ? (
                        <form
                          className="memo-edit-form"
                          onSubmit={(event) => handleUpdate(event, memo.id)}
                        >
                          <textarea
                            ref={editMemoRef}
                            rows={1}
                            value={editContent}
                            maxLength={500}
                            autoFocus
                            autoComplete="off"
                            aria-label="주석 수정"
                            onKeyDown={handleMemoKeyDown}
                            onChange={(event) => {
                              setEditContent(event.target.value);
                            }}
                          />
                          <div className="memo-item-actions">
                            <button
                              className="memo-text-button"
                              type="button"
                              onClick={cancelEditing}
                            >
                              취소
                            </button>
                            <button
                              className="memo-text-button is-accent"
                              type="submit"
                              disabled={
                                savingId !== null || !editContent.trim()
                              }
                            >
                              {savingId === memo.id ? "저장 중..." : "저장"}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div
                          className={`memo-row${memo.pinned ? " is-pinned" : ""}`}
                        >
                          <p className="memo-content" title={memo.content}>
                            {linkifyParts(memo.content).map((part, index) =>
                              part.href ? (
                                <a
                                  key={`${part.href}-${index}`}
                                  href={part.href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {part.text}
                                </a>
                              ) : (
                                <Fragment key={index}>{part.text}</Fragment>
                              ),
                            )}
                          </p>
                          <div className="memo-meta">
                            <div className="memo-item-actions">
                              <button
                                className={`memo-text-button is-pin${
                                  memo.pinned ? " is-active" : ""
                                }`}
                                type="button"
                                aria-pressed={memo.pinned}
                                disabled={pinningId !== null}
                                title={
                                  memo.pinned
                                    ? "고정을 해제하면 24시간 뒤 사라집니다."
                                    : "고정하면 계속 보관됩니다."
                                }
                                onClick={() => handleTogglePin(memo)}
                              >
                                {pinningId === memo.id
                                  ? "변경 중..."
                                  : memo.pinned
                                    ? "고정 해제"
                                    : "고정"}
                              </button>
                              <button
                                className="memo-text-button"
                                type="button"
                                onClick={() => startEditing(memo)}
                              >
                                수정
                              </button>
                              <button
                                className="memo-text-button is-danger"
                                type="button"
                                disabled={deletingId !== null}
                                onClick={() => handleDelete(memo)}
                              >
                                {deletingId === memo.id
                                  ? "삭제 중..."
                                  : "삭제"}
                              </button>
                            </div>
                            <span
                              className="memo-item-time"
                              title={`작성 ${formatDateTime(memo.created_at)}${
                                memo.updated_at !== memo.created_at
                                  ? ` · 수정 ${formatDateTime(memo.updated_at)}`
                                  : ""
                              }`}
                            >
                              {formatDateTime(memo.updated_at)}
                            </span>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <Pagination
              page={currentPage}
              totalPages={totalPages}
              onChange={setPage}
            />
          </>
        )}
      </main>
    </div>
  );
}
