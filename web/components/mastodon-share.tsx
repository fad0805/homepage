"use client";

import { useEffect, useState } from "react";

interface MastodonShareProps {
  title: string;
  bookTitle: string;
  bookId: number;
  chapterId: number;
  triggerClassName?: string;
}

const STORAGE_KEY = "missing-island-mastodon-instance";

function normalizeInstance(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

export function MastodonShare({
  title,
  bookTitle,
  bookId,
  chapterId,
  triggerClassName = "mastodon-share__trigger",
}: MastodonShareProps) {
  const [open, setOpen] = useState(false);
  const [instance, setInstance] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const openShare = () => {
    const saved = window.localStorage.getItem(STORAGE_KEY) ?? "";
    const url = new URL(
      `/books?book=${bookId}&chapter=${chapterId}`,
      window.location.origin,
    ).toString();

    setInstance(saved);
    setText(`${title} — ${bookTitle}\n${url}`);
    setError("");
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleShare = () => {
    const host = normalizeInstance(instance);
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) {
      setError("인스턴스 주소를 확인해주세요. 예: mastodon.social");
      return;
    }
    if (!text.trim()) {
      setError("공유할 내용을 입력해주세요.");
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, host);
    window.open(
      `https://${host}/share?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer",
    );
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        onClick={openShare}
      >
        공유
      </button>

      {open ? (
        <div
          className="mastodon-share-modal"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setOpen(false);
            }
          }}
        >
          <div
            className="mastodon-share-modal__dialog"
            role="dialog"
            aria-modal="true"
            aria-label="마스토돈에 공유"
          >
            <header className="mastodon-share-modal__header">
              <h2>마스토돈에 공유</h2>
              <button
                type="button"
                className="mastodon-share-modal__close"
                onClick={() => setOpen(false)}
                aria-label="닫기"
              >
                ×
              </button>
            </header>

            <div className="mastodon-share-modal__body">
              <label className="mastodon-share-modal__field">
                <span>마스토돈 인스턴스</span>
                <input
                  value={instance}
                  onChange={(event) => {
                    setInstance(event.target.value);
                    setError("");
                  }}
                  placeholder="예: mastodon.social"
                  autoFocus
                />
              </label>
              <p className="mastodon-share-modal__hint">
                인스턴스 주소는 이 브라우저에 저장됩니다.
              </p>

              <label className="mastodon-share-modal__field">
                <span>공유할 내용</span>
                <textarea
                  value={text}
                  onChange={(event) => {
                    setText(event.target.value);
                    setError("");
                  }}
                  rows={4}
                />
              </label>

              {error ? (
                <p className="mastodon-share-modal__error">{error}</p>
              ) : null}
            </div>

            <footer className="mastodon-share-modal__footer">
              <button
                type="button"
                className="mastodon-share-modal__button"
                onClick={() => setOpen(false)}
              >
                취소
              </button>
              <button
                type="button"
                className="mastodon-share-modal__button primary"
                onClick={handleShare}
              >
                공유하기
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
