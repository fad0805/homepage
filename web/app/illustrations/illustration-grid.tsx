"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";

import { formatDate } from "@/lib/datetime";

export interface IllustrationCardItem {
  id: number;
  title: string;
  author_nickname: string | null;
  taken_at: string | null;
  representative_url: string | null;
  image_count: number;
  visible: boolean;
  protected: boolean;
}

export function IllustrationGrid({
  items,
  unlockedIds,
  showAuthor = true,
}: {
  items: IllustrationCardItem[];
  unlockedIds: number[] | null;
  /** Per-author pages should hide the author name. */
  showAuthor?: boolean;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [unlockItem, setUnlockItem] =
    useState<IllustrationCardItem | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!unlockItem) return;

    setCode("");
    setError(null);
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 0);
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setUnlockItem(null);
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [unlockItem]);

  const isUnlocked = (illustrationId: number) =>
    unlockedIds === null || unlockedIds.includes(illustrationId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!unlockItem || loading) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/gallery/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code }),
      });
      const data = (await response.json()) as {
        detail?: unknown;
        resource?: { type?: unknown; id?: unknown };
      };

      if (!response.ok) {
        setError(
          typeof data.detail === "string"
            ? data.detail
            : "비밀번호가 올바르지 않거나 만료되었습니다.",
        );
        return;
      }

      const resource = data.resource;
      let target = `/illustrations/${unlockItem.id}`;
      if (
        resource?.type === "illustration" &&
        typeof resource.id === "number"
      ) {
        target = `/illustrations/${resource.id}`;
      } else if (
        resource?.type === "chapter" &&
        typeof resource.id === "number"
      ) {
        target = `/books?chapter=${resource.id}`;
      } else if (
        resource?.type === "book" &&
        typeof resource.id === "number"
      ) {
        target = `/books?book=${resource.id}`;
      }

      setUnlockItem(null);
      router.push(target);
    } catch {
      setError("요청에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="illustrations-grid">
        {items.map((item) => {
          const locked = item.protected && !isUnlocked(item.id);

          return (
            <article className="illustration-card" key={item.id}>
              <Link
                className="illustration-card__link"
                href={`/illustrations/${item.id}`}
                onClick={
                  locked
                    ? (event) => {
                        event.preventDefault();
                        setUnlockItem(item);
                      }
                    : undefined
                }
              >
                <div className="illustration-card__thumb">
                  {item.representative_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.representative_url}
                      alt={item.title}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span className="illustration-card__empty">
                      이미지 없음
                    </span>
                  )}
                  {item.image_count > 1 ? (
                    <span className="illustration-card__count">
                      {item.image_count}장
                    </span>
                  ) : null}
                  {item.visible === false ? (
                    <span className="illustration-card__private">
                      비공개
                    </span>
                  ) : null}
                  {item.visible !== false && item.protected ? (
                    <span className="illustration-card__protected">
                      보호
                    </span>
                  ) : null}
                </div>
                <div className="illustration-card__body">
                  {showAuthor && item.author_nickname ? (
                    <p className="illustration-card__author">
                      {item.author_nickname}
                    </p>
                  ) : null}
                  <p className="illustration-card__title">{item.title}</p>
                  <p className="illustration-card__meta">
                    촬영 {formatDate(item.taken_at)}
                  </p>
                </div>
              </Link>
            </article>
          );
        })}
      </div>

      {unlockItem && mounted
        ? createPortal(
            <div
              className="illustration-unlock-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  setUnlockItem(null);
                }
              }}
            >
              <div
                className="illustration-unlock-modal"
                role="dialog"
                aria-modal="true"
                aria-label="삽화 열람 비밀번호"
              >
                <header>
                  <h2>{unlockItem.title}</h2>
                  <button
                    type="button"
                    className="illustration-unlock-close"
                    aria-label="닫기"
                    onClick={() => setUnlockItem(null)}
                  >
                    ×
                  </button>
                </header>
                <p>이 삽화는 열람 비밀번호가 필요합니다.</p>
                <form onSubmit={handleSubmit}>
                  <input
                    ref={inputRef}
                    type="text"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="XXXX-XXXX-XXXX"
                    autoComplete="one-time-code"
                    autoCapitalize="characters"
                    spellCheck={false}
                    required
                  />
                  {error ? (
                    <p className="illustration-unlock-error">{error}</p>
                  ) : null}
                  <div className="illustration-unlock-actions">
                    <button
                      type="button"
                      onClick={() => setUnlockItem(null)}
                      disabled={loading}
                    >
                      취소
                    </button>
                    <button type="submit" disabled={loading}>
                      {loading ? "확인 중..." : "입장"}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
